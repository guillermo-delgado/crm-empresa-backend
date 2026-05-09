import { Request, Response } from "express";
import pdfParse from "pdf-parse";
import { procesarPdfConPython } from "../../../utils/procesarPdfConPython";

type ResumenCalculo = {
  abonos: number;
  extornos: number;
  base: number;
  irpf: number;
  compensaciones: number;
  otrosGastos: number;
  liquido: number;
};

const parseImporte = (value: string) =>
  parseFloat(value.replace(/\./g, "").replace(",", "."));

function extraerTraspasoComisiones(text: string): number {
  const lines = text.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.toUpperCase();

    if (line.includes("TRASPASO")) {
      const match = line.match(/-?\d+,\d{2}/);

      if (match) {
        return parseFloat(
          match[0].replace(/\./g, "").replace(",", ".")
        );
      }
    }
  }

  return 0;
}

function extraerOtrosGastosTributables(text: string): number {
  const regex = /OTROS GASTOS TRIBUTABLES[\s\S]{0,80}?(-?\d[\d\.]*,\d{2})/i;
  const match = text.match(regex);

  if (!match) return 0;

  return parseFloat(
    match[1].replace(/\./g, "").replace(",", ".")
  );
}

const extractRowsFromPdfText = (text: string, logs: string[]) => {
  const rows: any[] = [];
  const lines = text.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const fechaMatch = line.match(/\d{2}\/\d{2}\/\d{4}/);
    if (!fechaMatch) continue;

    const fechaIndex = line.indexOf(fechaMatch[0]);

    const antesFecha = line.substring(0, fechaIndex).trim();
    if (!antesFecha) continue;

    const ultimoChar = antesFecha.slice(-1).toUpperCase();
    if (ultimoChar !== "N" && ultimoChar !== "C") continue;

    const tipoProduccion = ultimoChar as "N" | "C";

    const numeros = line.match(/-?\d+,\d{2}/g);
    if (!numeros || numeros.length === 0) continue;

    const comision = parseImporte(numeros[numeros.length - 1]);
    if (isNaN(comision)) continue;

    rows.push({
      tipoProduccion,
      comision,
      lineaOriginal: line,
    });
  }

  logs.push(`Filas válidas detectadas: ${rows.length}`);
  return rows;
};

const extractLiquidoFromPdf = (text: string): number | null => {
  const match = text.match(
    /IMPORTE\s+LIQUIDO[\s\.]+(-?\d+,\d{2})/i
  );

  if (!match) return null;

  return parseImporte(match[1]);
};

export const procesarMapfreEspana = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No se ha enviado archivo",
      });
    }

    try {
      console.log("🐍 Procesando MAPFRE España con Python como motor principal...");

      const resultadoPython = await procesarPdfConPython(req.file.buffer);

      if (
        resultadoPython?.ok &&
        resultadoPython?.resumen &&
        Array.isArray(resultadoPython?.rows) &&
        resultadoPython.rows.length > 0
      ) {
        return res.json({
          resumen: resultadoPython.resumen,
          datosFactura: resultadoPython.datosFactura,
          rows: resultadoPython.rows,
          totalesProduccion: resultadoPython.totalesProduccion,
          desglose: resultadoPython.desglose,
          logs: resultadoPython.logs || [],
          metodo: resultadoPython.metodo,
          sePuedeGuardar:
            Math.abs(Number(resultadoPython.resumen.diferenciaBase || 0)) <= 0.02,
        });
      }

      console.warn("⚠ Python no devolvió resultado válido. Entrando en fallback TypeScript...");
    } catch (pythonError) {
      console.error("⚠ Error en Python. Entrando en fallback TypeScript:", pythonError);
    }

    const data = await pdfParse(req.file.buffer);
    const text = data.text;

    const logs: string[] = [];
    const addLog = (msg: string) => logs.push(msg);

    addLog("⚠ Procesado con fallback TypeScript");
    addLog("DEBUG BUSQUEDA OTROS GASTOS:");
    addLog(text.includes("OTROS GASTOS") ? "ENCONTRADO" : "NO ENCONTRADO");

    const rows = extractRowsFromPdfText(text, logs);
    const liquidoPdfOficial = extractLiquidoFromPdf(text);

    let abonos = 0;
    let extornos = 0;
    let contadorN = 0;
    let contadorC = 0;

    rows.forEach((row, index) => {
      addLog(
        `✔ [${index + 1}] ${row.tipoProduccion} | ${row.comision.toFixed(2)}`
      );

      if (row.tipoProduccion === "N") contadorN++;
      if (row.tipoProduccion === "C") contadorC++;

      if (row.comision > 0) abonos += row.comision;
      if (row.comision < 0) extornos += Math.abs(row.comision);
    });

    addLog(`📊 Total N detectadas: ${contadorN}`);
    addLog(`📊 Total C detectadas: ${contadorC}`);

    let base = abonos - extornos;

    const traspaso = extraerTraspasoComisiones(text);

    if (traspaso !== 0) {
      base += Math.abs(traspaso);
      addLog(`🔁 Traspaso detectado: ${traspaso.toFixed(2)} € (sumado en positivo)`);
    }

    const otrosGastos = extraerOtrosGastosTributables(text);
    addLog("DEBUG OTROS GASTOS: " + otrosGastos);

    if (otrosGastos !== 0) {
      base += otrosGastos;
      addLog(`➕ Otros gastos tributables sumados: ${otrosGastos.toFixed(2)} €`);
    }

    const irpf = Number((base * 0.15).toFixed(2));
    const liquidoCalculado = Number((base - irpf).toFixed(2));

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

    addLog(`📄 Líquido oficial PDF: ${liquidoPdfOficial ?? "NO ENCONTRADO"}`);
    addLog(`📏 Diferencia detectada: ${diferencia.toFixed(2)} €`);

    if (usandoLiquidoPdf) {
      addLog("⚠ Se usa el líquido oficial del PDF (ajuste por redondeo)");
    }

    addLog(`💰 Abonos: ${abonos.toFixed(2)} €`);
    addLog(`🔻 Extornos: ${extornos.toFixed(2)} €`);
    addLog(`📈 Base final ajustada: ${base.toFixed(2)} €`);
    addLog(`🧾 IRPF 15%: ${irpf.toFixed(2)} €`);
    addLog(`🧮 Líquido calculado: ${liquidoCalculado.toFixed(2)} €`);

    const resumen: ResumenCalculo = {
      abonos,
      extornos,
      base,
      irpf,
      compensaciones: 0,
      otrosGastos,
      liquido: liquidoFinal,
    };

    return res.json({
      resumen,
      logs,
      metodo: "typescript_fallback",
    });

  } catch (error) {
    console.error("Error procesando MAPFRE ESPAÑA:", error);

    return res.status(500).json({
      error: "Error procesando PDF MAPFRE ESPAÑA",
    });
  }
};