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

  for (const rawLine of lines) {

    const line = rawLine.toUpperCase();

    if (line.includes("TOTAL COMISIONES DE NO SEGURO")) {

      const match = line.match(/-?\d[\d\.]*,\d{2}/);

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

    const line = rawLine.toUpperCase();

    if (line.includes("LINEAS DE DATOS OFICINAS DELEGADAS") ||
        line.includes("LÍNEAS DE DATOS OFICINAS DELEGADAS")) {

      const importes = line.match(/-?\d[\d\.]*,\d{2}/g);

      if (!importes || importes.length === 0) return 0;

      // 🔥 COGER EL ÚLTIMO IMPORTE
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
   FUNCIÓN DE CÁLCULO
===================================================== */

export function calcularMapfreEspana(
  rows: LineaMapfreEspana[],
  liquidoOficial?: number | null
): ResultadoMapfreEspana {

  let abonos = 0;
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

    if (comision > 0) abonos += comision;
    if (comision < 0) extornos += Math.abs(comision);
  });

  const base = abonos - extornos;

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
    abonos: Number(abonos.toFixed(2)),
    extornos: Number(extornos.toFixed(2)),
    base: Number(base.toFixed(2)),
    irpf,
    compensaciones: 0,
    otrosGastos: 0,

    // Nuevos campos inicializados
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

    const usuarioId = (req as any).user?.id;
    const hash = (req as any).fileHash;

    if (!usuarioId) {
      return res.status(401).json({
        error: "Usuario no autenticado",
      });
    }

    const cleanText = text
      .replace(/\r/g, "")
      .replace(/\t/g, " ")
      .replace(/[ ]{2,}/g, " ")
      .trim();

    const datosFactura =
      extraerDatosFacturaMapfreEspana(cleanText);

    const rows =
      parseMapfreEspanaFromText(cleanText);

    const liquidoOficial =
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

    const traspaso = debugConcepto(cleanText, "TRASPASO DE COMISIONES");
    const otrosGastos = debugConcepto(cleanText, "OTROS GASTOS TRIBUTABLES");
    const incentivos = extraerIncentivos(cleanText);
    const rappeles = debugConcepto(cleanText, "RAPPEL");
    const otrasContraprestaciones = debugConcepto(cleanText, "OTRAS CONTRAPRESTACIONES");
    const operacionesBancarias = extraerOperacionesBancarias(cleanText);
    const comisionesNoSeguro = extraerComisionesNoSeguro(cleanText);
    const lineasDelegadas = extraerLineasDelegadas(cleanText);
    const extornoImporteLiquido = extraerExtornoImporteLiquido(cleanText);
    // const extornoLiquidoFinal = extraerExtornoLiquidoFinal(cleanText);

    addLog("----- DEBUG CONCEPTOS RESUMEN PDF -----");
    addLog("TRASPASO: " + traspaso);
    addLog("OTROS GASTOS: " + otrosGastos);
    addLog("INCENTIVOS: " + incentivos);
    addLog("RAPPEL: " + rappeles);
    addLog("OTRAS CONTRAPRESTACIONES: " + otrasContraprestaciones);
    addLog("COMISIONES NO SEGURO: " + comisionesNoSeguro);
    addLog("LINEAS DELEGADAS: " + lineasDelegadas);
    addLog("----------------------------------------");

    /* ================= CÁLCULO BASE ================= */

    let resultado =
      calcularMapfreEspana(rows, liquidoOficial);
      // 🔥 SUMAR OTROS GASTOS TRIBUTABLES A LA BASE
if (otrosGastos !== 0) {

  const nuevaBase = resultado.base + otrosGastos;
  const nuevoIrpf = Number((nuevaBase * 0.15).toFixed(2));
  const nuevoLiquido = Number((nuevaBase - nuevoIrpf).toFixed(2));

  resultado = {
    ...resultado,
    base: Number(nuevaBase.toFixed(2)),
    irpf: nuevoIrpf,
    liquido: nuevoLiquido,
    liquidoCalculado: nuevoLiquido,
    otrosGastos
  };
}

/* ================= SUMAR COMISIONES NO SEGURO A BASE ================= */

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

    resultado = {
      ...resultado,
      incentivos,
      rappeles,
      otrasContraprestaciones,
      traspaso,
      otrosGastos
    };


   /* ================= CÁLCULO FINAL EXACTO SEGÚN PDF ================= */

// Base ya incluye no seguro
const baseTotal = resultado.base;

// IRPF ya recalculado
const irpfReal = resultado.irpf;

// Compensación (líneas delegadas)
const compensacion = Math.abs(lineasDelegadas);

// Paso 1
const liquidoBase =
  baseTotal - irpfReal - compensacion;

// IVA operaciones
let ivaOperaciones = 0;

if (operacionesBancarias !== 0) {
  ivaOperaciones = Number(
    (operacionesBancarias * 0.21).toFixed(2)
  );
}

// Paso final EXACTO como factura
// Paso final EXACTO como factura
const liquidoCalculadoFinal = Number(
  (
    liquidoBase +
    ivaOperaciones +
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

  addLog(`Líquido calculado final: ${liquidoCalculadoFinal.toFixed(2)} €`);
  addLog(`Líquido oficial PDF: ${liquidoOficial.toFixed(2)} €`);
  addLog(`Diferencia final: ${diferenciaFinal.toFixed(2)} €`);

  if (Math.abs(diferenciaFinal) <= 0.02) {
    liquidoDefinitivo = liquidoOficial;
    usandoLiquidoOficialFinal = true;
  }
}

if (usandoLiquidoOficialFinal) {
  addLog("⚠ Se usa el líquido oficial del PDF (ajuste por redondeo final)");
}

resultado = {
  ...resultado,
  liquido: liquidoDefinitivo,
  liquidoCalculado: liquidoCalculadoFinal,
  diferencia: diferenciaFinal,
  usandoLiquidoOficial: usandoLiquidoOficialFinal
};

let sePuedeGuardar = true;

if (
  typeof liquidoOficial === "number" &&
  Math.abs(diferenciaFinal) > 0.02
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
    const {
      totalNuevaProduccion,
      totalRenovaciones,
    } = calcularTotalesProduccionMapfreEspana(rows);

    /* ================= LOGS ================= */

    
    addLog(`Número factura: ${datosFactura.numeroFactura}`);
    addLog(`Periodo: ${datosFactura.periodo}`);
    addLog(`Filas detectadas: ${rows.length}`);
    addLog(`Abonos: ${resultado.abonos.toFixed(2)} €`);
    addLog(`Extornos: ${resultado.extornos.toFixed(2)} €`);
    addLog(`Base: ${resultado.base.toFixed(2)} €`);
    addLog(`IRPF: ${resultado.irpf.toFixed(2)} €`);
    addLog(`Nueva Producción: ${totalNuevaProduccion.toFixed(2)} €`);
    addLog(`Renovaciones: ${totalRenovaciones.toFixed(2)} €`);
    addLog(`O. BANCARIAS: ${operacionesBancarias.toFixed(2)} €`);
addLog(`IVA O. BANCARIAS (21%): ${ivaOperaciones.toFixed(2)} €`);
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

        abonos: resultado.abonos,
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
        ivaOperaciones,

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

  } catch (error) {

    console.error("Error guardando factura:", error);
    addLog("❌ Error guardando la factura en base de datos");

  }

} else {

  addLog("🚫 No se guarda la factura porque no cumple validaciones");

}

 return res.json({
  resumen: {
    ...resultado,
    nuevaProduccion: totalNuevaProduccion,
    renovaciones: totalRenovaciones,
  },
  datosFactura,
  logs,
  sePuedeGuardar
});

  } catch (error) {
    console.error("🔥 ERROR MAPFRE ESPAÑA:", error);
    return res.status(500).json({
      error: "Error procesando MAPFRE ESPAÑA",
    });
  }
};