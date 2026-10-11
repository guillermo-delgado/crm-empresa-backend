import mongoose, { Document, Schema, Types } from "mongoose";

/**
 * Ajuste manual de la bolsa de horas de un empleado.
 *  - DESCANSO      → horas compensadas con tiempo libre (resta del saldo a favor)
 *  - NOMINA        → horas pagadas en nómina (resta del saldo a favor)
 *  - REGULARIZACION→ corrección manual (puede sumar o restar), con comentario
 *
 * `minutos` es SIEMPRE el cambio aplicado al saldo (negativo = resta).
 */
export type TipoAjusteHoras = "DESCANSO" | "NOMINA" | "REGULARIZACION";

export interface IAjusteHoras extends Document {
  usuario: Types.ObjectId;
  fecha: string; // YYYY-MM-DD
  tipo: TipoAjusteHoras;
  minutos: number;
  comentario?: string;
  creadoPor?: Types.ObjectId | null;
}

const AjusteHorasSchema = new Schema<IAjusteHoras>(
  {
    usuario: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fecha: { type: String, required: true, index: true },
    tipo: {
      type: String,
      enum: ["DESCANSO", "NOMINA", "REGULARIZACION"],
      required: true,
    },
    minutos: { type: Number, required: true },
    comentario: { type: String, trim: true, maxlength: 200, default: undefined },
    creadoPor: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.model<IAjusteHoras>("AjusteHoras", AjusteHorasSchema);
