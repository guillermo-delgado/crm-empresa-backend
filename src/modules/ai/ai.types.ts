export type DocumentoContable = {
  tipo: "liquidacion" | "factura" | "extracto" | "recibo" | "desconocido";

  totales: {
    produccion?: number;
    otros_gastos?: number;
    total_comisiones_seguro?: number;
    total_no_seguro?: number;
    base?: number;
    impuestos?: number;
    retenciones?: number;
    total?: number;
    liquido?: number;
  };

  lineas: Array<{
    descripcion?: string;
    importe?: number;
  }>;

  incoherencias: string[];
};