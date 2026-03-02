export interface LineaMapfreVida {
  comision: number;
  tomador?: string;
  tipoProduccion?: "N" | "C";
}

export interface ResultadoMapfreVida {
  abonos: number;
  extornos: number;
  base: number;
  irpf: number;
  compensaciones: number;
  otrosGastos: number;
  liquido: number;

  // 🔹 Nuevos campos CRM
  nuevaProduccion?: number;
  renovaciones?: number;
}