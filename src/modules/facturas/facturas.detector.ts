export type TipoFactura =
  | "MAPFRE_VIDA"
  | "MAPFRE_ESPANA"
  | "DESCONOCIDO";

export const detectarTipoFactura = (
  text: string,
  fileName?: string
): TipoFactura => {
  const nombre = (fileName || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  /* =====================================================
     PRIORIDAD 1 — NOMBRE DE ARCHIVO
  ===================================================== */

  if (nombre.includes("VIDA")) {
    return "MAPFRE_VIDA";
  }

  if (
    nombre.includes("ESPANA") ||
    nombre.includes("ESP")
  ) {
    return "MAPFRE_ESPANA";
  }

  /* =====================================================
     PRIORIDAD 2 — SI NO HAY TEXTO, NO USAR GOOGLE OCR
     Python será quien procese el PDF
  ===================================================== */

  if (!text || text.trim().length < 50) {
    console.log("🐍 Texto insuficiente → procesará Python");
    return "MAPFRE_ESPANA";
  }

  /* =====================================================
     PRIORIDAD 3 — TEXTO NORMALIZADO
  ===================================================== */

  const normalizado = text
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0000-\u001F]/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim();

  /* =====================================================
     PRIORIDAD 4 — CIF
  ===================================================== */

  if (normalizado.includes("A28229599")) {
    return "MAPFRE_VIDA";
  }

  if (normalizado.includes("A28141935")) {
    return "MAPFRE_ESPANA";
  }

  /* =====================================================
     PRIORIDAD 5 — TEXTO FLEXIBLE
  ===================================================== */

  if (
    normalizado.includes("MAPFREVIDA") ||
    (normalizado.includes("MAPFRE") && normalizado.includes("VIDA"))
  ) {
    return "MAPFRE_VIDA";
  }

  if (
    normalizado.includes("MAPFREESPANA") ||
    normalizado.includes("MAPFREESPA") ||
    (normalizado.includes("MAPFRE") && normalizado.includes("ESPA"))
  ) {
    return "MAPFRE_ESPANA";
  }

  /* =====================================================
     ÚLTIMO FALLBACK — PYTHON
  ===================================================== */

  console.log("🐍 Tipo no claro → procesará Python");
  return "MAPFRE_ESPANA";
};