import { Router, Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import RegistroHorario from "../../models/RegistroHorario";
import { authMiddleware, adminOnly } from "../../middlewares/auth";
import {
  calcularMinutosTrabajados,
  esFechaValida,
  esHoraValida,
  normalizarHora,
} from "../../utils/horario.utils";

const router = Router();

/* =========================
   🔒 SOLO ADMIN CRM
   (antes este router estaba abierto sin login)
========================= */
router.use(authMiddleware);
router.use(adminOnly);

/**
 * POST /api/crm/fichajes
 * Guarda fichajes manuales desde CRM
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    if (!req.body) {
      return res.status(400).json({
        message: "Body vacío o no parseado",
      });
    }

    const {
      empleadoId,
      fecha,
      fichajes,
    }: {
      empleadoId?: string;
      fecha?: string;
      fichajes?: { tipo: "ENTRADA" | "SALIDA"; hora: string; motivo?: string }[];
    } = req.body;

    if (!empleadoId || !fecha || !Array.isArray(fichajes)) {
      return res.status(400).json({
        message: "Datos incompletos",
      });
    }

    if (!isValidObjectId(empleadoId)) {
      return res.status(400).json({ message: "Empleado inválido" });
    }

    if (!esFechaValida(fecha)) {
      return res.status(400).json({ message: "Fecha inválida" });
    }

    // Los vacíos y "00:00" se ignoran (como siempre); el resto debe ser válido
    const aGuardar = fichajes.filter((f) => f && f.hora && f.hora !== "00:00");

    const hayInvalidos = aGuardar.some(
      (f) =>
        (f.tipo !== "ENTRADA" && f.tipo !== "SALIDA") ||
        !esHoraValida(f.hora)
    );

    if (hayInvalidos) {
      return res.status(400).json({
        message: "Hay fichajes con tipo u hora inválidos (HH:mm)",
      });
    }

    /* 1️⃣ Buscar o crear registro del día */
    let registro = await RegistroHorario.findOne({
      usuario: empleadoId,
      fecha,
    });

    if (!registro) {
      registro = new RegistroHorario({
        usuario: empleadoId,
        fecha,
        fichajes: [],
        minutosTrabajados: 0,
      });
    }

    /* 2️⃣ Guardar fichajes (hora STRING HH:mm) */
    registro.fichajes = aGuardar.map((f) => ({
      tipo: f.tipo,
      hora: normalizarHora(f.hora),
      activo: true,
      // Motivo de la pausa (solo tiene sentido en la SALIDA que la inicia)
      ...(f.tipo === "SALIDA" && typeof f.motivo === "string" && f.motivo.trim()
        ? { motivo: f.motivo.trim().slice(0, 80) }
        : {}),
    }));

    /* 3️⃣ Marcar como corregido desde CRM */
    registro.corregida = true;

    /* 4️⃣ Calcular minutos trabajados */
    registro.minutosTrabajados = calcularMinutosTrabajados(
      registro.fichajes
    );

    /* 5️⃣ Guardar */
    await registro.save();

    return res.json({
      ok: true,
      minutosTrabajados: registro.minutosTrabajados,
      fichajesGuardados: registro.fichajes.length,
    });
  } catch (error) {
    console.error("ERROR GUARDAR FICHAJES CRM", error);
    return res.status(500).json({
      message: "Error interno",
    });
  }
});

/**
 * GET /api/crm/fichajes
 * Recupera fichajes de un empleado en un día
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { empleadoId, fecha } = req.query as {
      empleadoId?: string;
      fecha?: string;
    };

    if (!empleadoId || !fecha) {
      return res.status(400).json({
        message: "empleadoId y fecha son obligatorios",
      });
    }

    if (!isValidObjectId(empleadoId) || !esFechaValida(fecha)) {
      return res.status(400).json({
        message: "empleadoId o fecha inválidos",
      });
    }

    const registro = await RegistroHorario.findOne({
      usuario: empleadoId,
      fecha,
    });

    if (!registro) {
      return res.json({
        fichajes: [],
        minutosTrabajados: 0,
      });
    }

    return res.json({
      fichajes: registro.fichajes.filter(
        (f: any) => f.activo !== false && f.hora !== "00:00"
      ),
      minutosTrabajados: registro.minutosTrabajados,
      corregida: registro.corregida,
      cerrada: registro.cerrada,
    });
  } catch (error) {
    console.error("ERROR OBTENER FICHAJES CRM", error);
    return res.status(500).json({
      message: "Error interno",
    });
  }
});

/**
 * DELETE /api/crm/fichajes/:fichajeId
 * Elimina (desactiva) un fichaje concreto
 */
router.delete("/:fichajeId", async (req: Request, res: Response) => {
  try {
    const { fichajeId } = req.params;

    if (!isValidObjectId(fichajeId)) {
      return res.status(400).json({ message: "Fichaje inválido" });
    }

    const registro = await RegistroHorario.findOne({
      "fichajes._id": fichajeId,
    });

    if (!registro) {
      return res.status(404).json({
        message: "Fichaje no encontrado",
      });
    }

    const fichaje = registro.fichajes.find(
      (f: any) => f._id?.toString() === fichajeId
    );

    if (!fichaje) {
      return res.status(404).json({
        message: "Fichaje no encontrado",
      });
    }

    /* 🔒 Desactivar fichaje */
    fichaje.activo = false;

    /* 🔄 Recalcular minutos */
    registro.minutosTrabajados = calcularMinutosTrabajados(
      registro.fichajes
    );
    registro.corregida = true;

    await registro.save();

    return res.json({
      ok: true,
      minutosTrabajados: registro.minutosTrabajados,
    });
  } catch (error) {
    console.error("ERROR ELIMINAR FICHAJE", error);
    return res.status(500).json({
      message: "Error interno",
    });
  }
});

export default router;