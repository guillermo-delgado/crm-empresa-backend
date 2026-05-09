import { LineaMapfreEspana } from "./mapfreEspana.types";


function reconstruirLineasOCR(text: string): string[] {

  const rawLines = text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  const result: string[] = [];
  let buffer = "";

  for (const line of rawLines) {

    // 🔥 nueva fila si detecta póliza (muchos dígitos al inicio)
    if (/^\d{10,}/.test(line)) {

      if (buffer) result.push(buffer);
      buffer = line;
      continue;
    }

    // 🔥 si la línea empieza por fecha → pertenece a la anterior
    else if (/^\d{2}\/\d{2}\/\d{4}/.test(line)) {

      buffer += " " + line;
      continue;
    }

    // 🔥 NUEVO: números OCR partidos
    else if (/^-?\d[\d\.]*,\d{2}/.test(line)) {

      buffer += " " + line;
      continue;
    }

    else {

      buffer += " " + line;
    }
  }

  if (buffer) result.push(buffer);

  return result;
}

/* =====================================================
   PARSEAR LÍNEAS MAPFRE ESPAÑA
===================================================== */
export function parseMapfreEspanaFromText(
  text: string
): LineaMapfreEspana[] {

  const rows: LineaMapfreEspana[] = [];

  if (!text || typeof text !== "string") {
    return rows;
  }

  const lines = reconstruirLineasOCR(text);

  for (const rawLine of lines) {

    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;

    /* ===============================
       1️⃣ POLIZA (OBLIGATORIO)
    =============================== */

    const polizaMatch = line.match(/\b\d{10,}\b/);
    if (!polizaMatch) continue;

    const poliza = polizaMatch[0];

    /* ===============================
       2️⃣ FECHA (REAL o fallback)
    =============================== */

    const fechaMatch = line.match(/\d{2}\/\d{2}\/\d{4}/);

    const fecha = fechaMatch ? fechaMatch[0] : "";
    const fechaIndex = fechaMatch
      ? line.indexOf(fecha)
      : Math.floor(line.length / 2);

    /* ===============================
       3️⃣ BLOQUE ANTES DE FECHA
    =============================== */

    let antesFecha = line.substring(0, fechaIndex).trim();
    if (!antesFecha) continue;

    /* ===============================
       4️⃣ TIPO PRODUCCIÓN (N / C)
    =============================== */

    let tipoProduccion: "N" | "C" | null = null;

    if (/\bN\b/.test(antesFecha)) tipoProduccion = "N";
    if (/\bC\b/.test(antesFecha)) tipoProduccion = "C";

    // fallback por último carácter
    if (!tipoProduccion) {
      const ultimoChar = antesFecha.slice(-1).toUpperCase();
      if (ultimoChar === "N" || ultimoChar === "C") {
        tipoProduccion = ultimoChar as "N" | "C";
      }
    }

    if (!tipoProduccion) continue;

    /* ===============================
       5️⃣ TOMADOR LIMPIO
    =============================== */

    const tomador = antesFecha
      .replace(poliza, "")
      .replace(/\b(N|C)\b/g, "")
      .trim();

    if (!tomador || tomador.length < 3) continue;

    /* ===============================
       6️⃣ NUMEROS (COLUMNA DERECHA)
    =============================== */

    const numeros = line.match(/-?\d[\d\.]*,\d{2}/g);

    if (!numeros || numeros.length < 2) continue;

    // ⚠️ MAPFRE suele tener:
    // total, prima, %, comisión
    const totalRecibo = numeros[0] || "";
    const primaBase = numeros[1] || "";
    const porcentaje = numeros[2] || "";
    const ultima = numeros[numeros.length - 1];

    const comision = parseFloat(
      ultima.replace(/\./g, "").replace(",", ".")
    );

    if (isNaN(comision)) continue;

    /* ===============================
       🔥 DEBUG VISUAL (CLAVE)
    =============================== */

    console.log(
      "✅ LINEA:",
      [
        poliza,
        tomador,
        tipoProduccion,
        fecha,
        totalRecibo,
        primaBase,
        porcentaje,
        ultima
      ].join(" | ")
    );

    /* ===============================
       RESULTADO FINAL
    =============================== */

    rows.push({
      comision,
      tomador,
      concepto: line,
      tipoProduccion,
      fechaEfecto: fecha
    });
  }

  return rows;
}

/* =====================================================
   CALCULAR TOTALES N Y C
===================================================== */
export function calcularTotalesProduccionMapfreEspana(
  rows: LineaMapfreEspana[]
) {
  let totalNuevaProduccion = 0;
  let totalRenovaciones = 0;

  for (const row of rows) {
    if (!row.tipoProduccion) continue;

    if (row.tipoProduccion === "N") {
      totalNuevaProduccion += row.comision;
    } else if (row.tipoProduccion === "C") {
      totalRenovaciones += row.comision;
    }
  }

  return {
    totalNuevaProduccion: Number(
      totalNuevaProduccion.toFixed(2)
    ),
    totalRenovaciones: Number(
      totalRenovaciones.toFixed(2)
    ),
  };
}

export function extraerBaseResumenMapfre(text: string): number | null {

  const match = text.match(
    /BASE[\s\S]{0,100}?(-?\d[\d\.]*,\d{2})/i
  );

  if (!match) return null;

  return parseFloat(
    match[1].replace(/\./g, "").replace(",", ".")
  );
}

export function extraerIRPFMapfre(text: string): number | null {

  const match = text.match(
    /IRPF[\s\S]{0,100}?(-?\d[\d\.]*,\d{2})/i
  );

  if (!match) return null;

  return parseFloat(
    match[1].replace(/\./g, "").replace(",", ".")
  );
}

/* =====================================================
   EXTRAER IMPORTE LÍQUIDO OFICIAL
===================================================== */
export function extraerLiquidoOficialMapfreEspana(
  text: string
): number | null {

  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {

    const rawLine = lines[i];

    const line = rawLine
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9 ]/g, "");

    if (line.includes("IMPORTE") && line.includes("LIQUID")) {

      console.log("🎯 BLOQUE LIQUIDO DETECTADO");

      // 🔥 buscamos en un rango amplio (hasta 30 líneas)
      let numeros: string[] = [];

      for (let j = 0; j < 30; j++) {

        const siguiente = lines[i + j];
        if (!siguiente) break;

        const encontrados = siguiente.match(/-?\d[\d\.]*,\d{2}/g);

        if (encontrados) {
          numeros.push(...encontrados);
        }
      }

      console.log("🔢 NUMEROS DETECTADOS:", numeros);

      if (!numeros || numeros.length === 0) continue;

      // 🔥 lógica inteligente:
      // el líquido suele ser el MAYOR valor del bloque
      let max = 0;

      for (const num of numeros) {
        const val = parseFloat(
          num.replace(/\./g, "").replace(",", ".")
        );

        if (val > max) max = val;
      }

      console.log("💰 LIQUIDO DETECTADO:", max);

      return max;
    }
  }

  return null;
}

/* =====================================================
   DATOS FACTURA MAPFRE ESPAÑA
===================================================== */
export interface DatosFacturaMapfreEspana {
  numeroFactura: string;
  fecha: string;
  periodo: string;
  razonSocial: string;
  cif: string;
}

export function extraerDatosFacturaMapfreEspana(
  text: string
): DatosFacturaMapfreEspana {

  const lines = text.split(/\r?\n/);

  let numeroFactura = "";
  let fecha = "";
  let periodo = "";

  /* ================= Nº FACTURA (MÉTODO ORIGINAL) ================= */

  for (let i = 0; i < lines.length; i++) {

    const line = lines[i].toUpperCase();

    if (
      line.includes("Nº FACTURA") ||
      line.includes("N° FACTURA") ||
      line.includes("N FACTURA")
    ) {
      const siguiente = lines[i + 1] || "";

      const facturaMatch =
        siguiente.match(/\b\d{10,}[A-Z0-9]*\b/);
      if (facturaMatch) numeroFactura = facturaMatch[0];

      const fechaMatch =
        siguiente.match(/\d{2}\/\d{2}\/\d{4}/);
      if (fechaMatch) fecha = fechaMatch[0];

      const periodoMatch =
        siguiente.match(/[A-Z]+-\d{4}/);
      if (periodoMatch) periodo = periodoMatch[0];

      break;
    }
  }

  /* =====================================================
     🔥 FALLBACK OCR
  ===================================================== */

  if (!numeroFactura || !fecha || !periodo) {

    const upper = text.toUpperCase();

    if (!numeroFactura) {
      const match = upper.match(/\b\d{15,}[A-Z0-9]*\b/);
      if (match) numeroFactura = match[0];
    }

    if (!fecha) {
      const match = upper.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
      if (match) fecha = match[0];
    }

    if (!periodo) {
      const match = upper.match(
        /(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)-\d{4}/
      );
      if (match) periodo = match[0];
    }
  }

  /* ================= RAZÓN SOCIAL ================= */

  let razonSocial = "";

  const normalizado = text
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0000-\u001F]/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim();

  if (
    normalizado.includes("MAPFREESPANA") ||
    normalizado.includes("MAPFREESPA")
  ) {
    razonSocial = "Mapfre España";
  }

  /* ================= CIF ================= */

  const cifMatch = text.match(/\b[A-Z]\d{8}\b/);
  const cif = cifMatch ? cifMatch[0] : "";

  return {
    numeroFactura,
    fecha,
    periodo,
    razonSocial,
    cif,
  };
}