import { Request, Response } from "express";
import pdfParse from "pdf-parse";

type ResumenCalculo = {
  abonos: number;
  extornos: number;
  base: number;
  irpf: number;
  compensaciones: number;
  otrosGastos: number;
  liquido: number;
};

const normalize = (text: any) =>
  text
    ?.toString()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const parseImporte = (value: string) =>
  parseFloat(value.replace(/\./g, "").replace(",", "."));

/**
 * EXTRAER FILAS ADAPTADO A pdf-parse
 * Respeta estructura original del frontend
 */
const extractRowsFromPdfText = (text: string) => {
  const rows: any[] = [];
  const lines = text.split("\n");

  lines.forEach((line) => {
    // Detecta línea que empieza por número largo (póliza)
    const match = line.match(
      /^(\d{10,})(.+?)([NC])\s+(\d{2}\/\d{2}\/\d{4})(.+)$/
    );

    if (!match) return;

    const resto = match[5];

    // Extraer todos los importes tipo 0,98 o -8,10
    const importes = resto.match(/-?\d+,\d{2}/g);
    if (!importes || importes.length === 0) return;

    // La comisión es el último importe
    const comision = parseImporte(importes[importes.length - 1]);

    rows.push({
      "Comisi󮊉": comision * 100,
      "Tomador ": match[2]?.trim() || "///",
      concepto: match[2]?.trim() || "///",
    });
  });

  return rows;
};

const extractHeaderData = (text: string) => {
  return {
    numeroFactura:
      text.match(/Nº?\s*FACTURA\s+([A-Z0-9]+)/i)?.[1] || "",
    fecha:
      text.match(/(\d{2}\/\d{2}\/\d{4})/)?.[1] || "",
    periodo:
      text.match(/([A-Z]+-\d{4})/)?.[1] || "",
    razonSocialAseguradora:
      text.match(/DESTINATARIO:.*?NOMBRE\s+(.+?)\s+DOMICILIO/s)?.[1] ||
      "",
    cifAseguradora:
      text.match(/DESTINATARIO:.*?CIF\/NIF\s+([A-Z0-9]+)/s)?.[1] ||
      "",
  };
};

const extractLiquidoFromPdf = (text: string): number | null => {
  const match = text.match(
    /IMPORTE\s+LIQUIDO[\s\.]+(-?\d+,\d{2})/i
  );

  if (!match) return null;

  return parseImporte(match[1]);
};

export const procesarMapfreVida = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No se ha enviado archivo",
      });
    }

    const data = await pdfParse(req.file.buffer);
    const text = data.text;

    const logs: string[] = [];
    const addLog = (msg: string) => logs.push(msg);

    const rows = extractRowsFromPdfText(text);
    const header = extractHeaderData(text);
    const liquidoPdfOficial = extractLiquidoFromPdf(text);

    let abonos = 0;
    let extornos = 0;
    let compensaciones = 0;
    let otrosGastos = 0;

    rows.forEach((row) => {
      const rawComision = row["Comisi󮊉"];
      if (typeof rawComision !== "number") return;

      const comision = rawComision / 100;

      const firstKey = Object.keys(row)[0];
      const concepto = normalize(row[firstKey] ?? "///");
      const tomador = normalize(row["Tomador "] ?? "///");

      const esTomador =
        tomador !== "///" && tomador !== "";

      const esOficinas =
        concepto.includes("OFICINAS DELEGADAS");

      const esOtros =
        concepto.includes("OTROS GASTOS TRIBUTABLES");

      const esCompensacion =
        concepto.includes("COMPENS") &&
        concepto.includes("FACTUR") &&
        !esTomador;

      const entraEnTotal =
        esTomador ||
        esOficinas ||
        esOtros ||
        esCompensacion;

      if (!entraEnTotal) return;

      if (comision > 0) abonos += comision;
      if (comision < 0 && esTomador)
        extornos += Math.abs(comision);

      if (esCompensacion && comision < 0)
        compensaciones += Math.abs(comision);

      if (esOtros) otrosGastos += comision;
    });

    const base = abonos - extornos;
    const irpfExacto = base * 0.15;
    const irpf = Number(irpfExacto.toFixed(2));

    const liquidoCalculado = Number(
      (base - irpf - compensaciones).toFixed(2)
    );

    let liquidoFinal = liquidoCalculado;
    let diferencia = 0;
    let usandoLiquidoPdf = false;

    if (typeof liquidoPdfOficial === "number") {
      diferencia = Number(
        (liquidoPdfOficial - liquidoCalculado).toFixed(2)
      );

      if (Math.abs(diferencia) <= 0.02) {
        liquidoFinal = liquidoPdfOficial;
        usandoLiquidoPdf = true;
      }
    }

    const resumen: ResumenCalculo = {
      abonos,
      extornos,
      base,
      irpf,
      compensaciones,
      otrosGastos,
      liquido: liquidoFinal,
    };

    // LOGS EXACTOS COMO TU FRONT ORIGINAL

    addLog(`Abonos detectados: ${abonos.toFixed(2)} €`);
    addLog(`Extornos detectados: ${extornos.toFixed(2)} €`);
    addLog(`Base calculada: ${base.toFixed(2)} €`);
    addLog(`IRPF calculado: ${irpf.toFixed(2)} €`);
    addLog(`Compensaciones: ${compensaciones.toFixed(2)} €`);
    addLog(`Líquido calculado: ${liquidoCalculado.toFixed(2)} €`);

    if (typeof liquidoPdfOficial === "number") {
      addLog(
        `Líquido oficial PDF: ${liquidoPdfOficial.toFixed(2)} €`
      );
      addLog(
        `Diferencia detectada: ${diferencia.toFixed(2)} €`
      );
    }

    if (usandoLiquidoPdf) {
      addLog(
        `⚠ Se usa el líquido oficial del PDF (diferencia ≤ 0.02 €)`
      );
    }

    addLog(
      `Líquido final mostrado: ${liquidoFinal.toFixed(2)} €`
    );

    return res.json({
      resumen,
      datosFactura: header,
      logs,
    });
  } catch (error) {
    console.error("Error procesando MAPFRE VIDA:", error);
    return res.status(500).json({
      error: "Error procesando PDF",
    });
  }
};