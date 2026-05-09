import { Request, Response } from "express";
import Facturacion from "./mapfreEspana.model";
import { uploadToS3 } from "../../../services/uploadToS3";
import {
  LineaMapfreEspana,
  ResultadoMapfreEspana,
} from "./mapfreEspana.types";
import {
  parseMapfreEspanaFromText,
  extraerLiquidoOficialMapfreEspana,
  extraerDatosFacturaMapfreEspana,
  calcularTotalesProduccionMapfreEspana,
} from "./mapfreEspana.parser";
import { agruparFilas, parseFila } from "./mapfreEspana.filas";

/* =====================================================
   🔎 DEBUG CONCEPTOS RESUMEN
===================================================== */

function debugConcepto(text: string, concepto: string): number {

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {

    const line = rawLine.toUpperCase();

    if (line.includes(concepto)) {

      const importes = line.match(/-?\d[\d\.]*,\d{2}/g);

      if (!importes || importes.length === 0) return 0;

      const ultimo = importes[importes.length - 1];

      return parseFloat(
        ultimo.replace(/\./g, "").replace(",", ".")
      );
    }
  }

  return 0;
}

/* =====================================================
   🔥 EXTRAER INCENTIVOS (QUIRÚRGICO)
===================================================== */

function extraerIncentivos(text: string): number {

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {

    const line = rawLine.toUpperCase();

    if (line.includes("INCENTIVOS FIJOS")) {

      const match = line.match(/(\d+,\d{2})/);

      if (!match) return 0;

      let numeroCompleto = match[1]; 
      // Ej: "202601780,00"

      // 🔥 Nos quedamos solo con lo que está justo antes de la coma
      const partes = numeroCompleto.split(",");

      let parteEntera = partes[0]; 
      // "202601780"

      // 🔥 El importe real son los últimos 3 dígitos
      const importeReal = parteEntera.slice(-3) + "," + partes[1];

      return parseFloat(
        importeReal.replace(",", ".")
      );
    }
  }

  return 0;
}


/* =====================================================
   🔥 OPERACIONES BANCARIAS
===================================================== */
function extraerOperacionesBancarias(text: string): number {

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {

    const line = rawLine.toUpperCase();

    if (line.includes("TOTAL OPERACIONES BANCARIAS NO SEGURO")) {

      const match = line.match(/(\d+,\d{2})/);

      if (!match) return 0;

      return parseFloat(
        match[1].replace(",", ".")
      );
    }
  }

  return 0;
}

/* =====================================================
   🔥 EXTRAER COMISIONES NO SEGURO
===================================================== */

function extraerComisionesNoSeguro(text: string): number {

  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {

    const rawLine = lines[i];

    const line = rawLine
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

    const compact = line.replace(/[^A-Z0-9]/g, "");

    if (
      line.includes("NO SEGURO") ||
      compact.includes("NOSEGURO")
    ) {

      const bloque = lines.slice(Math.max(0, i - 2), i + 8).join(" ");

      const importes = bloque.match(/-?\d[\d\.]*,\d{2}/g);

      if (!importes || importes.length === 0) continue;

      const valores = importes
        .map(n => parseFloat(n.replace(/\./g, "").replace(",", ".")))
        .filter(n => !isNaN(n) && n !== 0);

      if (valores.length === 0) continue;

      return valores[valores.length - 1];
    }
  }

  return 0;
}

function extraerMultimap(text: string): number {

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {

    const line = rawLine.toUpperCase();

    if (line.includes("COMISIONES MULTIMAP")) {

      const match = rawLine.match(/-?\d[\d\.]*,\d{2}/);

      if (!match) return 0;

      return parseFloat(
        match[0].replace(/\./g, "").replace(",", ".")
      );
    }
  }

  return 0;
}

function extraerSecuritasDirect(text: string): number {

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {

    const line = rawLine.toUpperCase();

    if (line.includes("COMISIONES SECURITAS DIRECT")) {

      const match = rawLine.match(/-?\d[\d\.]*,\d{2}/);

      if (!match) return 0;

      return parseFloat(
        match[0].replace(/\./g, "").replace(",", ".")
      );
    }
  }

  return 0;
}

function extraerOtrasComisionesSistemaCompensacion(text: string): number {

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {

    const line = rawLine.toUpperCase();

    if (
      line.includes("OTRAS COMISIONES") &&
      line.includes("COMPENSACION")
    ) {

      const match = rawLine.match(/-?\d[\d\.]*,\d{2}/);

      if (!match) return 0;

      return parseFloat(
        match[0].replace(/\./g, "").replace(",", ".")
      );
    }
  }

  return 0;
}

/* =====================================================
   🔥 EXTRAER LÍNEAS DE DATOS OFICINAS DELEGADAS
===================================================== */

function extraerLineasDelegadas(text: string): number {

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {

    const line = rawLine
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

    // 🔥 Solo buscamos OFICINAS + DELEG
    if (line.includes("OFICINAS") && line.includes("DELEG")) {

      const importes = rawLine.match(/-?\d[\d\.]*,\d{2}/g);

      if (!importes || importes.length === 0) return 0;

      const ultimo = importes[importes.length - 1];

      return parseFloat(
        ultimo.replace(/\./g, "").replace(",", ".")
      );
    }
  }

  return 0;
}

function extraerExtornoImporteLiquido(text: string): number {

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {

    const line = rawLine.toUpperCase();

    if (line.includes("IMPORTE LIQUIDO")) {

      const importes = line.match(/-?\d[\d\.]*,\d{2}/g);

      if (!importes || importes.length < 2) return 0;

      // Segundo importe = columna EXTORNOS
      const extorno = importes[1];

      return parseFloat(
        extorno.replace(/\./g, "").replace(",", ".")
      );
    }
  }

  return 0;
}


/* =====================================================
   🔥 EXTRAER OTROS GASTOS TRIBUTABLES
===================================================== */

function extraerOtrosGastosTributables(text: string): number {

  const regex = /OTROS GASTOS TRIBUTABLES[\s\S]{0,80}?(-?\d[\d\.]*,\d{2})/i;

  const match = text.match(regex);

  if (!match) return 0;

 return parseFloat(
  match[1].replace(/\./g, "").replace(",", ".")
);
}

/* =====================================================
   🔥 DEBUG OCR TOTAL (NO TOCAR NADA EXISTENTE)
===================================================== */

function extraerTodoOCR(text: string) {

  const cleanText = text
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();

  const lineas = cleanText.split(/\r?\n/);

  const palabras = cleanText.split(/\s+/);

  // 🔥 TODOS los números tipo factura (1.234,56)
  const numeros = cleanText.match(/-?\d[\d\.]*,\d{2}/g) || [];

  // 🔥 números sin formato (por OCR roto)
  const numerosRotos = cleanText.match(/\d{5,}/g) || [];

  const numerosConContexto: any[] = [];

  for (let i = 0; i < lineas.length; i++) {

    const matches = lineas[i].match(/-?\d[\d\.]*,\d{2}/g);

    if (matches) {
      matches.forEach((num) => {
        numerosConContexto.push({
          numero: num,
          linea: lineas[i],
          index: i,
          anterior: lineas[i - 1] || null,
          siguiente: lineas[i + 1] || null,
        });
      });
    }
  }

  // 🔥 líneas con muchos números (probables tablas)
  const posiblesTablas = lineas.filter((l) => {
    const matches = l.match(/-?\d[\d\.]*,\d{2}/g);
    return matches && matches.length >= 3;
  });

  // 🔥 mapa completo de líneas con info
  const lineasDetalladas = lineas.map((l, i) => ({
    index: i,
    texto: l,
    numeros: l.match(/-?\d[\d\.]*,\d{2}/g) || [],
    cantidadNumeros: (l.match(/-?\d[\d\.]*,\d{2}/g) || []).length,
  }));

  return {
    rawText: text,
    cleanText,

    estadisticas: {
      totalLineas: lineas.length,
      totalPalabras: palabras.length,
      totalNumeros: numeros.length,
      numerosRotos: numerosRotos.length,
    },

    palabras,

    lineas,
    lineasDetalladas,

    numeros,
    numerosRotos,
    numerosConContexto,

    posiblesTablas,
  };
}




/* =====================================================
   FUNCIÓN DE CÁLCULO
===================================================== */

export function calcularMapfreEspana(
  rows: LineaMapfreEspana[],
  liquidoOficial?: number | null
): ResultadoMapfreEspana {

  let abonosInternos = 0;
  let extornos = 0;

  rows.forEach((row) => {
    const tieneTomador =
      row.tomador && row.tomador.trim() !== "";

    const esProduccion =
      row.tipoProduccion === "N" ||
      row.tipoProduccion === "C";

    if (!tieneTomador || !esProduccion) return;

    const comision = row.comision;
    if (typeof comision !== "number") return;

    if (comision > 0) abonosInternos += comision;
    if (comision < 0) extornos += Math.abs(comision);
  });

  const base = abonosInternos - extornos;

  const irpf = Number((base * 0.15).toFixed(2));
  const liquidoCalculado = Number((base - irpf).toFixed(2));

  let liquidoFinal = liquidoCalculado;
  let diferencia = 0;
  let usandoLiquidoOficial = false;

  if (typeof liquidoOficial === "number") {
    diferencia = Number(
      (liquidoOficial - liquidoCalculado).toFixed(2)
    );

    if (Math.abs(diferencia) <= 0.02) {
      liquidoFinal = liquidoOficial;
      usandoLiquidoOficial = true;
    }
  }

  return {
    extornos: Number(extornos.toFixed(2)),
    base: Number(base.toFixed(2)),
    irpf,
    compensaciones: 0,
    otrosGastos: 0,

    incentivos: 0,
    rappeles: 0,
    otrasContraprestaciones: 0,
    traspaso: 0,

    liquido: Number(liquidoFinal.toFixed(2)),
    liquidoCalculado,
    liquidoOficial: liquidoOficial ?? null,
    diferencia,
    usandoLiquidoOficial,
  };
}

/* =====================================================
   RASTREO INTELIGENTE
===================================================== */
function extraerDesgloseResumenInteligente(text: string) {
  const lineas = text.split(/\r?\n/);

  const resultado = {
    sistemaCompensacion: [] as { concepto: string; importe: number }[],
    incentivos: [] as { concepto: string; importe: number }[],
    rappeles: [] as { concepto: string; importe: number }[],
    otrasContraprestaciones: [] as { concepto: string; importe: number }[],
  };

  const limpiarConcepto = (concepto: string) =>
    concepto
      .replace(/-?\d[\d\.]*,\d{2}/g, "")
      .replace(/\s+/g, " ")
      .trim();

  for (const rawLine of lineas) {
    const concepto = rawLine.replace(/\s+/g, " ").trim();
    if (!concepto) continue;

    const line = concepto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

    const importes = concepto.match(/-?\d[\d\.]*,\d{2}/g);
    if (!importes || importes.length === 0) continue;

    const importe = parseFloat(
      importes[importes.length - 1]
        .replace(/\./g, "")
        .replace(",", ".")
    );

    if (!importe || isNaN(importe)) continue;

    const item = {
      concepto: limpiarConcepto(concepto),
      importe,
    };

    if (
      line.includes("OTRAS COMISIONES") &&
      line.includes("COMPENSACION")
    ) {
      resultado.sistemaCompensacion.push(item);
      continue;
    }

    if (
      line.includes("INCENTIVACION") &&
      line.includes("RECUPERACION") &&
      line.includes("POLIZAS")
    ) {
      resultado.sistemaCompensacion.push(item);
      continue;
    }

    if (line.includes("INCENTIVO")) {
      resultado.incentivos.push(item);
      continue;
    }

    if (line.includes("RAPPEL")) {
      resultado.rappeles.push(item);
      continue;
    }

    if (line.includes("CONTRAPREST")) {
      resultado.otrasContraprestaciones.push(item);
      continue;
    }
  }

  return resultado;
}

/* =====================================================
   SERVICE MAPFRE ESPAÑA
===================================================== */

export const procesarMapfreEspanaService = async (
  text: string,
  req: Request,
  res: Response
) => {

  console.log("🟢 ENTRA EN MAPFRE ESPAÑA SERVICE");

  try {

    const logs: string[] = [];
    const addLog = (msg: string) => logs.push(msg);
    const addLogImporte = (label: string, value: number | null | undefined) => {
  if (typeof value !== "number") return;
  if (value === 0) return;

  addLog(`${label}: ${value.toFixed(2)} €`);
};
    const usuarioId = (req as any).user?.id;
    const hash = (req as any).fileHash;
    const resultadoPython = (req as any).resultadoPython;

    if (!usuarioId) {
      if (!req.file) {
  return res.status(400).json({
    error: "No se ha enviado archivo"
  });
}
      return res.status(401).json({
        error: "Usuario no autenticado",
      });
    }

    const cleanText = text
  .replace(/\r/g, "")
  .replace(/\t/g, " ")
  .replace(/[ ]{2,}/g, " ")
  .trim();

// 👇 JUSTO AQUÍ
const debugOCR = extraerTodoOCR(cleanText);

    const datosFactura =
      extraerDatosFacturaMapfreEspana(cleanText);


      if (!datosFactura) {
  return res.status(400).json({
    error: "No se pudieron extraer datos de la factura"
  });
}
/* =====================================================
   🔥 FILAS / ROWS — PYTHON PRIMERO, PARSER ANTIGUO COMO FALLBACK
===================================================== */

let rows: LineaMapfreEspana[] = [];

if (
  resultadoPython?.ok &&
  Array.isArray(resultadoPython.rows) &&
  resultadoPython.rows.length > 0
) {

  console.log("🔥 MAPFRE ESPAÑA USANDO ROWS DE PYTHON");

  rows = resultadoPython.rows.map((r: any) => ({
    tomador: r.tomador || "",
    concepto: r.concepto || "",
    tipoProduccion: r.tipoProduccion,
    comision: Number(r.comision || 0),
  }));

  addLog(`Filas detectadas Python: ${rows.length}`);

} else {

  // 🔥 USAR LÍNEAS REALES DEL OCR (NO APLANAR TEXTO)
  const lineasOCR = cleanText.split(/\r?\n/);

  // 🔍 DEBUG REAL DEL OCR
  console.log("LINEAS OCR SAMPLE:");
  console.log(lineasOCR.slice(0, 20));

  // 🔥 AGRUPAR FILAS BASADO EN PÓLIZA
  const filasRaw: string[] = [];
  let buffer = "";

  for (const linea of lineasOCR) {

    const limpia = linea.trim();
    if (!limpia) continue;

    const empiezaPorPoliza = /^\d{10,}/.test(limpia);

    if (empiezaPorPoliza) {

      if (buffer) {
        filasRaw.push(buffer.trim());
      }

      buffer = limpia;

    } else {

      if (buffer) {
        buffer += " " + limpia;
      }
    }
  }

  // última fila
  if (buffer) {
    filasRaw.push(buffer.trim());
  }

  // 🔍 DEBUG CLAVE
  console.log("FILAS OCR AGRUPADAS:", filasRaw.slice(0, 5));

  // 🔥 CONVERTIR FILAS A FORMATO PIPE (CLAVE)
  const filasFormateadas: string[] = [];

  for (const fila of filasRaw) {

    const limpia = fila.trim();

    const match = limpia.match(
      /^(\d{13})\s+(.+?)\s+([NC])\s+(\d{2}\/\d{2}\/\d{4})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/
    );

    if (!match) continue;

    const [
      _,
      poliza,
      tomador,
      tipo,
      fecha,
      totalRecibo,
      primaBase,
      porcentaje,
      comision,
    ] = match;

    const filaPipe = [
      poliza,
      tomador.trim(),
      tipo,
      fecha,
      totalRecibo,
      primaBase,
      porcentaje,
      comision,
    ].join(" | ");

    filasFormateadas.push(filaPipe);
  }

  console.log("FILAS PIPE:", filasFormateadas.slice(0, 5));

  // 🔥 AHORA SÍ PARSEAMOS (sobre PIPE, no OCR sucio)
  rows = filasFormateadas
    .map(parseFila)
    .filter((r): r is LineaMapfreEspana => r !== null);

  // 🔍 LOGS
  addLog(`Filas detectadas RAW: ${filasRaw.length}`);
  addLog(`Filas válidas (parser actual): ${rows.length}`);

  // 🔥 FALLBACK OCR (CLAVE)
  if (rows.length === 0) {

    addLog("⚠ Parser clásico falló → usando OCR inteligente");

    rows = parseMapfreEspanaFromText(cleanText);

    addLog(`Filas detectadas OCR: ${rows.length}`);
  }

  addLog(`Filas detectadas RAW: ${filasRaw.length}`);
  addLog(`Filas válidas: ${rows.length}`);
}

// 🚨 SI SIGUE FALLANDO → error real
if (rows.length === 0) {

  addLog("❌ No se han detectado filas válidas ni con Python ni con fallback");

  return res.status(400).json({
    error: "No se pudieron extraer líneas de la factura",
    debugOCR
  });
}


  const liquidoOficial =
  resultadoPython?.resumen?.liquidoOficial ??
  resultadoPython?.resumen?.liquido ??
  extraerLiquidoOficialMapfreEspana(cleanText);

      

      addLog("====================================");
addLog("IMPORTE LIQUIDO EXTRAIDO DEL PDF:");
addLog(
  liquidoOficial !== null && liquidoOficial !== undefined
    ? liquidoOficial.toFixed(2) + " €"
    : "NO ENCONTRADO"
);
addLog("====================================");

    /* ================= EXTRAER DESGLOSE ================= */

   const traspaso =
  resultadoPython?.resumen?.traspaso ??
  debugConcepto(cleanText, "TRASPASO DE COMISIONES");
    const otrosGastos =
  resultadoPython?.resumen?.otrosGastos ??
  debugConcepto(cleanText, "OTROS GASTOS TRIBUTABLES");
    const incentivos =
  resultadoPython?.resumen?.incentivos ??
  extraerIncentivos(cleanText);
    const rappeles =
  resultadoPython?.resumen?.rappeles ??
  debugConcepto(cleanText, "RAPPEL");
    const otrasContraprestaciones =
  resultadoPython?.resumen?.otrasContraprestaciones ??
  debugConcepto(cleanText, "OTRAS CONTRAPRESTACIONES");
    const operacionesBancarias =
  resultadoPython?.desglose?.operacionesBancarias ??
  extraerOperacionesBancarias(cleanText);
    const comisionesNoSeguroPython =
  Number(resultadoPython?.desglose?.comisionesNoSeguro || 0);

const comisionesNoSeguro =
  comisionesNoSeguroPython !== 0
    ? comisionesNoSeguroPython
    : extraerComisionesNoSeguro(cleanText);
    const multimap = extraerMultimap(cleanText);
const securitasDirect = extraerSecuritasDirect(cleanText);
const otrasComisionesSistema =
  extraerOtrasComisionesSistemaCompensacion(cleanText);
     const lineasDelegadas =
  resultadoPython?.desglose?.lineasDelegadas ??
  extraerLineasDelegadas(cleanText);
    const extornoImporteLiquido = extraerExtornoImporteLiquido(cleanText);
    console.log("=== DEBUG BUSQUEDA OFICINAS DELEGADAS ===");

cleanText.split(/\r?\n/).forEach((l) => {
  if (l.toUpperCase().includes("DELEG")) {
    console.log("LINEA POSIBLE:", l);
  }
});
    // const extornoLiquidoFinal = extraerExtornoLiquidoFinal(cleanText);

addLog("----- CONCEPTOS RESUMEN PDF -----");

const desgloseInteligente = extraerDesgloseResumenInteligente(cleanText);

const pintarGrupo = (
  titulo: string,
  items: { concepto: string; importe: number }[]
) => {
  if (!items.length) return;

  const total = items.reduce((sum, item) => sum + item.importe, 0);

  addLog(`${titulo}: ${total.toFixed(2)} €`);

  items.forEach((item) => {
    addLog(`  - ${item.concepto}: ${item.importe.toFixed(2)} €`);
  });
};

pintarGrupo(
  "OTRAS COMISIONES SIST.COMPENSACION",
  desgloseInteligente.sistemaCompensacion
);

pintarGrupo(
  "INCENTIVOS",
  desgloseInteligente.incentivos
);

pintarGrupo(
  "RAPPEL",
  desgloseInteligente.rappeles
);

pintarGrupo(
  "OTRAS CONTRAPRESTACIONES",
  desgloseInteligente.otrasContraprestaciones
);

// addLogImporte("OTROS GASTOS", otrosGastos);
addLogImporte("LINEAS DELEGADAS", lineasDelegadas);

addLog("--------------------------------");

/* ================= CÁLCULO BASE - PYTHON PRIMERO ================= */

let resultado: ResultadoMapfreEspana;

const usandoPython =
  resultadoPython?.ok &&
  resultadoPython?.resumen;

if (usandoPython) {
  console.log("🔥 MAPFRE ESPAÑA USANDO CÁLCULO DE PYTHON");

  const liquidoCalculadoPython = Number(
    resultadoPython.resumen.liquidoCalculado || 0
  );

  const diferenciaPython =
    typeof liquidoOficial === "number"
      ? Number((liquidoOficial - liquidoCalculadoPython).toFixed(2))
      : Number(resultadoPython.resumen.diferencia || 0);

  resultado = {
    
    extornos: Number(resultadoPython.resumen.extornos || 0),
    base: Number(resultadoPython.resumen.base || 0),
    irpf: Number(resultadoPython.resumen.irpf || 0),
    compensaciones: Number(resultadoPython.resumen.compensaciones || 0),
    otrosGastos: Number(resultadoPython.resumen.otrosGastos || 0),

    incentivos: Number(resultadoPython.resumen.incentivos || 0),
    rappeles: Number(resultadoPython.resumen.rappeles || 0),
    otrasContraprestaciones: Number(resultadoPython.resumen.otrasContraprestaciones || 0),
    traspaso: Number(resultadoPython.resumen.traspaso || 0),

    liquido: typeof liquidoOficial === "number"
      ? liquidoOficial
      : Number(resultadoPython.resumen.liquido || 0),

    liquidoCalculado: liquidoCalculadoPython,
    liquidoOficial,
    diferencia: diferenciaPython,
    usandoLiquidoOficial: typeof liquidoOficial === "number",
  };

  addLog("Cálculo principal usado: Python");

} else {
  console.log("⚠ MAPFRE ESPAÑA USANDO CÁLCULO TYPESCRIPT FALLBACK");

  resultado = calcularMapfreEspana(rows, liquidoOficial);

  if (otrosGastos !== 0 || otrasComisionesSistema !== 0) {
    const ajusteSeguro = otrosGastos + otrasComisionesSistema;
    const nuevaBase = resultado.base + ajusteSeguro;
    const nuevoIrpf = Number((nuevaBase * 0.15).toFixed(2));
    const nuevoLiquido = Number((nuevaBase - nuevoIrpf).toFixed(2));

    resultado = {
      ...resultado,
      base: Number(nuevaBase.toFixed(2)),
      irpf: nuevoIrpf,
      liquido: nuevoLiquido,
      liquidoCalculado: nuevoLiquido,
      otrosGastos,
    };
  }

  if (comisionesNoSeguro !== 0) {
    const nuevaBase = resultado.base + comisionesNoSeguro;
    const nuevoIrpf = Number((nuevaBase * 0.15).toFixed(2));
    const nuevoLiquido = Number((nuevaBase - nuevoIrpf).toFixed(2));

    resultado = {
      ...resultado,
      base: Number(nuevaBase.toFixed(2)),
      irpf: nuevoIrpf,
      liquido: nuevoLiquido,
      liquidoCalculado: nuevoLiquido,
    };
  }

  const baseTotal = resultado.base;
  const irpfReal = resultado.irpf;
  const compensacion = Math.abs(lineasDelegadas);
  const liquidoBase = baseTotal - irpfReal - compensacion;

  let ivaOperaciones = 0;

  if (operacionesBancarias !== 0) {
    ivaOperaciones = Number((operacionesBancarias * 0.21).toFixed(2));
  }

  let ivaNoSeguro = 0;

  if (comisionesNoSeguro !== 0) {
    ivaNoSeguro = Number((comisionesNoSeguro * 0.21).toFixed(2));
  }

  const liquidoCalculadoFinal = Number(
    (
      liquidoBase +
      ivaOperaciones +
      ivaNoSeguro +
      extornoImporteLiquido
    ).toFixed(2)
  );

  let liquidoDefinitivo = liquidoCalculadoFinal;
  let diferenciaFinal = 0;
  let usandoLiquidoOficialFinal = false;

  if (typeof liquidoOficial === "number") {
    diferenciaFinal = Number(
      (liquidoOficial - liquidoCalculadoFinal).toFixed(2)
    );

    if (Math.abs(diferenciaFinal) <= 0.02) {
      liquidoDefinitivo = liquidoOficial;
      usandoLiquidoOficialFinal = true;
    }
  }

  resultado = {
    ...resultado,
    incentivos,
    rappeles,
    otrasContraprestaciones,
    traspaso,
    otrosGastos,
    liquido: liquidoDefinitivo,
    liquidoCalculado: liquidoCalculadoFinal,
    diferencia: diferenciaFinal,
    usandoLiquidoOficial: usandoLiquidoOficialFinal,
  };

  addLog("Cálculo principal usado: TypeScript fallback");
}
let sePuedeGuardar = true;

if (
  typeof liquidoOficial === "number" &&
  Math.abs(resultado.diferencia) > 0.02
) {
  sePuedeGuardar = false;

  addLog("❌ ERROR DE CUADRE");
  addLog(
    "La diferencia entre el cálculo y el PDF es mayor a 0.02 €"
  );
  addLog(
    "NO SE PUEDE GUARDAR ESTA FACTURA HASTA REVISAR LOS CÁLCULOS"
  );
}

// 🔎 VALIDACIÓN DATOS OBLIGATORIOS

if (!datosFactura.numeroFactura?.trim()) {
  sePuedeGuardar = false;
  addLog("❌ Falta el número de factura");
}

if (!datosFactura.periodo?.trim()) {
  sePuedeGuardar = false;
  addLog("❌ Falta el periodo");
}

if (!datosFactura.razonSocial?.trim()) {
  sePuedeGuardar = false;
  addLog("❌ Falta la razón social");
}

if (!datosFactura.cif?.trim()) {
  sePuedeGuardar = false;
  addLog("❌ Falta el CIF");
}
    const totalNuevaProduccion =
  resultadoPython?.totalesProduccion?.totalNuevaProduccion ??
  calcularTotalesProduccionMapfreEspana(rows).totalNuevaProduccion;

const totalRenovaciones =
  resultadoPython?.totalesProduccion?.totalRenovaciones ??
  calcularTotalesProduccionMapfreEspana(rows).totalRenovaciones;

    /* ================= LOGS ================= */

    
    addLog(`Número factura: ${datosFactura.numeroFactura}`);
    addLog(`Periodo: ${datosFactura.periodo}`);
    addLog(`Filas detectadas: ${rows.length}`);
   
    addLog(`Extornos: ${resultado.extornos.toFixed(2)} €`);
    addLog(`Base: ${resultado.base.toFixed(2)} €`);
    addLog(`IRPF: ${resultado.irpf.toFixed(2)} €`);
    addLog(`Nueva Producción: ${totalNuevaProduccion.toFixed(2)} €`);
    addLog(`Renovaciones: ${totalRenovaciones.toFixed(2)} €`);
   addLog(`O. BANCARIAS: ${operacionesBancarias.toFixed(2)} €`);
addLog(`IVA NO SEGURO (21%): ${(resultadoPython?.desglose?.ivaNoSeguro ?? 0).toFixed(2)} €`);
    addLog(`Líquido final mostrado: ${resultado.liquido.toFixed(2)} €`);
  /* ================= GUARDADO EN S3 + BASE DE DATOS ================= */

if (sePuedeGuardar) {

  try {

    /* =====================================================
   🔎 BLOQUEAR DUPLICADO POR HASH
===================================================== */

if (hash) {

  const existeHash = await Facturacion.findOne({
    usuarioId,
    archivoHash: hash,
  });

  if (existeHash) {

    addLog("⚠ Este archivo ya fue subido anteriormente (hash duplicado)");

    return res.json({
      resumen: {
        ...resultado,
        nuevaProduccion: totalNuevaProduccion,
        renovaciones: totalRenovaciones,
      },
      datosFactura,
      logs,
      sePuedeGuardar: false,
    });
  }
}

    // 🔎 Evitar duplicados
    const existe = await Facturacion.findOne({
      usuarioId,
      
      numeroFactura: datosFactura.numeroFactura,
    });

    if (existe) {

      addLog("⚠ Esta factura ya existe en la base de datos");

    } else {

      /* =====================================================
         ORGANIZAR CARPETAS S3 (AÑO / MES)
      ===================================================== */

      const periodo = datosFactura.periodo || "SIN_PERIODO";

      let mes = "Desconocido";
      let anio = "0000";

      if (periodo.includes("-")) {
        const partes = periodo.split("-");
        mes =
          partes[0].charAt(0) +
          partes[0].slice(1).toLowerCase();
        anio = partes[1];
      }

      const folderPath = `${anio}/${mes}`;

      const nombreArchivo = `MapfreEspana-${mes}-${anio}-${datosFactura.numeroFactura}.pdf`;

      const s3Result = await uploadToS3(
        req.file!.buffer,
        nombreArchivo,
        req.file!.mimetype,
        folderPath
      );

      addLog(`Archivo subido a S3: ${s3Result.key}`);

      /* =====================================================
         GUARDAR EN MONGO
      ===================================================== */

      await Facturacion.create({

        usuarioId,
        tipoFactura: "MAPFRE_ESPANA",

        numeroFactura: datosFactura.numeroFactura,
        fechaTexto: datosFactura.fecha,
        periodo: datosFactura.periodo,
        razonSocial: datosFactura.razonSocial,
        cif: datosFactura.cif,

        
        extornos: resultado.extornos,
        base: resultado.base,
        irpf: resultado.irpf,

        traspaso,
        otrosGastos,
        incentivos,
        rappeles,
        otrasContraprestaciones,
        comisionesNoSeguro,
        lineasDelegadas,
        operacionesBancarias,
        ivaOperaciones: resultadoPython?.desglose?.ivaOperaciones ?? 0,

        liquidoCalculado: resultado.liquidoCalculado,
        liquidoOficial,
        liquidoFinal: resultado.liquido,
        diferencia: resultado.diferencia,
        usandoLiquidoOficial: resultado.usandoLiquidoOficial,

        nuevaProduccion: totalNuevaProduccion,
        renovaciones: totalRenovaciones,

        filasDetectadas: rows.length,

        nombreArchivoOriginal: req.file?.originalname,
        s3Key: s3Result.key,
        archivoHash: hash,

        logs,
        sePuedeGuardar,
      });

      addLog("✅ Factura guardada correctamente en base de datos");
    }

  } catch (error: any) {

  console.error("🔥 ERROR REAL MONGO:", error);

  if (error.code === 11000) {
    addLog("❌ Error Mongo: clave duplicada (E11000)");
  } else {
    addLog("❌ Error guardando en Mongo: " + error.message);
  }
}

} else {

  addLog("🚫 No se guarda la factura porque no cumple validaciones");

}

/* ================= DEBUG PREPARADO PARA FRONT ================= */
/*
  No se guarda ningún archivo en disco.
  El debug viaja en la respuesta y el frontend podrá descargarlo
  si el usuario pulsa un botón.
*/

const debugDescargable = {
  nombreArchivo: `debug-mapfre-espana-${Date.now()}.json`,
  tipo: "application/json",
  contenido: debugOCR,
};

return res.json({
  resumen: {
    ...resultado,
    nuevaProduccion: totalNuevaProduccion,
    renovaciones: totalRenovaciones,
  },
  datosFactura,
  logs,
  sePuedeGuardar,
  debugOCR,
  debugDescargable,
});

  } catch (error) {
    console.error("🔥 ERROR MAPFRE ESPAÑA:", error);
    return res.status(500).json({
      error: "Error procesando MAPFRE ESPAÑA",
    });
  }
};