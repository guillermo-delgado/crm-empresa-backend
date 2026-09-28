export type TipoFactura =
  | "MAPFRE_VIDA"
  | "MAPFRE_ESPANA"
  | "DESCONOCIDO";

export type SubtipoFacturaVida =
  | "VIDA_NORMAL"
  | "VIDA_INVERSION";

export const detectarTipoFactura = (
  text: string,
  fileName?: string
): {
  tipoFactura: TipoFactura;
  subtipoFactura?: SubtipoFacturaVida;
} => {

  const nombre = (fileName || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const textoUpper = (text || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  /* =====================================================
     DETECCIÓN SUBTIPO VIDA INVERSIÓN
  ===================================================== */

  const textoCompacto = textoUpper
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");

  const esVidaInversion =
    (
      textoCompacto.includes("BASELIQUIDACION") ||
      textoCompacto.includes("BASELIQUIDAC")
    ) &&
    textoCompacto.includes("BRUTO") &&
    (
      textoCompacto.includes("DEVENGADO") ||
      textoCompacto.includes("ANULADO")
    ) &&
    (
      textoCompacto.includes("NRECIBO") ||
      textoCompacto.includes("NORECIBO")
    ) &&
    (
      textoCompacto.includes("PRIMANETA") ||
      textoCompacto.includes("TOTALPRIMA")
    );

  console.log(
    "SUBTIPO VIDA DETECTADO:",
    esVidaInversion
      ? "VIDA_INVERSION"
      : "VIDA_NORMAL"
  );

  /* =====================================================
     PRIORIDAD 1 — NOMBRE DE ARCHIVO
  ===================================================== */

  if (nombre.includes("VIDA")) {
    return {
      tipoFactura: "MAPFRE_VIDA",
      subtipoFactura: esVidaInversion
        ? "VIDA_INVERSION"
        : "VIDA_NORMAL",
    };
  }

  if (
    nombre.includes("ESPANA") ||
    nombre.includes("ESP")
  ) {
    return {
      tipoFactura: "MAPFRE_ESPANA",
    };
  }

  /* =====================================================
     PRIORIDAD 2 — SI NO HAY TEXTO
  ===================================================== */

  if (!text || text.trim().length < 50) {
    console.log("🐍 Texto insuficiente → procesará Python");

    return {
      tipoFactura: "MAPFRE_ESPANA",
    };
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
    return {
      tipoFactura: "MAPFRE_VIDA",
      subtipoFactura: esVidaInversion
        ? "VIDA_INVERSION"
        : "VIDA_NORMAL",
    };
  }

  if (normalizado.includes("A28141935")) {
    return {
      tipoFactura: "MAPFRE_ESPANA",
    };
  }

  /* =====================================================
     PRIORIDAD 5 — TEXTO FLEXIBLE
  ===================================================== */

  if (
    normalizado.includes("MAPFREVIDA") ||
    (
      normalizado.includes("MAPFRE") &&
      normalizado.includes("VIDA")
    )
  ) {
    return {
      tipoFactura: "MAPFRE_VIDA",
      subtipoFactura: esVidaInversion
        ? "VIDA_INVERSION"
        : "VIDA_NORMAL",
    };
  }

  if (
    normalizado.includes("MAPFREESPANA") ||
    normalizado.includes("MAPFREESPA") ||
    (
      normalizado.includes("MAPFRE") &&
      normalizado.includes("ESPA")
    )
  ) {
    return {
      tipoFactura: "MAPFRE_ESPANA",
    };
  }

  /* =====================================================
     ÚLTIMO FALLBACK
  ===================================================== */

  console.log("🐍 Tipo no claro → procesará Python");

  return {
    tipoFactura: "MAPFRE_ESPANA",
  };
};