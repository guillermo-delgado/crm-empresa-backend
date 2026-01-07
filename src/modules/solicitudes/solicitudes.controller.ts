import { Request, Response } from "express";
import Solicitud from "../../models/Solicitud";
import Venta from "../../models/Venta";
import { getIO } from "../../socket";

/* =========================
   LISTAR SOLICITUDES PENDIENTES
========================= */
export const listarSolicitudesPendientes = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        message: "Acceso solo para administradores",
      });
    }

    const solicitudes = await Solicitud.aggregate([
      { $match: { estado: "PENDIENTE" } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$venta",
          solicitud: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$solicitud" } },
    ]);

    const solicitudesPopulate = await Solicitud.populate(solicitudes, [
      { path: "venta", select: "numeroPoliza tomador" },
      { path: "solicitadoPor", select: "nombre email numma" },
    ]);

    return res.json(solicitudesPopulate);
  } catch (error) {
    console.error("❌ ERROR LISTANDO SOLICITUDES:", error);
    return res.status(500).json({ message: "Error obteniendo solicitudes" });
  }
};

/* =========================
   APROBAR SOLICITUD
========================= */
export const aprobarSolicitud = async (req: any, res: any) => {
  console.log("➡️ APROBAR SOLICITUD", req.params.id);
  console.log("➡️ USER", req.user);

  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Solo administradores" });
    }

    const { id } = req.params;

    const solicitud = await Solicitud.findById(id);
    if (!solicitud || solicitud.estado !== "PENDIENTE") {
      return res.status(404).json({ message: "Solicitud no válida" });
    }

    console.log("🟡 TIPO SOLICITUD:", solicitud.tipo);

    const ventaId =
      typeof solicitud.venta === "object"
        ? solicitud.venta._id
        : solicitud.venta;

    switch (solicitud.tipo) {
      case "ELIMINAR_VENTA": {
        await Venta.findByIdAndDelete(ventaId);

        try {
          getIO().emit("VENTA_ELIMINADA", { ventaId });
        } catch {}

        break;
      }

      case "EDITAR_VENTA": {
        const payload =
          typeof solicitud.payload === "object"
            ? JSON.parse(JSON.stringify(solicitud.payload))
            : {};

        /* =========================
           🔒 CAMPOS PROHIBIDOS
        ========================= */
        delete payload.createdBy;
        delete payload.usuario;
        delete payload._id;
        delete payload.id;

        /* =========================
           🔧 NORMALIZACIÓN
        ========================= */
        if (payload.primaNeta !== undefined) {
          payload.primaNeta = Number(payload.primaNeta);
        }

        await Venta.findByIdAndUpdate(
          ventaId,
          { $set: payload },
          {
            runValidators: true,
          }
        );

        try {
          getIO().emit("VENTA_ACTUALIZADA", { ventaId });
        } catch {}

        break;
      }

      default:
        return res.status(400).json({
          message: "Tipo de solicitud no soportado",
          tipo: solicitud.tipo,
        });
    }

    /* =========================
       ✅ MARCAR APROBADA
    ========================= */
    solicitud.estado = "APROBADA";
    await solicitud.save();
    getIO().emit("SOLICITUD_RESUELTA", {
  solicitudId: solicitud._id,
  ventaId: solicitud.venta,
  estado: solicitud.estado,
});


    /* =========================
       🧹 ELIMINAR SOLICITUDES ANTIGUAS
       (CLAVE DEL PROBLEMA)
    ========================= */
    await Solicitud.deleteMany({
      venta: solicitud.venta,
      estado: "PENDIENTE",
      _id: { $ne: solicitud._id },
    });

    /* =========================
       🔔 SOCKET GLOBAL
    ========================= */
    try {
      getIO().emit("SOLICITUD_RESUELTA", {
        solicitudId: solicitud._id,
        estado: "APROBADA",
      });
    } catch {}

    return res.json({ message: "Solicitud aprobada" });
  } catch (error) {
    console.error("❌ ERROR APROBANDO SOLICITUD:", error);
    return res.status(500).json({ message: "Error aprobando solicitud" });
  }
};



/* =========================
   RECHAZAR SOLICITUD
========================= */
export const rechazarSolicitud = async (req: any, res: any) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Solo administradores" });
    }

    const { id } = req.params;

    const solicitud = await Solicitud.findById(id);
    if (!solicitud || solicitud.estado !== "PENDIENTE") {
      return res.status(404).json({ message: "Solicitud no válida" });
    }

    /* =========================
       ❌ MARCAR RECHAZADA
    ========================= */
    solicitud.estado = "RECHAZADA";
    await solicitud.save();
    getIO().emit("SOLICITUD_RESUELTA", {
  solicitudId: solicitud._id,
  ventaId: solicitud.venta,
  estado: solicitud.estado,
});


    /* =========================
       🧹 ELIMINAR RESTO DE PENDIENTES
       (MISMA VENTA)
    ========================= */
    await Solicitud.deleteMany({
      venta: solicitud.venta,
      estado: "PENDIENTE",
      _id: { $ne: solicitud._id },
    });

    /* =========================
       🔔 SOCKET GLOBAL
    ========================= */
    try {
      getIO().emit("SOLICITUD_RESUELTA", {
        solicitudId: solicitud._id,
        estado: "RECHAZADA",
      });
    } catch {}

    return res.json({ message: "Solicitud rechazada" });
  } catch (error) {
    console.error("❌ ERROR RECHAZANDO SOLICITUD:", error);
    return res.status(500).json({ message: "Error rechazando solicitud" });
  }
};

