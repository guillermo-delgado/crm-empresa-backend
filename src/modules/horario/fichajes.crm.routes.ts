import { Router, Request, Response } from "express";
import RegistroHorario from "../../models/RegistroHorario";

const router = Router();

/* =========================
   HELPERS
========================= */
const horaAMinutos = (hora: string): number => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

/**
 * POST /api/crm/fichajes
 * Guarda fichajes manuales desde CRM
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    console.log("POST /api/crm/fichajes → BODY:", req.body);

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
      fichajes?: { tipo: "ENTRADA" | "SALIDA"; hora: string }[];
    } = req.body;

    if (!empleadoId || !fecha || !Array.isArray(fichajes)) {
      return res.status(400).json({
        message: "Datos incompletos",
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
    registro.fichajes = fichajes
      .filter((f) => f.hora && f.hora !== "00:00")
      .map((f) => ({
        tipo: f.tipo,
        hora: f.hora, // ⬅️ STRING, NO Date
        activo: true,
      }));

    /* 3️⃣ Marcar como corregido desde CRM */
    registro.corregida = true;

    /* 4️⃣ Calcular minutos trabajados */
    let minutos = 0;

    const activos = registro.fichajes
      .filter(
        (f: any) =>
          f.activo !== false &&
          typeof f.hora === "string" &&
          f.hora !== "00:00"
      )
      .sort(
        (a: any, b: any) =>
          horaAMinutos(a.hora) - horaAMinutos(b.hora)
      );

    for (let i = 0; i < activos.length; i += 2) {
      const entrada = activos[i];
      const salida = activos[i + 1];

      if (!entrada || !salida) break;

      const diff =
        horaAMinutos(salida.hora) -
        horaAMinutos(entrada.hora);

      if (diff > 0) {
        minutos += diff;
      }
    }

    registro.minutosTrabajados = Math.round(minutos);

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
router.get("/", async (req, res) => {
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
router.delete("/:fichajeId", async (req, res) => {
  try {
    const { fichajeId } = req.params;

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
    let minutos = 0;

    const activos = registro.fichajes
      .filter(
        (f: any) =>
          f.activo !== false &&
          typeof f.hora === "string" &&
          f.hora !== "00:00"
      )
      .sort(
        (a: any, b: any) =>
          horaAMinutos(a.hora) - horaAMinutos(b.hora)
      );

    for (let i = 0; i < activos.length; i += 2) {
      const entrada = activos[i];
      const salida = activos[i + 1];
      if (!entrada || !salida) break;

      const diff =
        horaAMinutos(salida.hora) -
        horaAMinutos(entrada.hora);

      if (diff > 0) minutos += diff;
    }

    registro.minutosTrabajados = Math.round(minutos);
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
