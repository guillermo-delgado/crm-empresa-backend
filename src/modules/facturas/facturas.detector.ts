export type TipoFactura =
  | "MAPFRE_VIDA"
  | "MAPFRE_ESPANA"
  | "DESCONOCIDO";

export const detectarTipoFactura = (
  text: string,
  fileName?: string
): TipoFactura => {

  const nombre = (fileName || "").toUpperCase();

  /* =====================================================
     🔥 PRIORIDAD 1 — NOMBRE DE ARCHIVO
  ===================================================== */

  if (nombre.includes("VIDA")) {
    return "MAPFRE_VIDA";
  }

  if (
    nombre.includes("ESPANA") ||
    nombre.includes("ESPAÑA") ||
    nombre.includes("ESP")
  ) {
    return "MAPFRE_ESPANA";
  }

  if (!text || text.trim().length === 0) {
    return "DESCONOCIDO";
  }

  /* =====================================================
     🔥 NORMALIZACIÓN ULTRA AGRESIVA (OCR SAFE)
  ===================================================== */

  const normalizado = text
    .toUpperCase()
    .normalize("NFD")                         // separa acentos
    .replace(/[\u0300-\u036f]/g, "")          // elimina acentos
    .replace(/[\u0000-\u001F]/g, "")          // elimina caracteres invisibles
    .replace(/[^A-Z0-9]/g, "")                // elimina TODO menos letras y números
    .trim();

  /* =====================================================
     🔥 PRIORIDAD 2 — CIF (MÁS FIABLE QUE EL TEXTO)
  ===================================================== */

  if (normalizado.includes("A28229599")) {
    return "MAPFRE_VIDA";
  }

  if (normalizado.includes("A28141935")) {
    return "MAPFRE_ESPANA";
  }

  /* =====================================================
     🔥 PRIORIDAD 3 — TEXTO FLEXIBLE SIN ESPACIOS
  ===================================================== */

  // VIDA
  if (
    normalizado.includes("MAPFREVIDA") ||
    (
      normalizado.includes("MAPFRE") &&
      normalizado.includes("VIDA")
    )
  ) {
    return "MAPFRE_VIDA";
  }

  // ESPAÑA
  if (
    normalizado.includes("MAPFREESPANA") ||
    normalizado.includes("MAPFREESPA") ||
    (
      normalizado.includes("MAPFRE") &&
      normalizado.includes("ESPA")
    )
  ) {
    return "MAPFRE_ESPANA";
  }

  /* =====================================================
     🔥 PRIORIDAD 4 — OCR IMPERFECTO (CASOS EXTREMOS)
     Detecta si OCR ha roto palabras
  ===================================================== */

  // MAPFRE detectado parcialmente
  const tieneMapfre =
    normalizado.includes("MAPFRE") ||
    normalizado.includes("MAPFRE") ||
    normalizado.includes("MAPF") ||
    normalizado.includes("MPFRE");

  if (tieneMapfre && normalizado.includes("VIDA")) {
    return "MAPFRE_VIDA";
  }

  if (tieneMapfre && normalizado.includes("ESPA")) {
    return "MAPFRE_ESPANA";
  }

  return "DESCONOCIDO";
};