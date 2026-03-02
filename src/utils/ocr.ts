import path from "path";
import fs from "fs";
import Tesseract from "tesseract.js";

const Poppler = require("pdf-poppler");

export const extraerTextoConOCR = async (
  buffer: Buffer
): Promise<string> => {

  console.log("🔴 Activando OCR con conversión PDF→Imagen...");

  const tempDir = path.join(__dirname, "../../temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const pdfPath = path.join(tempDir, "temp.pdf");
  fs.writeFileSync(pdfPath, buffer);

  const opts = {
    format: "png",
    out_dir: tempDir,
    out_prefix: "page",
    page: 1
  };

  await Poppler.convert(pdfPath, opts);

  const imagePath = path.join(tempDir, "page-1.png");

  const { data } = await Tesseract.recognize(
    imagePath,
    "spa"
  );

  return data.text || "";
};