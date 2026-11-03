import mongoose, { Schema, Document } from "mongoose";

export type TipoNota = "LLAMADA" | "AVISO" | "GESTION" | "OTRO";
export type PrioridadNota = "NORMAL" | "ALTA" | "URGENTE";
export type ColorNota = "amarillo" | "azul" | "verde" | "rosa" | "lila";

export interface INotaAgenda extends Document {
  tipo: TipoNota;
  /** Nombre libre cuando tipo = OTRO (ej. "Reunión", "Cobro") */
  tipoPersonalizado?: string;
  titulo: string;
  detalle?: string;
  telefono?: string;

  /** Día (YYYY-MM-DD, hora de España). Vacío = sin fecha. */
  dia?: string;
  /** Hora (HH:mm, hora de España). Vacío = sin hora concreta. */
  hora?: string;

  prioridad: PrioridadNota;
  color: ColorNota;
  estado: "PENDIENTE" | "HECHA";
  hechaEn?: Date;
  notaLlamada?: string;

  /** Posición en el tablón: x = fracción del ancho (0-1), y = píxeles. */
  x?: number;
  y?: number;

  /** Minutos de antelación del aviso (0 = sin aviso). */
  avisoMinutos: number;

  asignadoA: mongoose.Types.ObjectId;
  creadoPor: mongoose.Types.ObjectId;
  /** true = la ha mandado el admin a otra persona */
  impuesta: boolean;
  leidaEn?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

const NotaAgendaSchema = new Schema<INotaAgenda>(
  {
    tipo: {
      type: String,
      enum: ["LLAMADA", "AVISO", "GESTION", "OTRO"],
      default: "AVISO",
      required: true,
    },
    tipoPersonalizado: { type: String, trim: true, maxlength: 30 },
    titulo: { type: String, required: true, trim: true, maxlength: 200 },
    detalle: { type: String, trim: true, maxlength: 2000 },
    telefono: { type: String, trim: true, maxlength: 40 },

    dia: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    hora: { type: String, match: /^\d{2}:\d{2}$/ },

    prioridad: {
      type: String,
      enum: ["NORMAL", "ALTA", "URGENTE"],
      default: "NORMAL",
    },
    color: {
      type: String,
      enum: ["amarillo", "azul", "verde", "rosa", "lila"],
      default: "amarillo",
    },
    estado: {
      type: String,
      enum: ["PENDIENTE", "HECHA"],
      default: "PENDIENTE",
      index: true,
    },
    hechaEn: { type: Date },
    notaLlamada: { type: String, trim: true, maxlength: 2000 },

    x: { type: Number, min: 0, max: 1 },
    y: { type: Number, min: 0, max: 5000 },

    avisoMinutos: { type: Number, default: 10, min: 0, max: 1440 },

    asignadoA: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    creadoPor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    impuesta: { type: Boolean, default: false },
    leidaEn: { type: Date },
  },
  { timestamps: true }
);

NotaAgendaSchema.index({ asignadoA: 1, estado: 1, dia: 1 });

export default mongoose.model<INotaAgenda>("NotaAgenda", NotaAgendaSchema);