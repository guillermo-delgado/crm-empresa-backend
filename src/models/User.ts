import { Schema, model, Document } from "mongoose";

export interface IUser extends Document {
  nombre: string;
  email: string;
  password: string;
  role: "admin" | "empleado" | "colaborador";
  activo: boolean;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      select: false, // 🔒 nunca se devuelve por defecto
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

export default model<IUser>("User", UserSchema);
