import { Request, Response } from "express";
import Venta from "../../models/Venta";
import Solicitud from "../../models/Solicitud";
import mongoose from "mongoose";
import User from "../../models/User";
import { getIO } from "../../socket";

/* =========================
   CREAR VENTA
========================= */
export const crearVenta = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const {
      fechaEfecto,
      aseguradora,
      ramo,
      numeroPoliza,
      tomador,
      primaNeta,
      formaPago,
      actividad,
      observaciones,
      createdBy,
    } = req.body;

    let usuarioAsignadoId = req.user.id;

    // 🔐 SOLO ADMIN puede asignar ventas a otros
    if (createdBy && req.user.role === "admin") {
      const usuario = await User.findOne({
        $or: [
          { numma: createdBy },
          { email: createdBy },
          { nombre: createdBy },
        ],
      });

      if (!usuario) {
        return res.status(400).json({
          message: "Usuario no válido para asignar la venta",
        });
      }

      usuarioAsignadoId = usuario._id.toString();
    }

    const venta = await Venta.create({
      fechaEfecto,
      aseguradora,
      ramo,
      numeroPoliza,
      tomador,
      primaNeta: Number(primaNeta),
      formaPago,
      actividad,
      observaciones,
      createdBy: new mongoose.Types.ObjectId(usuarioAsignadoId),
    });

    /* 🔔 EVENTO TIEMPO REAL */
    try {
      getIO().emit("VENTA_CREADA", { ventaId: venta._id });
    } catch {}

    res.status(201).json(venta);
  } catch (error) {
    console.error("CREAR VENTA ERROR:", error);
    res.status(500).json({ message: "Error al guardar la venta" });
  }
};

/* =========================
   LIBRO DE VENTAS  ✅ (NO SE TOCA)
========================= */
export const libroVentas = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const month = Number(req.query.month);
    const year = Number(req.query.year);

    if (!month || !year) {
      return res.status(400).json({ message: "Mes y año obligatorios" });
    }

    const requestedDate = new Date(year, month - 1, 1);
    const now = new Date();

    const diffMonths =
      (requestedDate.getFullYear() - now.getFullYear()) * 12 +
      (requestedDate.getMonth() - now.getMonth());

    if (req.user.role !== "admin" && (diffMonths < 0 || diffMonths > 2)) {
      return res.status(403).json({
        message: "No puedes consultar ventas de ese periodo",
      });
    }

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const filtro: any = {
      fechaEfecto: { $gte: start, $lte: end },
    };

    if (req.user.role !== "admin") {
      filtro.createdBy = req.user.id;
    }

    const ventas = await Venta.find(filtro).populate(
      "createdBy",
      "nombre email numma"
    );

    const primaTotal = ventas.reduce(
      (acc, v) => acc + v.primaNeta,
      0
    );

    res.json({
      periodo: `${month}/${year}`,
      resumen: { primaTotal },
      ventas,
    });
  } catch (error) {
    console.error("LIBRO VENTAS ERROR:", error);
    res.status(500).json({ message: "Error obteniendo libro de ventas" });
  }
};

/* =========================
   EDITAR VENTA
========================= */
export const editarVenta = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { id } = req.params;

    // 👤 EMPLEADO → crear solicitud
    if (req.user.role !== "admin") {
      const solicitud = await Solicitud.create({
        tipo: "EDITAR_VENTA",
        venta: id,
        solicitadoPor: req.user.id,
        payload: req.body,
      });

      try {
        getIO().emit("SOLICITUD_CREADA", {
          solicitudId: solicitud._id,
          tipo: "EDITAR_VENTA",
        });
      } catch {}

      return res.status(403).json({
        message: "Solicitud de edición enviada al administrador",
      });
    }

   const {
  fechaEfecto,
  aseguradora,
  ramo,
  numeroPoliza,
  tomador,
  primaNeta,
  formaPago,
  actividad,
  observaciones,
  createdBy, // ← AÑADE ESTA LÍNEA
} = req.body;


    const update: any = {};

    if (createdBy && req.user.role === "admin") {
  update.createdBy = new mongoose.Types.ObjectId(createdBy);
}


    if (fechaEfecto) update.fechaEfecto = fechaEfecto;
    if (aseguradora) update.aseguradora = aseguradora;
    if (ramo) update.ramo = ramo;
    if (numeroPoliza) update.numeroPoliza = numeroPoliza;
    if (tomador) update.tomador = tomador;
    if (primaNeta !== undefined) update.primaNeta = Number(primaNeta);
    if (formaPago) update.formaPago = formaPago;
    if (actividad) update.actividad = actividad;
    if (observaciones !== undefined) update.observaciones = observaciones;

    const venta = await Venta.findByIdAndUpdate(
      id,
      update,
      { new: true, runValidators: true }
    ).populate("createdBy", "nombre email numma");

    if (!venta) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    /* 🔔 EVENTO VENTA ACTUALIZADA */
    try {
      getIO().emit("VENTA_ACTUALIZADA", { ventaId: venta._id });
    } catch {}

    res.json(venta);
  } catch (error: any) {
    console.error("EDITAR VENTA ERROR:", error.message);
    res.status(400).json({
      message: error.message || "Datos inválidos",
    });
  }
};

/* =========================
   ELIMINAR VENTA
========================= */
export const eliminarVenta = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { id } = req.params;

    // 👤 EMPLEADO → crear solicitud
    if (req.user.role !== "admin") {
      const solicitud = await Solicitud.create({
        tipo: "ELIMINAR_VENTA",
        venta: id,
        solicitadoPor: req.user.id,
      });

      try {
        getIO().emit("SOLICITUD_CREADA", {
          solicitudId: solicitud._id,
          tipo: "ELIMINAR_VENTA",
        });
      } catch {}

      return res.status(403).json({
        message: "Solicitud de eliminación enviada al administrador",
      });
    }

    const venta = await Venta.findByIdAndDelete(id);

    if (!venta) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    /* 🔔 EVENTO VENTA ELIMINADA */
    try {
      getIO().emit("VENTA_ELIMINADA", { ventaId: id });
    } catch {}

    res.json({ message: "Venta eliminada correctamente" });
  } catch {
    res.status(500).json({ message: "Error al eliminar la venta" });
  }
};

/* =========================
   OBTENER VENTA POR ID
========================= */
export const obtenerVentaPorId = async (req: any, res: any) => {
  try {
    const { id } = req.params;

    const venta = await Venta.findById(id)
  .populate("createdBy", "numma nombre email");


    if (!venta) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    res.json(venta);
  } catch (error) {
    console.error("❌ Error obteniendo venta por id:", error);
    res.status(500).json({ message: "Error obteniendo la venta" });
  }
};

