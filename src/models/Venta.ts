import mongoose from "mongoose";

const EncryptedPayloadSchema = new mongoose.Schema(
  {
    algorithm: {
      type: String,
      required: true,
    },
    iv: {
      type: String,
      required: true,
    },
    authTag: {
      type: String,
      required: true,
    },
    data: {
      type: String,
      required: true,
    },
    encoding: {
      type: String,
      enum: ["base64"],
      default: "base64",
    },
  },
  { _id: false }
);

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

    documentoFiscal: {
      type: String,
      required: false,
      trim: true,
    },

    primaNeta: {
      type: Number,
      required: true,
    },

    formaPago: {
      type: String,
      required: true,
    },

    /* === NUEVO CAMPO: ACTIVIDAD === */
    actividad: {
      type: String,
      enum: [
        "RECOMENDADO",
        "SGC",
        "OFICINA",
        "TELEFONICO",
        "INTERNET",
        "RED PERSONAL",
        "FINCAS",
        "COLABORADORES",
      ],
      required: true,
    },

    /* === NUEVO CAMPO: OBSERVACIONES (NO obligatorio) === */
    observaciones: {
      type: String,
      default: "",
    },

    formularioCifrado: {
      type: EncryptedPayloadSchema,
      required: false,
    },

    adjuntos: [
      {
        campo: {
          type: String,
          required: true,
        },
        nombreOriginal: {
          type: String,
          required: true,
        },
        mimeType: {
          type: String,
          required: true,
        },
        size: {
          type: Number,
          required: true,
        },
        contenidoCifrado: {
          type: EncryptedPayloadSchema,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    /* === 🔔 NUEVO: ESTADO DE REVISIÓN (empleado/admin) === */
    estadoRevision: {
      type: String,
      enum: ["pendiente", "aceptada", "rechazada"],
      default: null,
    },

    estado: {
      type: String,
      enum: ["ACTIVA", "ANULADA"],
      default: "ACTIVA",
    },

    fechaAnulacion: {
      type: Date,
    },

    motivoAnulacion: {
      type: String,
    },

    derivadoVerti: {
      type: Boolean,
      default: false,
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

export default mongoose.model<any>("Venta", VentaSchema);