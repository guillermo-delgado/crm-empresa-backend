import { Request, Response } from "express";
import Venta from "../../models/Venta";
import mongoose from "mongoose";

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
    } = req.body;

    const venta = await Venta.create({
      fechaEfecto,
      aseguradora,
      ramo,
      numeroPoliza,
      tomador,
      primaNeta: Number(primaNeta),
      formaPago,
      createdBy: new mongoose.Types.ObjectId(req.user.id),
    });

    res.status(201).json(venta);
  } catch (error) {
    console.error("CREAR VENTA ERROR:", error);
    res.status(500).json({ message: "Error al guardar la venta" });
  }
};

/* =========================
   LIBRO DE VENTAS
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

    // Diferencia en meses
    const diffMonths =
      (requestedDate.getFullYear() - now.getFullYear()) * 12 +
      (requestedDate.getMonth() - now.getMonth());

    // ⛔ EMPLEADOS: solo mes actual + 2 siguientes
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

    // 👇 EMPLEADOS: solo sus ventas
    if (req.user.role !== "admin") {
      filtro.createdBy = req.user.id;
    }

    const ventas = await Venta.find(filtro).populate(
      "createdBy",
      "nombre email"
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
    const { id } = req.params;

    const {
      fechaEfecto,
      aseguradora,
      ramo,
      numeroPoliza,
      tomador,
      primaNeta,
      formaPago,
    } = req.body;

    const update: any = {};

    if (fechaEfecto) update.fechaEfecto = fechaEfecto;
    if (aseguradora) update.aseguradora = aseguradora;
    if (ramo) update.ramo = ramo;
    if (numeroPoliza) update.numeroPoliza = numeroPoliza;
    if (tomador) update.tomador = tomador;
    if (primaNeta !== undefined)
      update.primaNeta = Number(primaNeta);
    if (formaPago) update.formaPago = formaPago;

    const venta = await Venta.findByIdAndUpdate(
      id,
      update,
      { new: true, runValidators: true }
    ).populate("createdBy", "nombre email");

    if (!venta) {
      return res.status(404).json({
        message: "Venta no encontrada",
      });
    }

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
    const { id } = req.params;

    const venta = await Venta.findByIdAndDelete(id);

    if (!venta) {
      return res.status(404).json({
        message: "Venta no encontrada",
      });
    }

    res.json({
      message: "Venta eliminada correctamente",
    });
  } catch {
    res.status(500).json({
      message: "Error al eliminar la venta",
    });
  }
};
