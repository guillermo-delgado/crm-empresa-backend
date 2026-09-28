import { Request, Response } from "express";
import { deleteFromS3 } from "../../../services/deleteFromS3";
import { encryptJson } from "../../../services/cryptoService";
import {
  LineaMapfreVida,
  ResultadoMapfreVida,
} from "./mapfreVida.types";
import {
  parseMapfreVidaFromText,
  extraerLiquidoOficial,
  extraerDatosFacturaMapfreVida,
  calcularTotalesProduccion,
} from "./mapfreVida.parser";

import FacturacionModel from "./mapfreVida.model";
import { uploadToS3 } from "../../../services/uploadToS3";

/* =====================================================
   FUNCIÓN DE CÁLCULO PURO
===================================================== */
export function calcularMapfreVida(
  rows: LineaMapfreVida[],
  liquidoOficial?: number | null
): ResultadoMapfreVida & {
  liquidoCalculado: number;
  diferencia: number;
  usandoLiquidoOficial: boolean;
} {
  let abonos = 0;
  let extornos = 0;
  let compensaciones = 0;
  let otrosGastos = 0;

  rows.forEach((row) => {
    const comision = row.comision;
    if (typeof comision !== "number") return;

    if (comision > 0) abonos += comision;
    if (comision < 0) extornos += Math.abs(comision);
  });

  const base = abonos - extornos;
  const irpf = Number((base * 0.15).toFixed(2));
  const liquidoCalculado = Number(
    (base - irpf - compensaciones).toFixed(2)
  );

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
    compensaciones: Number(compensaciones.toFixed(2)),
    otrosGastos: Number(otrosGastos.toFixed(2)),
    liquido: Number(liquidoFinal.toFixed(2)),
    liquidoCalculado,
    diferencia,
    usandoLiquidoOficial,
  };
}

/* =====================================================
   SERVICE MAPFRE VIDA
===================================================== */
export const procesarMapfreVidaService = async (
  text: string,
  req: Request,
  res: Response
) => {
  console.log("🟢 ENTRA EN MAPFRE VIDA SERVICE");

  try {
    const logs: string[] = [];
    const addLog = (msg: string) => logs.push(msg);

    const usuarioId = (req as any).user?.id;
    const hash = (req as any).fileHash;
    const resultadoPython = (req as any).resultadoPython;

    const subtipoFactura = String(
  (req as any).subtipoFactura ||
  resultadoPython?.subtipo ||
  "VIDA_NORMAL"
).trim().toUpperCase();

    if (!req.file) {
      return res.status(400).json({
        error: "No se ha enviado archivo",
      });
    }

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

    const datosFacturaPython = resultadoPython?.datosFactura;
const datosFacturaTS = extraerDatosFacturaMapfreVida(cleanText);

const datosFactura = {
  numeroFactura:
    datosFacturaPython?.numeroFactura || datosFacturaTS.numeroFactura,
  fecha:
    datosFacturaPython?.fecha || datosFacturaTS.fecha,
  periodo:
    datosFacturaPython?.periodo || datosFacturaTS.periodo,
  razonSocial:
    datosFacturaPython?.razonSocial || datosFacturaTS.razonSocial,
  cif:
    datosFacturaPython?.cif || datosFacturaTS.cif,
};

    if (!datosFactura) {
      return res.status(400).json({
        error: "No se pudieron extraer datos de la factura",
      });
    }

let rows: LineaMapfreVida[] = [];

const pythonOk = resultadoPython?.ok === true;

if (!pythonOk && subtipoFactura === "VIDA_INVERSION") {
  return res.status(400).json({
    error: "VIDA_INVERSION necesita resultado Python válido",
    logs,
    resultadoPython,
  });
}

if (
  pythonOk &&
  Array.isArray(resultadoPython.rows) &&
  resultadoPython.rows.length > 0
) {
  rows = resultadoPython.rows.map((r: any) => ({
    poliza: r.poliza || "",
    tomador: r.tomador || "",
    concepto: r.concepto || "",
    tipoProduccion: String(r.tipoProduccion || "").trim().toUpperCase(),
    fechaVencimiento: r.fechaVencimiento || "",
    totalRecibo: Number(r.totalRecibo || 0),
    primaBase: Number(r.primaBase || 0),
    porcentaje: Number(r.porcentaje || 0),
    comision: Number(r.comision || 0),
    anulado: Number(r.anulado || 0),
    numeroRecibo: r.numeroRecibo || "",
  } as any));

  addLog(`Filas detectadas Python ${subtipoFactura}: ${rows.length}`);
} else {
  rows = parseMapfreVidaFromText(cleanText);
  addLog(`Filas detectadas TypeScript fallback ${subtipoFactura}: ${rows.length}`);
}
    const liquidoExtraido =
  pythonOk && resultadoPython?.resumen
    ? (
        resultadoPython.resumen.liquidoOficial ??
        resultadoPython.resumen.liquido ??
        resultadoPython.resumen.liquidoFinal ??
        null
      )
    : extraerLiquidoOficial(cleanText);

    const liquidoOficial =
      typeof liquidoExtraido === "number" && liquidoExtraido > 0
        ? liquidoExtraido
        : null;

    addLog("====================================");
    addLog("IMPORTE LIQUIDO EXTRAIDO DEL PDF:");
    addLog(
      liquidoOficial !== null && liquidoOficial !== undefined
        ? liquidoOficial.toFixed(2) + " €"
        : "NO ENCONTRADO"
    );
    addLog("====================================");

    let resultado: any;

  if (pythonOk && resultadoPython?.resumen) {
  resultado = {
    abonos: Number(
      resultadoPython.resumen.abonos ??
      resultadoPython.resumen.baseProduccion ??
      resultadoPython.resumen.base ??
      0
    ),

    extornos: Number(resultadoPython.resumen.extornos ?? 0),

    base: Number(resultadoPython.resumen.base ?? 0),

    irpf: Number(resultadoPython.resumen.irpf || 0),

    compensaciones: Number(
      resultadoPython.resumen.compensaciones || 0
    ),

    otrosGastos: Number(
      resultadoPython.resumen.otrosGastos || 0
    ),

    liquido: Number(
      resultadoPython.resumen.liquido ??
      resultadoPython.resumen.liquidoFinal ??
      0
    ),

    liquidoCalculado: Number(
      resultadoPython.resumen.liquidoCalculado ??
      resultadoPython.resumen.liquido ??
      resultadoPython.resumen.liquidoFinal ??
      0
    ),

    diferencia: Number(
      resultadoPython.resumen.diferencia ?? 0
    ),

    usandoLiquidoOficial: Boolean(
      resultadoPython.resumen.usandoLiquidoOficial
    ),
  };

  addLog(`Cálculo principal usado: Python ${subtipoFactura}`);
} else {
  resultado = calcularMapfreVida(rows, liquidoOficial);

  addLog(`Cálculo principal usado: TypeScript fallback ${subtipoFactura}`);
}

  let totalNuevaProduccion = 0;
let totalRenovaciones = 0;

const totalesProduccion = calcularTotalesProduccion(rows);

const nuevaPython = Number(
  resultadoPython?.totalesProduccion?.totalNuevaProduccion || 0
);

const renovacionesPython = Number(
  resultadoPython?.totalesProduccion?.totalRenovaciones || 0
);

totalNuevaProduccion =
  nuevaPython !== 0
    ? nuevaPython
    : totalesProduccion.totalNuevaProduccion;

totalRenovaciones =
  renovacionesPython !== 0
    ? renovacionesPython
    : totalesProduccion.totalRenovaciones;

    const provisiones =
      subtipoFactura === "VIDA_INVERSION"
        ? Number(resultadoPython?.totalesProduccion?.provisiones || 0)
        : 0;

    const totalPrima =
  resultadoPython?.ok
    ? Number(
        resultadoPython?.totalesProduccion?.totalPrima ??
        resultadoPython?.resumen?.totalPrima ??
        0
      )
    : 0;

    let sePuedeGuardar = true;

if (rows.length === 0 && subtipoFactura !== "VIDA_INVERSION") {
  sePuedeGuardar = false;
  addLog("❌ No se han detectado filas válidas");
}

if (rows.length === 0 && subtipoFactura === "VIDA_INVERSION") {
  addLog("ℹ VIDA_INVERSION sin filas de pólizas. Se permite guardar por resumen.");
}

const liquidoOficialValido =
  typeof liquidoOficial === "number" &&
  liquidoOficial > 0;

if (
  subtipoFactura !== "VIDA_INVERSION" &&
  liquidoOficialValido &&
  Math.abs(resultado.diferencia) > 0.02
) {
  sePuedeGuardar = false;

  addLog("❌ ERROR DE CUADRE");
  addLog("La diferencia entre el cálculo y el PDF es mayor a 0.02 €");
}

if (!datosFactura?.numeroFactura?.trim()) {
  sePuedeGuardar = false;
  addLog("❌ Falta el número de factura");
}

if (!datosFactura?.periodo?.trim()) {
  sePuedeGuardar = false;
  addLog("❌ Falta el periodo");
}

if (!datosFactura?.razonSocial?.trim()) {
  sePuedeGuardar = false;
  addLog("❌ Falta la razón social");
}

if (!datosFactura?.cif?.trim()) {
  sePuedeGuardar = false;
  addLog("❌ Falta el CIF");
}

/* =====================================================
   LOGS PRINCIPALES — ANTES DE GUARDAR / DUPLICADOS
===================================================== */

addLog(`Número factura: ${datosFactura.numeroFactura}`);
addLog(`Periodo: ${datosFactura.periodo}`);
addLog(`Subtipo: ${subtipoFactura}`);
addLog(`Filas detectadas: ${rows.length}`);
let debugN = 0;
let debugC = 0;
let debugSinTipo = 0;

rows.forEach((row: any, index: number) => {
  const tipo = String(row.tipoProduccion || "").trim().toUpperCase();
  const comision = Number(row.comision || 0);

  if (tipo === "N") debugN += comision;
  else if (tipo === "C") debugC += comision;
  else debugSinTipo += comision;

  addLog(
    `[ROW ${index + 1}] tipo=${tipo || "SIN_TIPO"} | comision=${comision.toFixed(2)} | poliza=${row.poliza || ""} | tomador=${row.tomador || ""}`
  );
});

addLog(`DEBUG N: ${debugN.toFixed(2)} €`);
addLog(`DEBUG C: ${debugC.toFixed(2)} €`);
addLog(`DEBUG SIN TIPO: ${debugSinTipo.toFixed(2)} €`);
addLog(`Extornos: ${resultado.extornos.toFixed(2)} €`);
addLog(`Base: ${resultado.base.toFixed(2)} €`);
addLog(`IRPF: ${resultado.irpf.toFixed(2)} €`);
addLog(`Nueva Producción: ${totalNuevaProduccion.toFixed(2)} €`);
addLog(`Renovaciones: ${totalRenovaciones.toFixed(2)} €`);
addLog(`Provisiones: ${provisiones.toFixed(2)} €`);
addLog(`Total Prima: ${totalPrima.toFixed(2)} €`);
addLog(`Líquido calculado: ${resultado.liquidoCalculado.toFixed(2)} €`);

if (liquidoOficialValido) {
  addLog(`Líquido oficial PDF: ${liquidoOficial.toFixed(2)} €`);
  addLog(`Diferencia líquido: ${resultado.diferencia.toFixed(2)} €`);
}

addLog(`Líquido final mostrado: ${resultado.liquido.toFixed(2)} €`);

let s3KeyGuardado: string | null = null;
let jsonS3KeyGuardado: string | null = null;

if (sePuedeGuardar) {

  try {

/* =====================================================
   🔎 BLOQUEAR DUPLICADOS / ACTUALIZAR FACTURA
===================================================== */

const replace = req.body?.replace === "true";

let facturaAnteriorParaBorrar: any = null;

let existeHash: any = null;

if (hash) {
  existeHash = await FacturacionModel.findOne({
    usuarioId,
    tipoFactura: "MAPFRE_VIDA",
    archivoHash: hash,
  });
}

const existeNumero = await FacturacionModel.findOne({
  usuarioId,
  tipoFactura: "MAPFRE_VIDA",
  numeroFactura: datosFactura.numeroFactura,
});
if (existeHash && existeNumero) {
  const mismoRegistro =
    existeHash._id.toString() === existeNumero._id.toString();

  if (!mismoRegistro) {
    addLog("❌ Conflicto de duplicados");
    addLog("El hash pertenece a una factura y el número a otra distinta.");
    addLog("No se puede actualizar automáticamente por seguridad.");

    return res.json({
      resumen: {
        ...resultado,
        nuevaProduccion: totalNuevaProduccion,
        renovaciones: totalRenovaciones,
        provisiones,
        totalPrima,
      },

      datosFactura,

      subtipo: subtipoFactura,

      logs,

      sePuedeGuardar: false,

      requiereRevisionManual: true,

      motivoReemplazo: "CONFLICTO_HASH_NUMERO_FACTURA",

      facturaGuardada: false,

      tipoFactura: "MAPFRE_VIDA",
    });
  }
}

const facturaExistente = existeNumero || existeHash;

if (facturaExistente && !replace) {
  addLog("⚠ Esta factura ya existe en la base de datos");
  addLog("Puedes reemplazarla confirmando la actualización.");

  return res.json({
    resumen: {
      ...resultado,
      nuevaProduccion: totalNuevaProduccion,
      renovaciones: totalRenovaciones,
      provisiones,
      totalPrima,
    },

    datosFactura,

    subtipo: subtipoFactura,

    logs,

    sePuedeGuardar: false,

    requiereConfirmacionReemplazo: true,

    motivoReemplazo: existeNumero
      ? "NUMERO_FACTURA_DUPLICADO"
      : "HASH_DUPLICADO",

    facturaGuardada: false,

    tipoFactura: "MAPFRE_VIDA",

    facturaExistente: {
      id: facturaExistente._id,

      numeroFactura: facturaExistente.numeroFactura,

      periodo: facturaExistente.periodo,

      subtipo: facturaExistente.subtipo,

      provisiones: facturaExistente.provisiones,

      totalPrima: facturaExistente.totalPrima,

      s3Key: facturaExistente.s3Key,

      jsonS3Key: facturaExistente.jsonS3Key,

      updatedAt: facturaExistente.updatedAt,

      createdAt: facturaExistente.createdAt,
    },
  });
}

if (facturaExistente && replace) {
  facturaAnteriorParaBorrar = facturaExistente;

  addLog("♻ Se reemplazará la factura anterior detectada.");
}
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

    const nombreArchivo = `MapfreVida-${mes}-${anio}-${datosFactura.numeroFactura}.pdf`;
    const nombreArchivoJson = `MapfreVida-${mes}-${anio}-${datosFactura.numeroFactura}.json.enc`;

    const facturaJsonNormalizada = {
  schemaVersion: 1,
  tipoFactura: "MAPFRE_VIDA",
  subtipo: subtipoFactura,
  

  datosFactura,

 resumen: {
  filasDetectadas: rows.length,
  abonos: resultado.abonos,
  extornos: resultado.extornos,
  base: resultado.base,
  irpf: resultado.irpf,
  compensaciones: resultado.compensaciones,
  otrosGastos: resultado.otrosGastos,
  liquidoCalculado: resultado.liquidoCalculado,
  liquidoOficial: liquidoOficial ?? null,
  liquidoFinal: resultado.liquido,
  diferencia: resultado.diferencia,
  usandoLiquidoOficial: resultado.usandoLiquidoOficial,
  nuevaProduccion: totalNuevaProduccion,
  renovaciones: totalRenovaciones,
  provisiones,
totalPrima,
},

  lineas: rows.map((row: any) => ({
    poliza: row.poliza || "",
    tomador: row.tomador || "",
    concepto: row.concepto || "",
    tipoProduccion: row.tipoProduccion || "",
    fechaVencimiento: row.fechaVencimiento || "",
    totalRecibo: Number(row.totalRecibo || 0),
    primaBase: Number(row.primaBase || 0),
    porcentaje: Number(row.porcentaje || 0),
    comision: Number(row.comision || 0),
  })),

  generadoEn: new Date().toISOString(),
};

    const s3Result = await uploadToS3(
      req.file!.buffer,
      nombreArchivo,
      req.file!.mimetype,
      folderPath
    );

    const jsonBuffer = encryptJson(facturaJsonNormalizada);

const jsonS3Result = await uploadToS3(
  jsonBuffer,
  nombreArchivoJson,
  "application/octet-stream",
  folderPath
);

s3KeyGuardado = s3Result.key;
jsonS3KeyGuardado = jsonS3Result.key;

addLog(`JSON normalizado subido a S3: ${jsonS3Result.key}`);
addLog(`Archivo subido a S3: ${s3Result.key}`);

    console.log("Archivo subido a S3:", s3Result.key);

    /* =====================================================
       GUARDAR EN MONGO
    ===================================================== */

    if (facturaAnteriorParaBorrar) {
  await FacturacionModel.deleteOne({
    _id: facturaAnteriorParaBorrar._id,
  });

  addLog("♻ Registro anterior eliminado de Mongo para permitir actualización.");
}

 const facturaMongo: Record<string, any> = {
  usuarioId,
  tipoFactura: "MAPFRE_VIDA",
  subtipo: subtipoFactura,

  numeroFactura: datosFactura.numeroFactura,
  fechaTexto: datosFactura.fecha,
  periodo: datosFactura.periodo,
  razonSocial: datosFactura.razonSocial,
  cif: datosFactura.cif,

  nombreArchivoOriginal: req.file?.originalname,
  s3Key: s3Result.key,
  jsonS3Key: jsonS3Result.key,
  jsonEncrypted: true,
  jsonEncryptionVersion: 1,
  archivoHash: hash,

  logs,
  sePuedeGuardar,
  validado: false,

  usandoLiquidoOficial: resultado.usandoLiquidoOficial,
};

const addNumberIfNotZero = (
  key: string,
  value: number | null | undefined
) => {
  if (typeof value !== "number") return;

  if (Math.abs(value) < 0.01) return;

  facturaMongo[key] = value;
};

/* ================= PRODUCCIÓN ================= */

addNumberIfNotZero(
  "nuevaProduccion",
  totalNuevaProduccion
);

addNumberIfNotZero(
  "renovaciones",
  totalRenovaciones
);

addNumberIfNotZero(
  "provisiones",
  provisiones
);

addNumberIfNotZero(
  "totalPrima",
  totalPrima
);

addNumberIfNotZero(
  "filasDetectadas",
  rows.length
);

/* ================= ECONÓMICOS ================= */

addNumberIfNotZero(
  "extornos",
  resultado.extornos
);

addNumberIfNotZero(
  "base",
  resultado.base
);

addNumberIfNotZero(
  "irpf",
  resultado.irpf
);

addNumberIfNotZero(
  "compensaciones",
  resultado.compensaciones
);

addNumberIfNotZero(
  "otrosGastos",
  resultado.otrosGastos
);

/* ================= LÍQUIDOS ================= */

addNumberIfNotZero(
  "liquidoCalculado",
  resultado.liquidoCalculado
);

addNumberIfNotZero(
  "liquidoOficial",
  liquidoOficial
);

addNumberIfNotZero(
  "liquidoFinal",
  resultado.liquido
);

addNumberIfNotZero(
  "diferencia",
  resultado.diferencia
);

/* ================= GUARDAR ================= */

await FacturacionModel.create(facturaMongo);


    if (facturaAnteriorParaBorrar) {
  if (
    facturaAnteriorParaBorrar.s3Key &&
    facturaAnteriorParaBorrar.s3Key !== s3Result.key
  ) {
    await deleteFromS3(facturaAnteriorParaBorrar.s3Key);
  }

  if (
    facturaAnteriorParaBorrar.jsonS3Key &&
    facturaAnteriorParaBorrar.jsonS3Key !== jsonS3Result.key
  ) {
    await deleteFromS3(facturaAnteriorParaBorrar.jsonS3Key);
  }

  addLog("♻ Archivos anteriores eliminados de S3 correctamente.");
}

addLog("✅ Factura guardada correctamente en base de datos");
  } catch (error: any) {
    console.error("🔥 ERROR GUARDANDO MAPFRE VIDA:", error);

    if (error.code === 11000) {
      addLog("❌ Error Mongo: clave duplicada (E11000)");
    } else {
      addLog("❌ Error guardando en Mongo: " + error.message);
    }
  }

} else {
  addLog("🚫 No se guarda la factura porque no cumple validaciones");
}
    /* =====================================================
   LOGS S3 — SOLO SI SE HA GUARDADO
===================================================== */

if (s3KeyGuardado) {
  addLog(`Archivo guardado en S3: ${s3KeyGuardado}`);
}

if (jsonS3KeyGuardado) {
  addLog(`JSON cifrado guardado en S3: ${jsonS3KeyGuardado}`);
}

return res.json({
  resumen: {
    ...resultado,
    nuevaProduccion: totalNuevaProduccion,
    renovaciones: totalRenovaciones,
    provisiones,
    totalPrima,
  },

  datosFactura,

  subtipo: subtipoFactura,

  logs,

  sePuedeGuardar,

  requiereConfirmacionReemplazo: false,

  facturaGuardada: Boolean(s3KeyGuardado && jsonS3KeyGuardado),

  tipoFactura: "MAPFRE_VIDA",
});

  } catch (error) {
    console.error("🔥 ERROR REAL SERVICE:", error);
    return res.status(500).json({
      error: "Error procesando MAPFRE VIDA",
    });
  }
};