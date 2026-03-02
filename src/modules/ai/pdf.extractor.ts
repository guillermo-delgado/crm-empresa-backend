import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

export async function extractPdfByPage(buffer: Buffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
  });

  const pdf = await loadingTask.promise;

  const pages: { page: number; content: string }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    const text = textContent.items
      .map((item: any) => item.str)
      .join(" ");

    pages.push({
      page: i,
      content: text,
    });
  }

  return pages;
}