import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

export const extraerTextoPDF = async (buffer: Buffer) => {

  const uint8Array = new Uint8Array(buffer);

  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;

  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {

    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    console.log("====================================");
    console.log("PAGE:", i);
    console.log("ITEMS LENGTH:", content.items.length);
    console.log("PRIMER ITEM:", content.items[0]);
    console.log("====================================");

    const items = content.items as any[];

    /* =====================================================
       🔥 RECONSTRUCCIÓN DE LÍNEAS POR POSICIÓN Y
    ===================================================== */

    const lineas: string[] = [];

    let lineaActual = "";
    let lastY: number | null = null;

    items.forEach(item => {

      const str = item.str?.trim();
      if (!str) return;

      const y = item.transform[5]; // posición vertical

      if (lastY === null) {
        lineaActual = str;
        lastY = y;
        return;
      }

      // 🔥 NUEVA LÍNEA SI CAMBIA ALTURA
      if (Math.abs(y - lastY) > 2) {
        lineas.push(lineaActual);
        lineaActual = str;
        lastY = y;
      } else {
        lineaActual += " " + str;
      }

    });

    if (lineaActual) lineas.push(lineaActual);

    /* =====================================================
       🔥 NORMALIZACIÓN FINAL
    ===================================================== */

    const textoPagina = lineas
      .map(l => l.replace(/[ ]{2,}/g, " ").trim())
      .join("\n");

    fullText += textoPagina + "\n";
  }

  return fullText;
};