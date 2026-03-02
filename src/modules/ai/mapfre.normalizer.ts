export type LineaNormalizada = {
  poliza: string;
  tomador: string;
  tipo: string;
  fecha: string;
  total: string;
  prima: string;
  porcentaje: string;
  comision: string;
};

/*
Patrón real MAPFRE detectado en tu PDF:

0482013725270   MEDINA   GARCIA   JESSICA   N   01/01/2026   72,27   69,15   10,00   6,91

Estructura:
[POLIZA] [NOMBRE COMPLETO] [N|C] [FECHA] [TOTAL] [PRIMA] [%] [COMISION]
*/

const LINE_REGEX =
  /(\d{10,15})\s+([A-ZÁÉÍÓÚÑ\s]+?)\s+(N|C)\s+(\d{2}\/\d{2}\/\d{4})\s+(-?[\d.,]+)\s+(-?[\d.,]+)\s+([\d.,]+)\s+(-?[\d.,]+)/g;

export function extractLineasFromPage(text: string): LineaNormalizada[] {
  const results: LineaNormalizada[] = [];

  let match;

  while ((match = LINE_REGEX.exec(text)) !== null) {
    results.push({
      poliza: match[1] ?? "///",
      tomador: match[2]?.trim() ?? "///",
      tipo: match[3] ?? "///",
      fecha: match[4] ?? "///",
      total: match[5] ?? "///",
      prima: match[6] ?? "///",
      porcentaje: match[7] ?? "///",
      comision: match[8] ?? "///",
    });
  }

  return results;
}

export function toStructuredText(lineas: LineaNormalizada[]) {
  return lineas
    .map(
      (l) => `
<ROW>
POLIZA: ${l.poliza || "///"}
TOMADOR: ${l.tomador || "///"}
TIPO: ${l.tipo || "///"}
FECHA: ${l.fecha || "///"}
TOTAL_RECIBO: ${l.total || "///"}
PRIMA_BASE: ${l.prima || "///"}
PORCENTAJE: ${l.porcentaje || "///"}
COMISION: ${l.comision || "///"}
</ROW>`
    )
    .join("\n");
}