import mongoose from "mongoose";

const solicitudSchema = new mongoose.Schema(
  {
    tipo: {
      type: String,
      enum: ["EDITAR_VENTA", "ELIMINAR_VENTA"],
      required: true,
    },
    venta: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Venta",
      required: true,
    },
    solicitadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    estado: {
      type: String,
      enum: ["PENDIENTE", "APROBADA", "RECHAZADA"],
      default: "PENDIENTE",
    },
    payload: {
      type: Object, // datos propuestos (solo editar)
    },
  },
  { timestamps: true }
);

export default mongoose.model("Solicitud", solicitudSchema);
