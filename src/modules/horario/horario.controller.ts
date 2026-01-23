import { Request, Response } from "express";
import RegistroHorario from "../../models/RegistroHorario";
import { getIO } from "../../socket";
import User from "../../models/User";

/* =========================
   HELPERS
========================= */

const horaAMinutos = (hora: string): number => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

const calcularMinutos = (fichajes: any[]) => {
  const activos = fichajes
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

  let total = 0;

  for (let i = 0; i < activos.length; i += 2) {
    const entrada = activos[i];
    const salida = activos[i + 1];
    if (!salida) break;

    const diff =
      horaAMinutos(salida.hora) -
      horaAMinutos(entrada.hora);

    if (diff > 0) total += diff;
  }

  return Math.round(total);
};

/* =========================
   FICHAR (ENTRADA / SALIDA)
========================= */
export const fichar = async (req: any, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const ahora = new Date();
    const fechaLocal = ahora.toLocaleDateString("sv-SE"); // YYYY-MM-DD
    const horaLocal = ahora.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });

    let registro = await RegistroHorario.findOne({
      usuario: req.user.id,
      fecha: fechaLocal,
    });

    /* 🟢 Primer fichaje del día → ENTRADA */
    if (!registro) {
      await RegistroHorario.create({
        usuario: req.user.id,
        fecha: fechaLocal,
        fichajes: [
          {
            tipo: "ENTRADA",
            hora: horaLocal,
            activo: true,
          },
        ],
        minutosTrabajados: 0,
      });

      return res.json({
        estado: "DENTRO",
        minutosTrabajados: 0,
        nombre: req.user.nombre,
      });
    }

    if (registro.cerrada) {
      return res
        .status(400)
        .json({ message: "La jornada está cerrada" });
    }

    const fichajesActivos = registro.fichajes.filter(
      (f: any) => f.activo !== false
    );

    /* 👉 Si no hay fichajes activos, forzar ENTRADA */
    if (fichajesActivos.length === 0) {
      registro.fichajes.push({
        tipo: "ENTRADA",
        hora: horaLocal,
        activo: true,
      });

      registro.minutosTrabajados = 0;
      await registro.save();

      return res.json({
        estado: "DENTRO",
        minutosTrabajados: 0,
        nombre: req.user.nombre,
      });
    }

    const ultimo = fichajesActivos[fichajesActivos.length - 1];

    /* ⛔ Anti doble clic (mismo minuto) */
    if (horaAMinutos(horaLocal) === horaAMinutos(ultimo.hora)) {
      return res.status(400).json({
        message: "Espera unos segundos antes de volver a fichar",
      });
    }

    /* 🔁 Alternar ENTRADA / SALIDA */
    let nuevoEstado: "DENTRO" | "FUERA";

    if (ultimo.tipo === "ENTRADA") {
      registro.fichajes.push({
        tipo: "SALIDA",
        hora: horaLocal,
        activo: true,
      });
      nuevoEstado = "FUERA";
    } else {
      registro.fichajes.push({
        tipo: "ENTRADA",
        hora: horaLocal,
        activo: true,
      });
      nuevoEstado = "DENTRO";
    }

    registro.minutosTrabajados = calcularMinutos(
      registro.fichajes
    );

    await registro.save();

    /* 🔥 Si es SALIDA → cerrar CRM */
    if (nuevoEstado === "FUERA") {
      try {
        getIO()
          .to(`user:${req.user.id}`)
          .emit("FORCE_LOGOUT");
      } catch (e) {
        console.error("⚠️ Socket emit error:", e);
      }
    }

    return res.json({
      estado: nuevoEstado,
      minutosTrabajados: registro.minutosTrabajados,
      nombre: req.user.nombre,
    });
  } catch (error) {
    console.error("❌ ERROR fichando:", error);
    return res.status(500).json({
      message: "Error fichando",
    });
  }
};

/* =========================
   VER MI DÍA ACTUAL
========================= */
export const obtenerHoy = async (req: any, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const fechaLocal = new Date().toLocaleDateString("sv-SE");

    const registro = await RegistroHorario.findOne({
      usuario: req.user.id,
      fecha: fechaLocal,
    });

    if (!registro) {
      return res.json({
        estado: "FUERA",
        minutosTrabajados: 0,
        nombre: req.user.nombre,
      });
    }

    const fichajesActivos = registro.fichajes.filter(
      (f: any) => f.activo !== false
    );

    if (fichajesActivos.length === 0) {
      return res.json({
        estado: "FUERA",
        minutosTrabajados: 0,
        nombre: req.user.nombre,
      });
    }

    const ultimo = fichajesActivos[fichajesActivos.length - 1];

    return res.json({
  estado: ultimo.tipo === "ENTRADA" ? "DENTRO" : "FUERA",
  minutosTrabajados: registro.minutosTrabajados,
  nombre: req.user.nombre, 
});

  } catch (error) {
    console.error("❌ ERROR obteniendo día:", error);
    return res.status(500).json({
      message: "Error obteniendo jornada",
    });
  }
};

/* =========================
   HISTORIAL MENSUAL
========================= */
export const historialMensual = async (req: any, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { mes } = req.query;
    const ahora = new Date();

    const user = await User.findById(req.user.id).select(
      "horasContratadasSemana"
    );

    const [year, month] = mes
      ? mes.split("-").map(Number)
      : [ahora.getFullYear(), ahora.getMonth() + 1];

    const desde = `${year}-${String(month).padStart(2, "0")}-01`;
    const hasta = `${year}-${String(month).padStart(2, "0")}-31`;

    const registros = await RegistroHorario.find({
      usuario: req.user.id,
      fecha: { $gte: desde, $lte: hasta },
    }).sort({ fecha: 1 });

    const mapaRegistros = new Map(
      registros.map((r) => [r.fecha, r])
    );

    let totalMinutos = 0;
    const dias: any[] = [];

    const totalDiasMes = new Date(year, month, 0).getDate();

    for (let d = 1; d <= totalDiasMes; d++) {
      const fecha = `${year}-${String(month).padStart(
        2,
        "0"
      )}-${String(d).padStart(2, "0")}`;

      const registro = mapaRegistros.get(fecha);

      const minutosTrabajados =
        registro?.minutosTrabajados && registro.minutosTrabajados > 0
          ? registro.minutosTrabajados
          : 0;

      totalMinutos += minutosTrabajados;

      let estado = registro?.estado ?? null;

      const day = new Date(fecha).getDay();
      const esFinde = day === 0 || day === 6;

      if (!estado && esFinde) {
        estado = "DIA_LIBRE";
      }

      dias.push({
        fecha,
        estado,
        minutosTrabajados,
        fichajes: registro?.fichajes
          ? registro.fichajes
              .filter(
                (f: any) =>
                  f.activo !== false && f.hora !== "00:00"
              )
              .map((f: any) => ({
                tipo: f.tipo,
                hora: f.hora,
              }))
          : [],
        turno: registro?.turno ?? null,
        horaEntradaManana: registro?.horaEntradaManana ?? null,
        horaSalidaManana: registro?.horaSalidaManana ?? null,
        horaEntradaTarde: registro?.horaEntradaTarde ?? null,
        horaSalidaTarde: registro?.horaSalidaTarde ?? null,
      });
    }

    return res.json({
      mes: `${year}-${String(month).padStart(2, "0")}`,
      horasContratadasSemana: user?.horasContratadasSemana ?? 0,
      totalMinutos,
      dias,
    });
  } catch (error) {
    console.error("❌ Error historial mensual:", error);
    return res.status(500).json({
      message: "Error obteniendo historial",
    });
  }
};
