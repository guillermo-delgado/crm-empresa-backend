import { LineaMapfreEspana } from "./mapfreEspana.types";

/* =====================================================
   🔥 AGRUPAR FILAS (ROBUSTO PARA OCR)
===================================================== */

export function agruparFilas(text: string): string[] {

  const lineas = text.split(/\r?\n/);

  const filas: string[] = [];
  let buffer = "";

  for (const rawLinea of lineas) {

    const linea = rawLinea.trim();

    if (!linea) continue;

    // 🔥 Detecta póliza en cualquier parte (más robusto)
    const tienePoliza = /\b\d{10,}\b/.test(linea);

    if (tienePoliza) {

      if (buffer) filas.push(buffer.trim());

      buffer = linea;

    } else {

      if (buffer) {
        buffer += " " + linea;
      }
    }
  }

  if (buffer) filas.push(buffer.trim());

  return filas;
}


/* =====================================================
   🔥 NORMALIZAR OCR → INSERTAR "|"
===================================================== */

function normalizarLinea(linea: string): string {

  const limpia = linea
    .replace(/[ ]{2,}/g, " ")
    .trim();

  const match = limpia.match(
    /(\d{10,})\s+(.*?)\s+([NC])\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/
  );

  if (!match) return linea;

  const [
    _,
    poliza,
    tomador,
    tipo,
    fecha,
    total,
    prima,
    porcentaje,
    comision
  ] = match;

  return [
    poliza,
    tomador,
    tipo,
    fecha,
    total,
    prima,
    porcentaje,
    comision
  ].join(" | ");
}


/* =====================================================
   🔥 PARSEAR FILA (FORMATO MAPFRE)
===================================================== */

export function parseFila(linea: string): LineaMapfreEspana | null {

  // 🔥 PRIMERO normalizamos OCR → añadimos "|"
  const lineaNormalizada = normalizarLinea(linea);

  const limpia = lineaNormalizada
    .replace(/[ ]{2,}/g, " ")
    .replace(/\s*\|\s*/g, "|")
    .trim();

  const partes = limpia.split("|");

  if (partes.length < 8) return null;

  const [
    polizaRaw,
    tomadorRaw,
    tipoProduccionRaw,
    fechaVencimientoRaw,
    totalReciboRaw,
    primaBaseRaw,
    porcentajeRaw,
    comisionRaw
  ] = partes;

  const poliza = polizaRaw.trim();
  const tomador = tomadorRaw.trim();

  // 🔥 Validación mínima
  if (!poliza || !tomador) return null;
  if (!/^\d{10,}$/.test(poliza)) return null;

  /* ================= NORMALIZAR TIPO PRODUCCIÓN ================= */

  const tipo = tipoProduccionRaw.trim().toUpperCase();

  const tipoProduccion =
    tipo === "N" || tipo === "C"
      ? tipo
      : undefined;

  /* ================= PARSER NÚMEROS EURO ================= */

  const parseNumero = (valor: string): number => {

    if (!valor) return 0;

    const limpio = valor
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");

    const num = parseFloat(limpio);

    return isNaN(num) ? 0 : num;
  };

  return {
    poliza,
    tomador,
    tipoProduccion,
    fechaVencimiento: fechaVencimientoRaw?.trim(),
    totalRecibo: parseNumero(totalReciboRaw),
    primaBase: parseNumero(primaBaseRaw),
    porcentaje: parseNumero(porcentajeRaw),
    comision: parseNumero(comisionRaw)
  };
}