import { Request, Response } from "express";
import pdfParse from "pdf-parse";

import { detectarTipoFactura } from "./facturas.detector";

import { procesarMapfreVidaService } 
  from "./mapfreVida/mapfreVida.service";

import { procesarMapfreEspanaService } 
  from "./mapfreEspana/mapfreEspana.service";

import { generarHash } from "../../utils/hashFile";
import FacturacionModel from "./mapfreVida/mapfreVida.model";
import { generarUrlFirmada } from "../../services/generarUrlFirmada";
import { extraerTextoConOCR } from "../../utils/ocr";

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
   5️⃣ Intentar extracción normal con pdf-parse
===================================================== */

let text = "";
let usadoOCR = false;

try {
  const pdf = await pdfParse(req.file.buffer);
  text = pdf.text || "";
} catch (err) {
  console.log("⚠️ Error en pdf-parse:", err);
}

console.log("====================================");
console.log("DEBUG EXTRACCIÓN PDF");
console.log("====================================");
console.log("LONGITUD TEXTO:", text.length);
console.log("====================================");

/* =====================================================
   6️⃣ FALLBACK OCR si texto vacío o muy corto
===================================================== */

if (!text || text.trim().length < 80) {

  console.log("⚠️ Texto insuficiente. Activando OCR...");

  text = await extraerTextoConOCR(req.file.buffer);
  usadoOCR = true;

  console.log("====================================");
  console.log("DEBUG OCR");
  console.log("====================================");
  console.log("LONGITUD TEXTO OCR:", text.length);
  console.log("====================================");
}

if (!text || text.trim().length < 50) {
  return res.status(400).json({
    error: "No se pudo extraer texto válido del PDF.",
  });
}

/* =====================================================
   🔥 NORMALIZACIÓN FUERTE POST-OCR
===================================================== */

text = text
  .normalize("NFD")                          // separa acentos
  .replace(/[\u0300-\u036f]/g, "")           // elimina acentos
  .replace(/\u00A0/g, " ")                   // elimina NBSP
  .replace(/[^\x20-\x7E\n]/g, " ")           // elimina caracteres invisibles
  .replace(/\s{2,}/g, " ")                   // limpia espacios múltiples
  .replace(/\n{3,}/g, "\n\n")                // limpia saltos excesivos
  .trim();

console.log("====================================");
console.log("TEXTO FINAL NORMALIZADO (primeros 500)");
console.log("====================================");
console.log(text.slice(0, 500));
console.log("====================================");
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: "No se pudo extraer texto del PDF ni con OCR.",
      });
    }

    /* =====================================================
       DEBUG DETECTOR
    ===================================================== */

    console.log("====================================");
    console.log("DEBUG DETECTOR FACTURA");
    console.log("====================================");
    console.log("INCLUDES MAPFRE?", text.toUpperCase().includes("MAPFRE"));
    console.log("INCLUDES VIDA?", text.toUpperCase().includes("VIDA"));
    console.log("INCLUDES ESPA?", text.toUpperCase().includes("ESPA"));
    console.log("INCLUDES MAPFRE VIDA?", text.toUpperCase().includes("MAPFRE VIDA"));
    console.log("INCLUDES MAPFRE ESPA?", text.toUpperCase().includes("MAPFRE ESPA"));
    console.log("====================================");

    /* 7️⃣ Detectar tipo */
    const tipo = detectarTipoFactura(
      text,
      req.file.originalname
    );

    console.log("TIPO DETECTADO:", tipo);

    /* 8️⃣ Enrutar */
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
   OBTENER ARCHIVO (URL FIRMADA 5 MIN)
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