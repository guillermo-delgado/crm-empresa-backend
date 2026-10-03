import mongoose, { Schema, Document } from "mongoose";

export interface ISorteo extends Document {
  nombre: string;
  descripcion?: string;

  createdAt?: Date;
  updatedAt?: Date;

  fechaInicio: Date;
  fechaFin: Date;
  criterioFecha: "REGISTRO" | "EFECTO";

  ramos: {
    nombre: string;
    participaciones: number;
    activo: boolean;
  }[];

  participantes: {
    _id?: mongoose.Types.ObjectId;
    ventaId?: mongoose.Types.ObjectId;
    numeroPoliza: string;
    tomador: string;
    aseguradora: string;
    ramo: string;
    fechaEfecto: Date;
    fechaRegistro?: Date;
    participaciones: number;
    primaNeta?: number;
    participacionesBase?: number;
    participacionesExtra?: number;
    participacionesPersonalizadas?: boolean;
    origen: "IMPORTACION" | "MANUAL";
    agregadoEn: Date;
  }[];

  ganadores: {
    participanteId: mongoose.Types.ObjectId;
    numeroPoliza: string;
    tomador: string;
    ramo: string;
    participaciones: number;
    fechaResultado: Date;
  }[];

  auditoria?: {
    fecha: Date;
    metodo: string;
    totalParticipaciones: number;
    indiceSeleccionado: number;
    huellaSHA256: string;
    listado: {
      participanteId: mongoose.Types.ObjectId;
      numeroPoliza: string;
      tomador: string;
      ramo: string;
      participaciones: number;
    }[];
  };

  historialResultados: {
    ganador: { participanteId: mongoose.Types.ObjectId; numeroPoliza: string; tomador: string; ramo: string; participaciones: number; fechaResultado: Date };
    fecha: Date; motivo: string; tipo: "INICIAL" | "REPETICION";
  }[];

  estado: "CONFIGURACION" | "ABIERTO" | "REALIZADO";
  fechaRealizacion?: Date;
  creadoPor: mongoose.Types.ObjectId;
}

const RamoSorteoSchema = new Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    participaciones: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    activo: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const ParticipanteSchema = new Schema(
  {
    ventaId: {
      type: Schema.Types.ObjectId,
      ref: "Venta",
      required: false,
    },
    numeroPoliza: {
      type: String,
      required: true,
      trim: true,
    },
    tomador: {
      type: String,
      required: true,
      trim: true,
    },
    aseguradora: {
      type: String,
      required: true,
      trim: true,
    },
    ramo: {
      type: String,
      required: true,
      trim: true,
    },
    fechaEfecto: {
      type: Date,
      required: true,
    },
    fechaRegistro: {
      type: Date,
      required: false,
    },
    participaciones: {
      type: Number,
      required: true,
      min: 1,
    },
    primaNeta: { type: Number, default: 0 },
    participacionesBase: { type: Number, default: 0 },
    participacionesExtra: { type: Number, default: 0 },
    participacionesPersonalizadas: { type: Boolean, default: false },
    origen: {
      type: String,
      enum: ["IMPORTACION", "MANUAL"],
      required: true,
      default: "IMPORTACION",
    },
    agregadoEn: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

const GanadorSchema = new Schema(
  {
    participanteId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    numeroPoliza: {
      type: String,
      required: true,
    },
    tomador: {
      type: String,
      required: true,
    },
    ramo: {
      type: String,
      required: true,
    },
    participaciones: {
      type: Number,
      required: true,
    },
    fechaResultado: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const AuditoriaParticipanteSchema = new Schema(
  {
    participanteId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    numeroPoliza: {
      type: String,
      required: true,
    },
    tomador: {
      type: String,
      required: true,
    },
    ramo: {
      type: String,
      required: true,
    },
    participaciones: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

const AuditoriaSchema = new Schema(
  {
    fecha: {
      type: Date,
      required: true,
    },
    metodo: {
      type: String,
      required: true,
      default: "crypto.randomInt",
    },
    totalParticipaciones: {
      type: Number,
      required: true,
      min: 1,
    },
    indiceSeleccionado: {
      type: Number,
      required: true,
      min: 0,
    },
    huellaSHA256: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/i,
    },
    listado: {
      type: [AuditoriaParticipanteSchema],
      required: true,
    },
  },
  { _id: false }
);


const ResultadoHistorialSchema = new Schema(
  {
    ganador: { type: GanadorSchema, required: true },
    fecha: { type: Date, required: true, default: Date.now },
    motivo: { type: String, default: "", trim: true },
    tipo: { type: String, enum: ["INICIAL", "REPETICION"], required: true },
  },
  { _id: true }
);

const SorteoSchema = new Schema<ISorteo>(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    descripcion: {
      type: String,
      default: "",
      trim: true,
    },
    fechaInicio: {
      type: Date,
      required: true,
    },
    fechaFin: {
      type: Date,
      required: true,
    },
    criterioFecha: {
      type: String,
      enum: ["REGISTRO", "EFECTO"],
      required: true,
      default: "EFECTO",
    },
    ramos: {
      type: [RamoSorteoSchema],
      default: [],
    },
    participantes: {
      type: [ParticipanteSchema],
      default: [],
    },
    ganadores: {
      type: [GanadorSchema],
      default: [],
    },
    auditoria: {
      type: AuditoriaSchema,
      required: false,
    },
    historialResultados: { type: [ResultadoHistorialSchema], default: [] },
    estado: {
      type: String,
      enum: ["CONFIGURACION", "ABIERTO", "REALIZADO"],
      default: "CONFIGURACION",
    },
    fechaRealizacion: {
      type: Date,
      required: false,
    },
    creadoPor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

SorteoSchema.index({ creadoPor: 1, createdAt: -1 });
SorteoSchema.index({ estado: 1, fechaInicio: 1, fechaFin: 1 });

export default mongoose.model<ISorteo>("Sorteo", SorteoSchema);