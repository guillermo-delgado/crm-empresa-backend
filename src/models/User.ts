import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  nombre: string;
  apellidos: string;
  nif: string;
  numma: string;
  email: string;
  password: string;
  role: "admin" | "empleado" | "colaborador";
  activo: boolean;

  // ⏱️ CONFIGURACIÓN LABORAL
  horasContratadasSemana: number;
  maxDiasVacaciones: number;
  balanceMinutos?: number;

  // 🔐 Sesiones
  crmSessionId?: string | null;   // Desktop
 refreshToken: {
  type: String,
  default: null,
},


  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
    },

    apellidos: {
      type: String,
      required: true,
      trim: true,
    },

    nif: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    numma: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["admin", "empleado", "colaborador"],
      default: "empleado",
    },

    activo: {
      type: Boolean,
      default: true,
    },

    /* =========================
       CONFIGURACIÓN LABORAL
    ========================= */
    horasContratadasSemana: {
      type: Number,
      default: 40,
      min: 0,
    },

    maxDiasVacaciones: {
      type: Number,
      default: 30,
      min: 0,
    },

    balanceMinutos: {
      type: Number,
      default: 0,
    },

    /* =========================
       SESIONES
    ========================= */
    crmSessionId: {
      type: String,
      default: null,
    },

    refreshToken: {
      type: String,
      default: null,
      index: true, // 🔥 importante para buscar rápido
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IUser>("User", UserSchema);
