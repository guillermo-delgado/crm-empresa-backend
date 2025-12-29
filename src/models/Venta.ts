import mongoose from "mongoose";

const VentaSchema = new mongoose.Schema(
  {
    fechaEfecto: {
      type: Date,
      required: true,
    },
    aseguradora: {
      type: String,
      required: true,
    },
    ramo: {
      type: String,
      required: true,
    },
    numeroPoliza: {
      type: String,
      required: true,
      unique: true,
    },
    tomador: {
      type: String,
      required: true,
    },
    primaNeta: {
      type: Number,
      required: true,
    },
    formaPago: {
      type: String,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Venta", VentaSchema);
