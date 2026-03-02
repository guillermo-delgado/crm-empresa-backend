import { LineaMapfreVida } from "./mapfreVida.types";

/* =====================================================
   PARSEAR LÍNEAS MAPFRE VIDA
   - Detecta N / C
   - Extrae comisión
   - Extrae tomador
===================================================== */
export function parseMapfreVidaFromText(
  text: string
): LineaMapfreVida[] {
  const rows: LineaMapfreVida[] = [];

  if (!text || typeof text !== "string") {
    return rows;
  }

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 1️⃣ Debe empezar por póliza (10+ dígitos)
    if (!/^\d{10,}/.test(line)) continue;

    // 2️⃣ Debe contener fecha
    if (!/\d{2}\/\d{2}\/\d{4}/.test(line)) continue;

    // 3️⃣ Extraer importes
    const numeros = line.match(/-?\d+,\d{2}/g);
    if (!numeros || numeros.length === 0) continue;

    const ultima = numeros[numeros.length - 1];

    const comision = parseFloat(
      ultima.replace(/\./g, "").replace(",", ".")
    );

    if (isNaN(comision)) continue;

    // 4️⃣ Extraer tomador + tipo N/C
    const match = line.match(
      /^(\d{10,})(.+?)([NC])\s*\d{2}\/\d{2}\/\d{4}/
    );

    let tomador = "///";
    let tipoProduccion: "N" | "C" | undefined;

    if (match && match.length >= 4) {
      tomador = match[2]?.trim() || "///";

      const tipo = match[3];
      if (tipo === "N" || tipo === "C") {
        tipoProduccion = tipo;
      }
    }

    rows.push({
      comision,
      tomador,
      tipoProduccion,
    });
  }

  return rows;
}

/* =====================================================
   CALCULAR TOTALES N Y C
===================================================== */
export function calcularTotalesProduccion(
  rows: LineaMapfreVida[]
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
export function extraerLiquidoOficial(
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
   DATOS FACTURA
===================================================== */
export interface DatosFacturaMapfreVida {
  numeroFactura: string;
  fecha: string;
  periodo: string;
  razonSocial: string;
  cif: string;
}

export function extraerDatosFacturaMapfreVida(
  text: string
): DatosFacturaMapfreVida {

  const lines = text.split(/\r?\n/);

  let numeroFactura = "";
  let fecha = "";
  let periodo = "";

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

  const razonMatch =
    text.match(/MAPFRE VIDA.*?SEGUROS.*?/i);
  const razonSocial = razonMatch
    ? razonMatch[0].trim()
    : "";

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