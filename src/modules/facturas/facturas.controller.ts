import { Request, Response } from "express";
// ❌ import pdfParse from "pdf-parse";


import { detectarTipoFactura } from "./facturas.detector";

import { procesarMapfreVidaService } 
  from "./mapfreVida/mapfreVida.service";

import { procesarMapfreEspanaService } 
  from "./mapfreEspana/mapfreEspana.service";

import { generarHash } from "../../utils/hashFile";
import FacturacionModel from "./mapfreVida/mapfreVida.model";
import { generarUrlFirmada } from "../../services/generarUrlFirmada";

// ✅ NUEVO IMPORT
import { extraerTextoPDF } from "../../utils/extractTextPdf";
import { procesarPdfConPython } from "../../utils/procesarPdfConPython";

/* =====================================================
   PROCESAR FACTURA (INTERCEPTOR CENTRAL)
===================================================== */
export const procesarFactura = async (
  req: Request,
  res: Response
) => {
  console.log("🟢 ENTRA EN procesarFactura");

  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No se ha enviado archivo",
      });
    }

    /* 1️⃣ Validar usuario */
    const usuarioId = (req as any).user?.id;

    if (!usuarioId) {
      return res.status(401).json({
        error: "Usuario no autenticado",
      });
    }

    /* 2️⃣ Generar hash */
    const hash = generarHash(req.file.buffer);

    /* 3️⃣ Verificar duplicado */
    const existente = await FacturacionModel.findOne({
      "archivo.hash": hash,
      usuarioId,
    });

    if (existente) {
      return res.status(400).json({
        error: "Esta factura ya fue subida anteriormente",
      });
    }

    /* 4️⃣ Guardar hash para service */
    (req as any).fileHash = hash;

    /* =====================================================
       5️⃣ PYTHON COMO MOTOR PRINCIPAL — SIN ARCHIVO TEMPORAL
    ===================================================== */

    let text = "";
    let usadoOCR = false;

    try {
      console.log("🐍 Procesando factura con Python como motor principal...");

      const resultadoPython = await procesarPdfConPython(
        req.file.buffer,
        (progreso: { porcentaje: number; texto: string }) => {
          const io = req.app.get("io");

          if (!io) return;
console.log("📡 EMITIENDO PROGRESO FACTURA:", progreso);
console.log("📡 ROOM:", `user:${usuarioId}`);
          io.to(`user:${usuarioId}`).emit("factura_progreso", {
            porcentaje: progreso.porcentaje,
            texto: progreso.texto,
          });
        }
      );

      if (resultadoPython && resultadoPython.ok) {
        console.log("🔥 USANDO PYTHON COMO FUENTE PRINCIPAL");

        (req as any).resultadoPython = resultadoPython;

        text = resultadoPython.text || "";
        usadoOCR = false;
      } else {
        console.log("⚠️ Python no devolvió resultado válido. Intentando fallback TypeScript...");
      }

    } catch (error) {
      console.log("❌ Error en Python principal:", error);
      console.log("⚠️ Intentando fallback TypeScript...");
    }

    /* =====================================================
       6️⃣ FALLBACK TYPESCRIPT — SOLO SI PYTHON FALLA
       Google OCR eliminado
    ===================================================== */

    if (!text || text.trim().length < 50) {
      try {
        text = await extraerTextoPDF(req.file.buffer);
        usadoOCR = false;

        console.log("⚠️ Fallback TypeScript usado");
      } catch (err) {
        console.log("❌ Error en fallback TypeScript:", err);
      }
    }

    if (!text || text.trim().length < 50) {
      return res.status(400).json({
        error: "No se pudo extraer texto válido del PDF con Python ni con fallback TypeScript.",
      });
    }

    /* =====================================================
       🔥 NORMALIZACIÓN
    ===================================================== */

    text = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u00A0/g, " ")
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: "No se pudo extraer texto del PDF.",
      });
    }

    /* =====================================================
       7️⃣ Detectar tipo
    ===================================================== */

    const tipo = detectarTipoFactura(
      text,
      req.file.originalname
    );

    console.log("TIPO DETECTADO:", tipo);

    /* =====================================================
       8️⃣ Enrutar
    ===================================================== */

    switch (tipo) {
      case "MAPFRE_VIDA":
        console.log("🟢 DETECTADO MAPFRE VIDA");
        return procesarMapfreVidaService(text, req, res);

      case "MAPFRE_ESPANA":
        console.log("🟢 DETECTADO MAPFRE ESPAÑA");
        return procesarMapfreEspanaService(text, req, res);

      default:
        return res.status(400).json({
          error: "Tipo de factura no reconocido o no implementado",
        });
    }

  } catch (error) {
    console.error("🔥 Error procesando factura:", error);

    return res.status(500).json({
      error: "Error procesando factura",
    });
  }
};

/* =====================================================
   OBTENER ARCHIVO (SIN CAMBIOS)
===================================================== */
export const obtenerArchivoFactura = async (
  req: Request,
  res: Response
) => {

  try {

    const usuarioId = (req as any).user?.id;
    const facturaId = req.params.id;

    if (!usuarioId) {
      return res.status(401).json({
        error: "Usuario no autenticado",
      });
    }

    const factura = await FacturacionModel.findOne({
      _id: facturaId,
      usuarioId,
    });

    if (!factura || !factura.archivo?.s3Key) {
      return res.status(404).json({
        error: "Factura no encontrada",
      });
    }

    const url = await generarUrlFirmada(
      factura.archivo.s3Key
    );

    return res.json({ url });

  } catch (error) {

    console.error("Error generando URL firmada:", error);

    return res.status(500).json({
      error: "Error generando enlace temporal",
    });
  }
};