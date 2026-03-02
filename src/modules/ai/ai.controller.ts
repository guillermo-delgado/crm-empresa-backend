import { Request, Response } from "express";
import { extractPdfByPage } from "./pdf.extractor";
import { extractLineasFromPage, toStructuredText } from "./mapfre.normalizer";
import { analyzeDocumentWithAI } from "./ai.service";
import { validateDocumento } from "./ai.validator";

export const analyzeDocumentController = async (
  req: Request,
  res: Response
) => {
  try {
    const file = req.file as Express.Multer.File;

    if (!file) {
      return res.status(400).json({
        error: "No se ha enviado archivo",
      });
    }

    /* =========================
       1️⃣ EXTRAER PDF POR PÁGINA
    ========================= */
    const pages = await extractPdfByPage(file.buffer);
    console.log("=== TEXTO PÁGINA 1 ===");
console.log(pages[0]?.content);
console.log("======================");

    if (!pages || pages.length === 0) {
      return res.status(400).json({
        error: "No se pudo extraer contenido del PDF",
      });
    }

    /* =========================
       2️⃣ EXTRAER LÍNEAS MAPFRE
    ========================= */
    let allLineas = [];

    for (const page of pages) {
      const lineas = extractLineasFromPage(page.content);
      allLineas.push(...lineas);
    }

    if (allLineas.length === 0) {
      return res.status(400).json({
        error: "No se detectaron líneas de comisión",
      });
    }

    /* =========================
       3️⃣ NORMALIZAR A FORMATO ESTRUCTURADO
    ========================= */
    const structuredText = toStructuredText(allLineas);

    /* =========================
       4️⃣ ANALIZAR CON IA
    ========================= */
    const aiResult = await analyzeDocumentWithAI(structuredText);

    /* =========================
       5️⃣ VALIDACIÓN BACKEND
    ========================= */
    const validated = validateDocumento(aiResult);

    return res.json({
      lineas_detectadas: allLineas.length,
      resultado: validated,
    });

  } catch (error: any) {
    console.error("AI Controller Error:", error);

    return res.status(500).json({
      error: "Error procesando documento",
      detail: error.message || String(error),
    });
  }
};