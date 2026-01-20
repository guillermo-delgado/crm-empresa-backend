import { Schema, model, Document } from "mongoose";

export interface IntentoFraudeDocument extends Document {
  usuario: string;
  ruta: string;
  metodo: string;
  ip: string;
  userAgent?: string;
  motivo: string;
  fecha: Date;
}

const IntentoFraudeSchema = new Schema<IntentoFraudeDocument>({
  usuario: { type: String, required: true },
  ruta: { type: String, required: true },
  metodo: { type: String, required: true },
  ip: { type: String, required: true },
  userAgent: { type: String },
  motivo: { type: String, required: true },
  fecha: { type: Date, default: Date.now },
});

export default model<IntentoFraudeDocument>(
  "IntentoFraude",
  IntentoFraudeSchema
);
