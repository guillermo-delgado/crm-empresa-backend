import { Request, Response } from "express";
import Solicitud from "../../models/Solicitud";
import Venta from "../../models/Venta";


export const listarSolicitudesPendientes = async (req: Request, res: Response) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        message: "Acceso solo para administradores",
      });
    }

    const solicitudes = await Solicitud.find({ estado: "PENDIENTE" })
      .populate("venta", "numeroPoliza tomador")
      .populate("solicitadoPor", "nombre email")
      .sort({ createdAt: -1 });

    res.json(solicitudes);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo solicitudes",
    });
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

    // Ejecutar acción real
    if (solicitud.tipo === "ELIMINAR_VENTA") {
      await Venta.findByIdAndDelete(solicitud.venta);
    }

    if (solicitud.tipo === "EDITAR_VENTA") {
      await Venta.findByIdAndUpdate(
        solicitud.venta,
        solicitud.payload,
        { runValidators: true }
      );
    }

    solicitud.estado = "APROBADA";
    await solicitud.save();

    res.json({ message: "Solicitud aprobada" });
  } catch (e) {
    res.status(500).json({ message: "Error aprobando solicitud" });
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

    solicitud.estado = "RECHAZADA";
    await solicitud.save();

    res.json({ message: "Solicitud rechazada" });
  } catch (e) {
    res.status(500).json({ message: "Error rechazando solicitud" });
  }
};