import mongoose, { Schema, Document } from "mongoose";

export interface IFacturaComisionVida extends Document {
  usuarioId: mongoose.Types.ObjectId;

  tipoFactura: "MAPFRE_VIDA";
subtipo?: "VIDA_NORMAL" | "VIDA_INVERSION";

  numeroFactura: string;
  fechaTexto?: string;
  fechaFactura?: Date;
  periodo?: string;

  razonSocial?: string;
  cif?: string;

  nuevaProduccion?: number;
  renovaciones?: number;
  provisiones?: number;
totalPrima?: number;
  filasDetectadas?: number;

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

  liquidoCalculado?: number;
  liquidoOficial?: number | null;
  liquidoFinal?: number;

  diferencia?: number;
  usandoLiquidoOficial?: boolean;

  nombreArchivoOriginal?: string;
  urlS3?: string;
  s3Key?: string;
  jsonS3Key?: string;

  jsonEncrypted?: boolean;
  jsonEncryptionVersion?: number;

  archivoHash?: string;

  sePuedeGuardar?: boolean;
  validado?: boolean;

  logs?: string[];

  createdAt: Date;
  updatedAt: Date;
}

const FacturaComisionVidaSchema =
  new Schema<IFacturaComisionVida>(
    {
      usuarioId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: "User",
        index: true,
      },

      tipoFactura: {
  type: String,
  enum: ["MAPFRE_VIDA"],
  default: "MAPFRE_VIDA",
  required: true,
  index: true,
},

subtipo: {
  type: String,
  enum: ["VIDA_NORMAL", "VIDA_INVERSION"],
  default: "VIDA_NORMAL",
  index: true,
},

      numeroFactura: {
        type: String,
        required: true,
        index: true,
      },

      fechaTexto: { type: String },

      fechaFactura: {
        type: Date,
        index: true,
      },

      periodo: {
        type: String,
        index: true,
      },

      razonSocial: { type: String },
      cif: { type: String },

      nuevaProduccion: { type: Number },
      renovaciones: { type: Number },
      provisiones: { type: Number },
totalPrima: { type: Number },
      filasDetectadas: { type: Number },

      abonos: { type: Number },
      extornos: { type: Number },
      base: { type: Number },
      irpf: { type: Number },

      traspaso: { type: Number },
      otrosGastos: { type: Number },
      incentivos: { type: Number },
      rappeles: { type: Number },
      otrasContraprestaciones: { type: Number },

      comisionesNoSeguro: { type: Number },
      lineasDelegadas: { type: Number },
      operacionesBancarias: { type: Number },
      ivaOperaciones: { type: Number },

      compensaciones: { type: Number },

      liquidoCalculado: { type: Number },
      liquidoOficial: { type: Number },
      liquidoFinal: { type: Number },

      diferencia: { type: Number },

      usandoLiquidoOficial: {
        type: Boolean,
        default: false,
      },

      nombreArchivoOriginal: { type: String },

      urlS3: { type: String },

      s3Key: { type: String },

      jsonS3Key: { type: String },

      jsonEncrypted: {
        type: Boolean,
        default: false,
      },

      jsonEncryptionVersion: {
        type: Number,
      },

      archivoHash: {
        type: String,
        index: true,
      },

      sePuedeGuardar: {
        type: Boolean,
        default: true,
      },

      validado: {
        type: Boolean,
        default: false,
      },

      logs: {
        type: [String],
        default: [],
      },
    },
    {
      timestamps: true,
    }
  );

FacturaComisionVidaSchema.index(
  {
    usuarioId: 1,
    numeroFactura: 1,
  },
  {
    unique: true,
  }
);

FacturaComisionVidaSchema.index({
  usuarioId: 1,
  tipoFactura: 1,
  periodo: 1,
});

FacturaComisionVidaSchema.index({
  usuarioId: 1,
  tipoFactura: 1,
  archivoHash: 1,
});

const FacturacionVidaModel =
  mongoose.models.FacturaComision ||
  mongoose.model<IFacturaComisionVida>(
    "FacturaComision",
    FacturaComisionVidaSchema,
    "facturacion"
  );

export default FacturacionVidaModel;