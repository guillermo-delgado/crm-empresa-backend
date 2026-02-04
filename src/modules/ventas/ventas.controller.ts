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
      documentoFiscal,
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
      documentoFiscal,
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
   // 👤 EMPLEADO → crear solicitud (SI NO EXISTE)
if (req.user.role !== "admin") {

  const existente = await Solicitud.findOne({
    venta: id,
    estado: "PENDIENTE",
    // tipo: "EDITAR_VENTA",
  });

if (existente) {
  existente.payload = req.body;
  existente.updatedAt = new Date();
  await existente.save();

  try {
    getIO().emit("SOLICITUD_ACTUALIZADA", {
      solicitudId: existente._id,
      ventaId: id,
      tipo: "EDITAR_VENTA",
    });
  } catch {}

  return res.status(200).json({
    message: "Solicitud de edición actualizada",
    solicitud: existente,
  });
}


  const solicitud = await Solicitud.create({
    tipo: "EDITAR_VENTA",
    venta: id,
    solicitadoPor: req.user.id,
    payload: req.body,
  });

  try {
    getIO().emit("SOLICITUD_CREADA", {
      solicitudId: solicitud._id,
      ventaId: id,
      tipo: "EDITAR_VENTA",
    });
  } catch {}

  await Venta.findByIdAndUpdate(id, {
    estadoRevision: "pendiente",
  });

  return res.status(202).json({
    message: "Solicitud de edición enviada al administrador",
  });
}


   const {
  fechaEfecto,
  aseguradora,
  ramo,
  numeroPoliza,
  documentoFiscal,
  tomador,
  primaNeta,
  formaPago,
  actividad,
  observaciones,
  createdBy, // ← AÑADE ESTA LÍNEA
} = req.body;


    const update: any = {};
    // 🔓 REHABILITAR VENTA (solo admin)
if (req.user.role === "admin" && req.body.estado === null) {
  update.estado = null;
}


    if (createdBy && req.user.role === "admin") {
  update.createdBy = new mongoose.Types.ObjectId(createdBy);
}


    if (fechaEfecto) update.fechaEfecto = fechaEfecto;
    if (aseguradora) update.aseguradora = aseguradora;
    if (ramo) update.ramo = ramo;
    if (
  numeroPoliza &&
  numeroPoliza !== (await Venta.findById(id))?.numeroPoliza
) {
  update.numeroPoliza = numeroPoliza;
}

if (documentoFiscal !== undefined) {
  const doc = documentoFiscal.trim();
  if (doc !== "") update.documentoFiscal = doc;
}

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
  const ventaActualizada = await Venta.findById(venta._id).populate("createdBy");
  getIO().emit("VENTA_ACTUALIZADA", ventaActualizada);
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

  const existente = await Solicitud.findOne({
    venta: id,
    estado: "PENDIENTE",
   
  });

  if (existente) {
    return res.status(403).json({
      message: "Ya existe una solicitud pendiente para esta venta",
    });
  }

  const solicitud = await Solicitud.create({
    tipo: "ELIMINAR_VENTA",
    venta: id,
    solicitadoPor: req.user.id,
  });

  try {
    getIO().emit("SOLICITUD_CREADA", {
      solicitudId: solicitud._id,
      ventaId: id,
      tipo: "ELIMINAR_VENTA",
    });
  } catch {}

  await Venta.findByIdAndUpdate(id, {
    estadoRevision: "pendiente",
  });

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

/* =========================
   MARCAR REVISIÓN COMO LEÍDA (EMPLEADO)
========================= */
export const marcarRevisionLeida = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { id } = req.params;

    // 🔒 Solo empleados (admin no tiene sentido aquí)
    if (req.user.role === "admin") {
      return res.status(403).json({
        message: "El administrador no puede marcar revisiones",
      });
    }

    const venta = await Venta.findOne({
      _id: id,
      createdBy: req.user.id,
    });

    if (!venta) {
      return res.status(404).json({
        message: "Venta no encontrada o no autorizada",
      });
    }

    // 🔔 Limpiar estado visual
    venta.estadoRevision = null;
    await venta.save();

    res.json({
      message: "Estado de revisión limpiado",
      venta,
    });
  } catch (error) {
    console.error("ERROR marcarRevisionLeida:", error);
    res.status(500).json({
      message: "Error limpiando estado de revisión",
    });
  }
};

/* =========================
   OBTENER SOLICITUD PENDIENTE POR VENTA (EMPLEADO)
========================= */
export const obtenerSolicitudPendientePorVenta = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { ventaId } = req.params;

    const solicitud = await Solicitud.findOne({
  venta: ventaId,
  // tipo: "EDITAR_VENTA",
  estado: "PENDIENTE",
}).sort({ createdAt: -1 });


    if (!solicitud) {
      return res.status(404).json({ message: "Sin solicitud pendiente" });
    }

    res.json(solicitud);
  } catch (error) {
    console.error("ERROR obtenerSolicitudPendientePorVenta:", error);
    res.status(500).json({
      message: "Error obteniendo solicitud pendiente",
    });
  }
};


export const buscarVentas = async (req: Request, res: Response) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "No autorizado" });
    }

    const { q } = req.query;

    if (!q || typeof q !== "string" || q.trim().length < 2) {
      return res.json([]);
    }

    const regex = new RegExp(q.trim(), "i");

    const ventas = await Venta.find({
      $or: [
        { tomador: regex },
        { numeroPoliza: regex },
        { documentoFiscal: regex },
      ],
    })
      .sort({ fechaEfecto: -1 })
      .limit(50)
      .populate("createdBy", "nombre");

    res.json(ventas);
  } catch (error) {
    console.error("ERROR buscarVentas:", error);
    res.status(500).json({ message: "Error en búsqueda de ventas" });
  }
};

/* =========================
    SOLICITUDES EMPLEADO
========================= */

export const contarRevisionesEmpleado = async (req: any, res: any) => {
  try {
    if (!req.user) {
      return res.status(401).json({ count: 0 });
    }

    const userId = req.user.id;

    const count = await Venta.countDocuments({
      createdBy: userId,
      estadoRevision: { $in: ["pendiente", "aceptada", "rechazada"] },
    });

    return res.json({ count });
  } catch (error) {
    console.error("❌ Error contando revisiones empleado:", error);
    return res.status(500).json({ count: 0 });
  }
};



/* =========================
   ANULAR VENTA
========================= */

export const anularVenta = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { id } = req.params;

    /* =====================================================
       👑 ADMIN → ANULA DIRECTAMENTE (ÚNICO QUE TOCA LA VENTA)
    ====================================================== */
    if (req.user.role === "admin") {
      const venta = await Venta.findByIdAndUpdate(
        id,
        {
          estado: "ANULADA",
          estadoRevision: null,
        },
        { new: true }
      );

      if (!venta) {
        return res.status(404).json({ message: "Venta no encontrada" });
      }

      try {
        getIO().emit("VENTA_ANULADA", { ventaId: id });
      } catch {}

      return res.json({
        message: "Venta anulada directamente por administrador",
        venta,
      });
    }

    /* =====================================================
       👤 EMPLEADO → SOLO CREA SOLICITUD (NO TOCA LA VENTA)
    ====================================================== */

    const existente = await Solicitud.findOne({
      venta: id,
      estado: "PENDIENTE",
      
    });

    if (existente) {
      return res.status(403).json({
        message: "Ya existe una solicitud de anulación pendiente",
      });
    }

    const solicitud = await Solicitud.create({
      tipo: "ANULAR_VENTA",
      venta: id,
      solicitadoPor: req.user.id,
      payload: req.body, // 🔥 CLAVE → motivo, fecha, verti
    });

    // 🔔 SOLO ESTADO VISUAL (NO estado real)
    await Venta.findByIdAndUpdate(id, {
      estadoRevision: "pendiente",
    });

    try {
      getIO().emit("SOLICITUD_CREADA", {
        solicitudId: solicitud._id,
        ventaId: id,
        tipo: "ANULAR_VENTA",
      });
    } catch {}

    // ⚠️ 403 ES CORRECTO → el frontend lo trata como OK
    return res.status(292).json({
      message: "Solicitud de anulación enviada al administrador",
    });

  } catch (error) {
    console.error("ANULAR VENTA ERROR:", error);
    return res.status(500).json({
      message: "Error anulando la venta",
    });
  }
};


/* =========================
   SOLICITAR REHABILITACIÓN
========================= */
export const solicitarRehabilitacion = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { id } = req.params;

    // 🔎 Comprobar venta
    const venta = await Venta.findById(id);
    if (!venta) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    // 🔒 Solo se puede rehabilitar si está ANULADA
    if (venta.estado !== "ANULADA") {
      return res.status(400).json({
        message: "La venta no está anulada",
      });
    }

    // ❌ Evitar duplicados
    const existente = await Solicitud.findOne({
      venta: id,
      tipo: "REHABILITAR_VENTA",
      estado: "PENDIENTE",
    });

    if (existente) {
      return res.status(202).json({
        message: "Ya existe una solicitud de rehabilitación pendiente",
      });
    }

    // ✅ CREAR SOLICITUD
    const solicitud = await Solicitud.create({
      tipo: "REHABILITAR_VENTA",
      venta: id,
      solicitadoPor: req.user.id,
    });

    // 🔔 Estado visual
    await Venta.findByIdAndUpdate(id, {
      estadoRevision: "pendiente",
    });

    // 🔊 Socket
    try {
      getIO().emit("SOLICITUD_CREADA", {
        solicitudId: solicitud._id,
        ventaId: id,
        tipo: "REHABILITAR_VENTA",
      });
    } catch {}

    // ⚠️ 403 intencionado
    return res.status(202).json({
      message: "Solicitud de rehabilitación enviada al administrador",
      solicitud,
    });
  } catch (error) {
    console.error("REHABILITAR VENTA ERROR:", error);
    return res.status(500).json({
      message: "Error solicitando rehabilitación",
    });
  }
};

