import mongoose, { Schema, Document, Model } from "mongoose";

export interface IFacturacion extends Document {
  usuarioId: mongoose.Types.ObjectId;
  tipo: string;
  factura: {
    numero?: string;
    fecha?: string;
    periodo?: string;
    razonSocial?: string;
    cif?: string;
  };
  resumen: {
    abonos: number;
    extornos: number;
    base: number;
    irpf: number;
    compensaciones: number;
    otrosGastos: number;
    liquidoCalculado: number;
    liquidoOficial?: number | null;
    liquidoFinal: number;
    diferencia: number;
    nuevaProduccion?: number;
    renovaciones?: number;
  };
  lineas: any[];
  archivo: {
    nombreOriginal?: string;
    hash?: string;
    size?: number;
    s3Key?: string;
  };
}

const FacturacionSchema = new Schema<IFacturacion>(
  {
    usuarioId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },

    tipo: {
      type: String,
      required: true,
    },

    factura: {
      numero: String,
      fecha: String,
      periodo: String,
      razonSocial: String,
      cif: String,
    },

    resumen: {
      abonos: Number,
      extornos: Number,
      base: Number,
      irpf: Number,
      compensaciones: Number,
      otrosGastos: Number,
      liquidoCalculado: Number,
      liquidoOficial: Number,
      liquidoFinal: Number,
      diferencia: Number,
      nuevaProduccion: Number,
      renovaciones: Number,
    },

    lineas: Array,

    archivo: {
      nombreOriginal: String,
      hash: String,
      size: Number,
      s3Key: String,
    },
  },
  { timestamps: true }
);

const FacturacionModel: Model<IFacturacion> =
  mongoose.model<IFacturacion>(
    "Facturacion",
    FacturacionSchema,
    "facturacion"
  );

export default FacturacionModel;