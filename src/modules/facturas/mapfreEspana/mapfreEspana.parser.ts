import { LineaMapfreEspana } from "./mapfreEspana.types";

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

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {

    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;

    // 1️⃣ Debe contener fecha
    const fechaMatch = line.match(/\d{2}\/\d{2}\/\d{4}/);
    if (!fechaMatch) continue;

    const fechaIndex = line.indexOf(fechaMatch[0]);

    // 2️⃣ Bloque antes de la fecha
    let antesFecha = line.substring(0, fechaIndex).trim();

    if (!antesFecha) continue;

    // 🔥 Obtener última letra real (N o C)
    const ultimoChar = antesFecha.slice(-1).toUpperCase();

    if (ultimoChar !== "N" && ultimoChar !== "C") continue;

    const tipoProduccion = ultimoChar as "N" | "C";

    // 3️⃣ Tomador = todo menos la última letra
    const tomador = antesFecha.slice(0, -1).trim();

    if (!tomador || tomador.length < 3) continue;

    // 4️⃣ Extraer comisión (último decimal de la línea)
    const numeros = line.match(/-?\d+,\d{2}/g);
    if (!numeros || numeros.length === 0) continue;

    const ultima = numeros[numeros.length - 1];

    const comision = parseFloat(
      ultima.replace(/\./g, "").replace(",", ".")
    );

    if (isNaN(comision)) continue;

    rows.push({
      comision,
      tomador,
      concepto: line,
      tipoProduccion,
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

/* =====================================================
   EXTRAER IMPORTE LÍQUIDO OFICIAL
===================================================== */
export function extraerLiquidoOficialMapfreEspana(
  text: string
): number | null {
  if (!text) return null;

  const match = text.match(
    /IMPORTE\s+LIQUIDO[\s\.]+(-?[\d\.]+,\d{2})/i
  );

  if (!match) return null;

  const valor = parseFloat(
    match[1].replace(/\./g, "").replace(",", ".")
  );

  return isNaN(valor) ? null : valor;
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

  /* ================= Nº FACTURA ================= */

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