import mongoose, { Document, Schema, Types } from "mongoose";

/* =========================
   TIPOS TYPESCRIPT
========================= */
export interface IFichaje {
  tipo: "ENTRADA" | "SALIDA";
  hora: string;      // ✅ STRING, NO Date
  activo: boolean;
}


export interface IRegistroHorario extends Document {
  usuario: Types.ObjectId | null;
  fecha: string;
  fichajes: IFichaje[];
  minutosTrabajados: number;
  estado?: "VACACIONES" | "DIA_LIBRE" | "BAJA" | "FESTIVO";
  turno?: "MANANA" | "TARDE" | "MANANA_TARDE";

  horaEntradaManana?: string;
  horaSalidaManana?: string;
  horaEntradaTarde?: string;
  horaSalidaTarde?: string;

  corregida: boolean;
  cerrada: boolean;
}

/* =========================
   SUBDOCUMENTO: FICHAJE
========================= */
const FichajeSchema = new mongoose.Schema<IFichaje>(
  {
    tipo: {
      type: String,
      enum: ["ENTRADA", "SALIDA"],
      required: true,
    },

   hora: {
  type: String, // ⬅️ NO Date
  required: true,
},


    // Permite desactivar fichajes sin borrarlos
    activo: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: true,
  }
);

/* =========================
   REGISTRO HORARIO DIARIO
========================= */
const RegistroHorarioSchema = new mongoose.Schema<IRegistroHorario>(
  {
    /* =========================
       USUARIO
       - Obligatorio para días de empleado
       - NULL permitido SOLO para FESTIVOS / GENERALES
    ========================= */
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
      default: null,
    },

    // Día en formato local (YYYY-MM-DD)
    fecha: {
      type: String,
      required: true,
      index: true,
    },

    /* =========================
       FICHAJES
    ========================= */
    fichajes: {
      type: [FichajeSchema],
      default: [],
    },

    // Total trabajado acumulado (minutos)
    minutosTrabajados: {
      type: Number,
      default: 0,
    },

    /* =========================
       ESTADO DEL DÍA (CRM)
    ========================= */
    estado: {
      type: String,
      enum: ["VACACIONES", "DIA_LIBRE", "BAJA", "FESTIVO"],
      default: undefined,
      index: true,
    },

    /* =========================
       TURNO ASIGNADO (CRM)
    ========================= */
    turno: {
      type: String,
      enum: ["MANANA", "TARDE", "MANANA_TARDE"],
      default: undefined,
    },

    /* =========================
       HORAS MANUALES DE TURNO
       (CRM - sin fichajes)
    ========================= */
    horaEntradaManana: {
      type: String,
      default: undefined,
    },
    horaSalidaManana: {
      type: String,
      default: undefined,
    },
    horaEntradaTarde: {
      type: String,
      default: undefined,
    },
    horaSalidaTarde: {
      type: String,
      default: undefined,
    },

    /* =========================
       CONTROL
    ========================= */
    // Jornada modificada manualmente desde CRM
    corregida: {
      type: Boolean,
      default: false,
    },

    // Jornada cerrada (no editable)
    cerrada: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================
   ÍNDICES
========================= */

/**
 * ✔️ Un día por usuario (cuando hay usuario)
 * ✔️ Permite múltiples registros generales (usuario = null)
 */
RegistroHorarioSchema.index(
  { usuario: 1, fecha: 1 },
  {
    unique: true,
    partialFilterExpression: {
      usuario: { $type: "objectId" },
    },
  }
);

export default mongoose.model<IRegistroHorario>(
  "RegistroHorario",
  RegistroHorarioSchema
);
