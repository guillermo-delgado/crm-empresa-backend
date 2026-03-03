import mongoose, { Schema, Document } from "mongoose";

export type TipoFactura =
  | "MAPFRE_VIDA"
  | "MAPFRE_ESPANA";

export interface IFacturaComision extends Document {

  /* ================= IDENTIFICACIÓN ================= */

  usuarioId: mongoose.Types.ObjectId;
  tipoFactura: TipoFactura;

  numeroFactura: string;
  fechaTexto?: string;          // La fecha tal como viene en PDF
  fechaFactura?: Date;          // Fecha real para análisis
  periodo?: string;

  razonSocial?: string;
  cif?: string;

  /* ================= PRODUCCIÓN ================= */

  nuevaProduccion?: number;
  renovaciones?: number;
  filasDetectadas?: number;

  /* ================= DESGLOSE ECONÓMICO ================= */

  abonos?: number;
  extornos?: number;
  base?: number;
  irpf?: number;

  traspaso?: number;
  otrosGastos?: number;
  incentivos?: number;
  rappeles?: number;
  otrasContraprestaciones?: number;

  comisionesNoSeguro?: number;
  lineasDelegadas?: number;
  operacionesBancarias?: number;
  ivaOperaciones?: number;

  compensaciones?: number;

  /* ================= LÍQUIDOS ================= */

  liquidoCalculado?: number;
  liquidoOficial?: number | null;
  liquidoFinal?: number;

  diferencia?: number;
  usandoLiquidoOficial?: boolean;

  /* ================= ARCHIVO ================= */

  nombreArchivoOriginal?: string;
  urlS3?: string;
  s3Key?: string;
  archivoHash?: string;

  /* ================= CONTROL ================= */

  sePuedeGuardar?: boolean;
  validado?: boolean;

  /* ================= DEBUG ================= */

  logs?: string[];

  /* ================= FECHAS ================= */

  createdAt: Date;
  updatedAt: Date;
}

const FacturaComisionSchema = new Schema<IFacturaComision>(
  {
    /* ================= IDENTIFICACIÓN ================= */

    usuarioId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },

    tipoFactura: {
      type: String,
      enum: ["MAPFRE_VIDA", "MAPFRE_ESPANA"],
      required: true,
      index: true,
    },

    numeroFactura: {
      type: String,
      required: true,
      index: true,
    },

    fechaTexto: { type: String },
    fechaFactura: { type: Date, index: true },
    periodo: { type: String },

    razonSocial: { type: String },
    cif: { type: String },

    /* ================= PRODUCCIÓN ================= */

    nuevaProduccion: { type: Number, default: 0 },
    renovaciones: { type: Number, default: 0 },
    filasDetectadas: { type: Number, default: 0 },

    /* ================= DESGLOSE ECONÓMICO ================= */

    abonos: { type: Number, default: 0 },
    extornos: { type: Number, default: 0 },
    base: { type: Number, default: 0 },
    irpf: { type: Number, default: 0 },

    traspaso: { type: Number, default: 0 },
    otrosGastos: { type: Number, default: 0 },
    incentivos: { type: Number, default: 0 },
    rappeles: { type: Number, default: 0 },
    otrasContraprestaciones: { type: Number, default: 0 },

    comisionesNoSeguro: { type: Number, default: 0 },
    lineasDelegadas: { type: Number, default: 0 },
    operacionesBancarias: { type: Number, default: 0 },
    ivaOperaciones: { type: Number, default: 0 },

    compensaciones: { type: Number, default: 0 },

    /* ================= LÍQUIDOS ================= */

    liquidoCalculado: { type: Number, default: 0 },
    liquidoOficial: { type: Number, default: null },
    liquidoFinal: { type: Number, default: 0 },

    diferencia: { type: Number, default: 0 },
    usandoLiquidoOficial: { type: Boolean, default: false },

    /* ================= ARCHIVO ================= */

    nombreArchivoOriginal: { type: String },
    urlS3: { type: String },
    s3Key: { type: String },
    archivoHash: { type: String, index: true },

    /* ================= CONTROL ================= */

    sePuedeGuardar: { type: Boolean, default: true },
    validado: { type: Boolean, default: false },

    /* ================= DEBUG ================= */

    logs: { type: [String], default: [] },
  },
  {
    timestamps: true,
  }
);

/* ================= ÍNDICES IMPORTANTES ================= */

// Evita duplicar factura por usuario
FacturaComisionSchema.index(
  { usuarioId: 1, numeroFactura: 1 },
  { unique: true }
);

export default mongoose.model<IFacturaComision>(
  "FacturaComision",
  FacturaComisionSchema,
  "facturacion"
);