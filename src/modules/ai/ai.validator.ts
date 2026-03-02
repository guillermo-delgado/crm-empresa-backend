import { DocumentoContable } from "./ai.types";

export function validateDocumento(doc: DocumentoContable) {
  const incoherencias: string[] = [];
  const t = doc.totales;

  if (
    t.produccion &&
    t.otros_gastos &&
    t.total_comisiones_seguro
  ) {
    const calculado =
      +(t.produccion + t.otros_gastos).toFixed(2);

    if (
      Math.abs(calculado - t.total_comisiones_seguro) > 0.01
    ) {
      incoherencias.push(
        `Total comisiones no cuadra: calculado ${calculado} vs declarado ${t.total_comisiones_seguro}`
      );
    }
  }

  if (t.base && t.impuestos && t.liquido) {
    const liquidoCalculado =
      +(t.base - t.impuestos).toFixed(2);

    if (
      Math.abs(liquidoCalculado - t.liquido) > 0.5
    ) {
      incoherencias.push(
        `Líquido no cuadra: calculado ${liquidoCalculado} vs declarado ${t.liquido}`
      );
    }
  }

  doc.incoherencias = [
    ...(doc.incoherencias || []),
    ...incoherencias
  ];

  return doc;
}