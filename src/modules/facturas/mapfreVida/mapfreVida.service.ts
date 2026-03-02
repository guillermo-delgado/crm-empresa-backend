import { Request, Response } from "express";
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

  rows.forEach((row) => {
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

    const datosFactura = extraerDatosFacturaMapfreVida(cleanText);
    const rows = parseMapfreVidaFromText(cleanText);
    const liquidoOficial = extraerLiquidoOficial(cleanText);

    const resultado = calcularMapfreVida(rows, liquidoOficial);

    const {
      totalNuevaProduccion,
      totalRenovaciones,
    } = calcularTotalesProduccion(rows);

    /* =====================================================
       VALIDACIONES
    ===================================================== */

    let sePuedeGuardar = true;

    if (
      typeof liquidoOficial === "number" &&
      Math.abs(resultado.diferencia) > 0.02
    ) {
      sePuedeGuardar = false;
      addLog("❌ ERROR DE CUADRE: diferencia > 0.02 €");
    }

    if (!datosFactura.numeroFactura?.trim()) {
      sePuedeGuardar = false;
      addLog("❌ Falta número de factura");
    }

    if (!datosFactura.periodo?.trim()) {
      sePuedeGuardar = false;
      addLog("❌ Falta periodo");
    }

    if (!datosFactura.razonSocial?.trim()) {
      sePuedeGuardar = false;
      addLog("❌ Falta razón social");
    }

    if (!datosFactura.cif?.trim()) {
      sePuedeGuardar = false;
      addLog("❌ Falta CIF");
    }

    /* =====================================================
       BLOQUEO POR HASH
    ===================================================== */

    if (hash) {
      const existeHash = await FacturacionModel.findOne({
        usuarioId,
        "archivo.hash": hash,
      });

      if (existeHash) {
        addLog("⚠ Archivo duplicado (hash)");
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

    /* =====================================================
       BLOQUEO POR NÚMERO FACTURA
    ===================================================== */

    const existeFactura = await FacturacionModel.findOne({
      usuarioId,
      "factura.numero": datosFactura.numeroFactura,
      tipo: "MAPFRE_VIDA",
    });

    if (existeFactura) {
      addLog("⚠ Esta factura ya existe");
      sePuedeGuardar = false;
    }

    /* =====================================================
       SI NO SE PUEDE GUARDAR → SALIR
    ===================================================== */

    if (!sePuedeGuardar) {
      return res.json({
        resumen: {
          ...resultado,
          nuevaProduccion: totalNuevaProduccion,
          renovaciones: totalRenovaciones,
        },
        datosFactura,
        logs,
        sePuedeGuardar,
      });
    }

    /* =====================================================
       SUBIR A S3
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

    await FacturacionModel.create({
      usuarioId,
      tipo: "MAPFRE_VIDA",

      factura: {
        numero: datosFactura.numeroFactura,
        fecha: datosFactura.fecha,
        periodo: datosFactura.periodo,
        razonSocial: datosFactura.razonSocial,
        cif: datosFactura.cif,
      },

      resumen: {
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
        nuevaProduccion: totalNuevaProduccion,
        renovaciones: totalRenovaciones,
      },

      lineas: rows,

      archivo: {
        nombreOriginal: req.file?.originalname,
        hash,
        size: req.file?.size,
        s3Key: s3Result.key,
      },

      logs,
      sePuedeGuardar,
      usandoLiquidoOficial: resultado.usandoLiquidoOficial,
    });

    addLog("✅ Factura guardada correctamente");

    return res.json({
      resumen: {
        ...resultado,
        nuevaProduccion: totalNuevaProduccion,
        renovaciones: totalRenovaciones,
      },
      datosFactura,
      logs,
      sePuedeGuardar,
    });

  } catch (error) {
    console.error("🔥 ERROR MAPFRE VIDA:", error);
    return res.status(500).json({
      error: "Error procesando MAPFRE VIDA",
    });
  }
};