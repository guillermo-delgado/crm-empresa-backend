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
      select: false, // MUY IMPORTANTE
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
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IUser>("User", UserSchema);
