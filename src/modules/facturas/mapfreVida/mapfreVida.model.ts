import mongoose, {
  Schema,
  Model,
  HydratedDocument,
  Types,
} from "mongoose";

/* =====================================================
   TYPES
===================================================== */

export interface IFactura {
  numero?: string;
  fecha?: string;
  periodo?: string;
  razonSocial?: string;
  cif?: string;
}

export interface IResumen {
  abonos: number;
  extornos: number;
  base: number;
  irpf: number;
  compensaciones: number;
  otrosGastos: number;

  incentivos?: number;
  rappeles?: number;
  otrasContraprestaciones?: number;
  traspaso?: number;
  comisionesNoSeguro?: number;
  operacionesBancarias?: number;
  ivaOperaciones?: number;
  lineasDelegadas?: number;

  liquidoCalculado: number;
  liquidoOficial?: number | null;
  liquidoFinal: number;
  diferencia: number;

  nuevaProduccion?: number;
  renovaciones?: number;
}

export interface IArchivo {
  nombreOriginal?: string;
  hash?: string;
  size?: number;
  s3Key?: string;
}

export interface IFacturacion {
  usuarioId: Types.ObjectId;
  tipo: string;

  factura: IFactura;
  resumen: IResumen;

  lineas: unknown[];

  archivo: IArchivo;

  logs?: string[];

  sePuedeGuardar: boolean;
  usandoLiquidoOficial?: boolean;
}

export type FacturacionDocument = HydratedDocument<IFacturacion>;

/* =====================================================
   SUBSCHEMAS
===================================================== */

const FacturaSchema = new Schema<IFactura>(
  {
    numero: { type: String, index: true },
    fecha: String,
    periodo: { type: String, index: true },
    razonSocial: String,
    cif: String,
  },
  { _id: false }
);

const ResumenSchema = new Schema<IResumen>(
  {
    abonos: { type: Number, default: 0 },
    extornos: { type: Number, default: 0 },
    base: { type: Number, default: 0 },
    irpf: { type: Number, default: 0 },
    compensaciones: { type: Number, default: 0 },
    otrosGastos: { type: Number, default: 0 },

    incentivos: { type: Number, default: 0 },
    rappeles: { type: Number, default: 0 },
    otrasContraprestaciones: { type: Number, default: 0 },
    traspaso: { type: Number, default: 0 },
    comisionesNoSeguro: { type: Number, default: 0 },
    operacionesBancarias: { type: Number, default: 0 },
    ivaOperaciones: { type: Number, default: 0 },
    lineasDelegadas: { type: Number, default: 0 },

    liquidoCalculado: { type: Number, default: 0 },
    liquidoOficial: { type: Number, default: null },
    liquidoFinal: { type: Number, default: 0 },
    diferencia: { type: Number, default: 0 },

    nuevaProduccion: { type: Number, default: 0 },
    renovaciones: { type: Number, default: 0 },
  },
  { _id: false }
);

const ArchivoSchema = new Schema<IArchivo>(
  {
    nombreOriginal: String,
    hash: { type: String, index: true },
    size: Number,
    s3Key: String,
  },
  { _id: false }
);

/* =====================================================
   MAIN SCHEMA
===================================================== */

const FacturacionSchema = new Schema<IFacturacion>(
  {
    usuarioId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },

    tipo: {
      type: String,
      required: true,
      index: true,
    },

    factura: {
      type: FacturaSchema,
      required: true,
    },

    resumen: {
      type: ResumenSchema,
      required: true,
    },

    lineas: {
      type: [Schema.Types.Mixed],
      default: [],
    },

    archivo: {
      type: ArchivoSchema,
      required: true,
    },

    logs: {
      type: [String],
      default: [],
    },

    sePuedeGuardar: {
      type: Boolean,
      default: true,
    },

    usandoLiquidoOficial: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

/* =====================================================
   ÍNDICES
===================================================== */

FacturacionSchema.index({
  usuarioId: 1,
  "factura.numero": 1,
  tipo: 1,
});

FacturacionSchema.index({
  usuarioId: 1,
  "factura.periodo": 1,
  tipo: 1,
});

/* =====================================================
   EXPORT
===================================================== */

export const FacturacionModel: Model<IFacturacion> =
  mongoose.model<IFacturacion>(
    "Facturacion",
    FacturacionSchema,
    "facturacion"
  );

export default FacturacionModel;