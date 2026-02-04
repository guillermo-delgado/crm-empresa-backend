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

const solicitudesConPayload = await Promise.all(
  solicitudesPopulate.map(async (sol: any) => {
    if (sol.tipo !== "REHABILITAR_VENTA") {
      return sol;
    }

    const ventaId =
      typeof sol.venta === "object" && sol.venta._id
        ? sol.venta._id
        : sol.venta;

    const ultimaAnulacion = await Solicitud.findOne({
      venta: ventaId,
      tipo: "ANULAR_VENTA",
      estado: "APROBADA",
    }).sort({ createdAt: -1 });

    return {
      ...sol,
      payloadOrigen: ultimaAnulacion?.payload ?? null,
    };
  })
);

return res.json(solicitudesConPayload);



  

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

    /* =========================
       ACCIÓN SEGÚN TIPO
    ========================= */
    switch (solicitud.tipo) {
      case "ELIMINAR_VENTA": {
        await Venta.findByIdAndDelete(ventaId);

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

        delete payload.createdBy;
        delete payload.usuario;
        delete payload._id;
        delete payload.id;

        if (payload.primaNeta !== undefined) {
          payload.primaNeta = Number(payload.primaNeta);
        }

        await Venta.findByIdAndUpdate(ventaId, { $set: payload });

        const ventaActualizada = await Venta.findById(ventaId).populate(
          "createdBy"
        );

        getIO().emit("VENTA_ACTUALIZADA", ventaActualizada);
        break;
      }

      case "ANULAR_VENTA": {
        const {
          tipoFecha,
          fechaAnulacion,
          motivo,
          derivadoVerti,
        } = solicitud.payload || {};

        const update: any = {
          estado: "ANULADA",
          motivoAnulacion: motivo || "",
          derivadoVerti: !!derivadoVerti,
        };

        if (tipoFecha === "FECHA" && fechaAnulacion) {
          update.fechaAnulacion = new Date(fechaAnulacion);
        }

        const venta = await Venta.findByIdAndUpdate(ventaId, update, {
          new: true,
        });

        if (!venta) {
          throw new Error("Venta no encontrada al anular");
        }

        getIO().emit("VENTA_ANULADA", {
          ventaId: ventaId.toString(),
        });
        break;
      }

      case "REHABILITAR_VENTA": {
        const venta = await Venta.findById(ventaId);

        if (!venta || venta.estado !== "ANULADA") {
          return res.status(400).json({
            message: "La venta no está anulada",
          });
        }

        venta.set("estado", undefined);
        venta.motivoAnulacion = undefined;
        venta.fechaAnulacion = undefined;
        venta.derivadoVerti = false;
        venta.estadoRevision = null;

        await venta.save();

        getIO().emit("VENTA_REHABILITADA", {
          ventaId: venta._id.toString(),
        });
        break;
      }
    }

    /* =========================
       MARCAR SOLICITUD APROBADA
    ========================= */
    solicitud.estado = "APROBADA";
    await solicitud.save();

    /* =========================
       LIMPIEZA VISUAL (NO REAL)
    ========================= */
    await Venta.findByIdAndUpdate(ventaId, {
      estadoRevision: null,
    });

    /* =========================
       LIMPIAR OTRAS SOLICITUDES
    ========================= */
    await Solicitud.deleteMany({
      venta: solicitud.venta,
      estado: "PENDIENTE",
      _id: { $ne: solicitud._id },
    });

    /* =========================
       SOCKET FINAL
    ========================= */
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

    solicitud.estado = "RECHAZADA";
    await solicitud.save();

    await Venta.findByIdAndUpdate(ventaId, {
      estadoRevision: "rechazada",
    });

    await Solicitud.deleteMany({
      venta: solicitud.venta,
      estado: "PENDIENTE",
      _id: { $ne: solicitud._id },
    });

    getIO().emit("SOLICITUD_RESUELTA", {
      ventaId,
      estado: "rechazada",
    });

    return res.json({ message: "Solicitud rechazada correctamente" });
  } catch (error) {
    console.error("❌ ERROR RECHAZANDO SOLICITUD:", error);
    return res.status(500).json({ message: "Error rechazando solicitud" });
  }
};

/* =========================
   CONTAR REVISIONES EMPLEADO
========================= */
export const contarRevisionesEmpleado = async (req: any, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

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
