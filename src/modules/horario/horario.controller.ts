import { Response } from "express";
import RegistroHorario from "../../models/RegistroHorario";
import { getIO } from "../../socket";
import User from "../../models/User";
import {
  ahoraEspana,
  ajustarAHorario,
  calcularMinutosTrabajados,
  claveFecha,
  esFinDeSemana,
  esMesValido,
  hoyEspana,
  horaAMinutos,
  mesActualEspana,
  minutosATexto,
  nombreDiaSemana,
  normalizarHora,
  rangoDelMes,
  tramosDelTurno,
} from "../../utils/horario.utils";

/* =========================
   FICHAR (ENTRADA / SALIDA)
========================= */
export const fichar = async (req: any, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    // 🕒 SIEMPRE hora y día de España (no los del servidor)
    const { fecha: fechaLocal, hora: horaLocal } = ahoraEspana();

    let registro = await RegistroHorario.findOne({
      usuario: req.user.id,
      fecha: fechaLocal,
    });

    /* 🟢 Primer fichaje del día → ENTRADA */
    if (!registro) {
      try {
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
      } catch (error: any) {
        // Doble clic: otra petición creó el registro justo antes
        if (error?.code !== 11000) throw error;

        registro = await RegistroHorario.findOne({
          usuario: req.user.id,
          fecha: fechaLocal,
        });
      }
    }

    if (!registro) {
      throw new Error("No se pudo obtener el registro del día");
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
      const ajuste = ajustarAHorario("ENTRADA", horaLocal, registro);

      registro.fichajes.push({
        tipo: "ENTRADA",
        hora: ajuste.hora,
        activo: true,
        ...(ajuste.ajustado ? { horaReal: horaLocal, ajustado: true } : {}),
      });

      registro.minutosTrabajados = 0;
      await registro.save();

      return res.json({
        estado: "DENTRO",
        minutosTrabajados: 0,
        nombre: req.user.nombre,
        horaRegistrada: ajuste.hora,
        ajustado: ajuste.ajustado,
      });
    }

    const ultimo = fichajesActivos[fichajesActivos.length - 1];

    /* ⛔ Anti doble clic (mismo minuto, comparando con la hora REAL del
          último fichaje, que puede haberse ajustado al horario) */
    const horaRealUltimo = (ultimo as any).horaReal ?? ultimo.hora;
    if (horaAMinutos(horaLocal) === horaAMinutos(horaRealUltimo)) {
      return res.status(400).json({
        message: "Espera unos segundos antes de volver a fichar",
      });
    }

    /* 🔁 Alternar ENTRADA / SALIDA */
    let nuevoEstado: "DENTRO" | "FUERA";
    const tipoNuevo: "ENTRADA" | "SALIDA" =
      ultimo.tipo === "ENTRADA" ? "SALIDA" : "ENTRADA";

    // Horario asignado: entrada nunca antes del turno; salida con margen
    // Al volver de una pausa NO se ajusta (si no, saltaría al turno de tarde)
    const vuelveDePausa = tipoNuevo === "ENTRADA" && !!(ultimo as any).pausa;
    const ajuste = vuelveDePausa
      ? { hora: horaLocal, ajustado: false }
      : ajustarAHorario(tipoNuevo, horaLocal, registro);
    let horaFinal = ajuste.hora;
    let ajustado = ajuste.ajustado;

    // Una salida nunca puede quedar antes de la entrada registrada
    // (p. ej. entra 9:25 → se registra 9:30 y sale a las 9:27)
    if (
      tipoNuevo === "SALIDA" &&
      horaAMinutos(horaFinal) < horaAMinutos(ultimo.hora)
    ) {
      horaFinal = ultimo.hora;
      ajustado = horaFinal !== horaLocal;
    }

    registro.fichajes.push({
      tipo: tipoNuevo,
      hora: horaFinal,
      activo: true,
      ...(ajustado ? { horaReal: horaLocal, ajustado: true } : {}),
    });
    nuevoEstado = tipoNuevo === "SALIDA" ? "FUERA" : "DENTRO";

    registro.minutosTrabajados = calcularMinutosTrabajados(
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
      horaRegistrada: horaFinal,
      ajustado,
    });
  } catch (error: any) {
    // Dos peticiones a la vez sobre el mismo registro
    if (error?.name === "VersionError" || error?.code === 11000) {
      return res.status(409).json({
        message: "No se pudo registrar el fichaje, inténtalo de nuevo",
      });
    }

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

    const fechaLocal = hoyEspana();

    const registro = await RegistroHorario.findOne({
      usuario: req.user.id,
      fecha: fechaLocal,
    });

    const vacio = {
      estado: "FUERA",
      minutosTrabajados: 0,
      ultimaEntrada: null,
      fichajes: [],
      turno: [],
      pausa: null,
      nombre: req.user.nombre,
    };

    if (!registro) {
      return res.json(vacio);
    }

    const turno = tramosDelTurno(registro);

    const fichajesActivos = registro.fichajes.filter(
      (f: any) => f.activo !== false
    );

    if (fichajesActivos.length === 0) {
      return res.json({ ...vacio, turno });
    }

    const ultimo: any = fichajesActivos[fichajesActivos.length - 1];
    const dentro = ultimo.tipo === "ENTRADA";
    const enPausa = !dentro && ultimo.pausa === true;

    return res.json({
      estado: dentro ? "DENTRO" : enPausa ? "PAUSA" : "FUERA",
      minutosTrabajados: registro.minutosTrabajados,
      // Hora real de la última entrada (HH:mm, España): permite que la
      // pantalla calcule el tiempo en vivo sin guardar nada en el navegador.
      ultimaEntrada: dentro ? normalizarHora(ultimo.hora) : null,
      // Pausa en curso (si la hay)
      pausa: enPausa
        ? { motivo: ultimo.motivo ?? "", desde: normalizarHora(ultimo.hora) }
        : null,
      // Fichajes de hoy para pintar la línea de tiempo
      fichajes: fichajesActivos.map((f: any) => ({
        tipo: f.tipo,
        hora: normalizarHora(f.hora),
        ...(f.pausa ? { pausa: true } : {}),
        ...(f.motivo ? { motivo: String(f.motivo) } : {}),
      })),
      // Tramos de su turno de hoy (para "turno de hoy" y la barra de progreso)
      turno,
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
   PAUSA (salir del puesto un rato)
   POST /api/horario/pausa  { motivo }
   - Solo si está dentro de la jornada.
   - Guarda una SALIDA marcada como pausa (con motivo).
   - NO cierra la sesión del CRM, pero mientras dura las ventas quedan
     bloqueadas (la última marca ya no es una ENTRADA).
   - Para volver se usa /fichar (crea la ENTRADA).
========================= */
export const pausar = async (req: any, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { fecha: fechaLocal, hora: horaLocal } = ahoraEspana();

    const motivoRecibido =
      typeof req.body?.motivo === "string" ? req.body.motivo.trim() : "";
    const motivo = (motivoRecibido || "Pausa").slice(0, 40);

    const registro = await RegistroHorario.findOne({
      usuario: req.user.id,
      fecha: fechaLocal,
    });

    if (!registro || registro.cerrada) {
      return res
        .status(400)
        .json({ message: "Solo puedes pausar durante tu jornada" });
    }

    const activos = registro.fichajes.filter((f: any) => f.activo !== false);
    const ultimo: any = activos[activos.length - 1];

    if (!ultimo || ultimo.tipo !== "ENTRADA") {
      return res
        .status(400)
        .json({ message: "Solo puedes pausar durante tu jornada" });
    }

    /* ⛔ Anti doble clic (mismo minuto que la entrada real) */
    const horaRealUltimo = ultimo.horaReal ?? ultimo.hora;
    if (horaAMinutos(horaLocal) === horaAMinutos(horaRealUltimo)) {
      return res.status(400).json({
        message: "Espera unos segundos antes de volver a fichar",
      });
    }

    // La pausa nunca puede empezar antes de la entrada registrada
    const horaPausa =
      horaAMinutos(horaLocal) < horaAMinutos(ultimo.hora)
        ? ultimo.hora
        : horaLocal;

    registro.fichajes.push({
      tipo: "SALIDA",
      hora: horaPausa,
      activo: true,
      pausa: true,
      motivo,
    });

    registro.minutosTrabajados = calcularMinutosTrabajados(registro.fichajes);

    await registro.save();

    return res.json({
      estado: "PAUSA",
      minutosTrabajados: registro.minutosTrabajados,
      nombre: req.user.nombre,
      pausa: { motivo, desde: horaPausa },
    });
  } catch (error: any) {
    if (error?.name === "VersionError" || error?.code === 11000) {
      return res.status(409).json({
        message: "No se pudo registrar la pausa, inténtalo de nuevo",
      });
    }

    console.error("❌ ERROR en pausa:", error);
    return res.status(500).json({ message: "Error registrando la pausa" });
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

    const mesSolicitado = req.query.mes;

    if (mesSolicitado !== undefined && !esMesValido(mesSolicitado)) {
      return res
        .status(400)
        .json({ message: "Mes inválido (formato YYYY-MM)" });
    }

    const mes: string = mesSolicitado ?? mesActualEspana();

    const user = await User.findById(req.user.id).select(
      "horasContratadasSemana"
    );

    const { year, month, totalDias, desde, hasta } = rangoDelMes(mes);

    const registros = await RegistroHorario.find({
      usuario: req.user.id,
      fecha: { $gte: desde, $lte: hasta },
    }).sort({ fecha: 1 });

    const mapaRegistros = new Map(
      registros.map((r) => [r.fecha, r])
    );

    let totalMinutos = 0;
    let diasTrabajados = 0;
    const dias: any[] = [];

    for (let d = 1; d <= totalDias; d++) {
      const fecha = claveFecha(year, month, d);

      const registro = mapaRegistros.get(fecha);

      const minutosTrabajados =
        registro?.minutosTrabajados && registro.minutosTrabajados > 0
          ? registro.minutosTrabajados
          : 0;

      totalMinutos += minutosTrabajados;
      if (minutosTrabajados > 0) diasTrabajados += 1;

      let estado = registro?.estado ?? null;

      if (!estado && esFinDeSemana(fecha)) {
        estado = "DIA_LIBRE";
      }

      dias.push({
        fecha,
        diaSemana: nombreDiaSemana(fecha),
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
      mes,
      horasContratadasSemana: user?.horasContratadasSemana ?? 0,
      totalMinutos,
      totalHoras: minutosATexto(totalMinutos),
      diasTrabajados,
      dias,
    });
  } catch (error) {
    console.error("❌ Error historial mensual:", error);
    return res.status(500).json({
      message: "Error obteniendo historial",
    });
  }
};