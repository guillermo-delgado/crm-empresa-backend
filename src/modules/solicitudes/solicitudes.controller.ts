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
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Solo administradores" });
    }

    const { id } = req.params;

    const solicitud = await Solicitud.findById(id);
    if (!solicitud || solicitud.estado !== "PENDIENTE") {
      return res.status(404).json({ message: "Solicitud no válida" });
    }

    const ventaId =
      typeof solicitud.venta === "object"
        ? solicitud.venta.toString()
        : solicitud.venta;

    switch (solicitud.tipo) {
      case "ELIMINAR_VENTA": {
  await Venta.findByIdAndDelete(ventaId);

  // 🔔 Emitir eliminación (solo ID, correcto)
  getIO().emit("VENTA_ELIMINADA", {
    ventaId: ventaId.toString(),
  });

  break;
}

      case "EDITAR_VENTA": {
        const payload =
          typeof solicitud.payload === "object"
            ? JSON.parse(JSON.stringify(solicitud.payload))
            : {};

        // 🔒 limpiar campos prohibidos
        delete payload.createdBy;
        delete payload.usuario;
        delete payload._id;
        delete payload.id;

        if (payload.primaNeta !== undefined) {
          payload.primaNeta = Number(payload.primaNeta);
        }

        // ✅ aplicar cambios
        await Venta.findByIdAndUpdate(ventaId, { $set: payload });
        const ventaActualizada = await Venta.findById(ventaId).populate("createdBy");
getIO().emit("VENTA_ACTUALIZADA", ventaActualizada);


        // ⛔ NO EMITIR VENTA_ACTUALIZADA AQUÍ
        break;
      }
    }

    // ✅ marcar solicitud como aprobada
    solicitud.estado = "APROBADA";
    await solicitud.save();

    // ✅ estado visual definitivo
    await Venta.findByIdAndUpdate(ventaId, {
      estadoRevision: "aceptada",
    });

    // 🧹 limpiar solicitudes pendientes antiguas
    await Solicitud.deleteMany({
      venta: solicitud.venta,
      estado: "PENDIENTE",
      _id: { $ne: solicitud._id },
    });

    // 🔔 SOCKET ÚNICO Y CORRECTO
    getIO().emit("SOLICITUD_RESUELTA", {
      ventaId,
      estado: "aceptada",
    });

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

    const ventaId =
      typeof solicitud.venta === "object"
        ? solicitud.venta.toString()
        : solicitud.venta;

    // ❌ marcar solicitud rechazada
    solicitud.estado = "RECHAZADA";
    await solicitud.save();

    // 🔴 estado visual definitivo
    await Venta.findByIdAndUpdate(ventaId, {
      estadoRevision: "rechazada",
    });

    // 🧹 eliminar otras pendientes
    await Solicitud.deleteMany({
      venta: solicitud.venta,
      estado: "PENDIENTE",
      _id: { $ne: solicitud._id },
    });

    // 🔔 SOCKET ÚNICO (EL IMPORTANTE)
    getIO().emit("SOLICITUD_RESUELTA", {
      ventaId,
      estado: "rechazada",
    });

    return res.json({ message: "Solicitud rechazada" });
  } catch (error) {
    console.error("❌ ERROR RECHAZANDO SOLICITUD:", error);
    return res.status(500).json({ message: "Error rechazando solicitud" });
  }
};


/* =========================
    SOLICITUDES EMPLEADO
========================= */

export const contarRevisionesEmpleado = async (req: any, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    // 👤 SOLO EMPLEADO
    if (req.user.role === "admin") {
      return res.json({ count: 0 });
    }

    const count = await Venta.countDocuments({
      createdBy: req.user._id,
      estadoRevision: { $in: ["aceptada", "rechazada"] },
    });

    return res.json({ count });
  } catch (error) {
    console.error("❌ ERROR CONTANDO REVISIONES:", error);
    return res.status(500).json({ message: "Error contando revisiones" });
  }
};
