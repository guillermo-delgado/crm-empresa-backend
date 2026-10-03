import { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import RegistroHorario from "../../models/RegistroHorario";
import User from "../../models/User";
import {
  calcularMinutosTrabajados,
  claveFecha,
  esFechaValida,
  esFinDeSemana,
  esHoraValida,
  esMesValido,
  horaParaMostrar,
  minutosObjetivoDia,
  normalizarHora,
  rangoDelMes,
} from "../../utils/horario.utils";

type FichajeDia = {
  tipo: "ENTRADA" | "SALIDA";
  hora: string;
  /** Motivo de una pausa (se guarda en la SALIDA que la inicia) */
  motivo?: string;
};

const ESTADOS = ["VACACIONES", "DIA_LIBRE", "BAJA", "FESTIVO"];
const TURNOS = ["MANANA", "TARDE", "MANANA_TARDE"];

/** Valida { entrada, salida } opcional de un turno. */
const tramoValido = (tramo: any): boolean =>
  !tramo ||
  ((tramo.entrada === undefined ||
    tramo.entrada === "" ||
    esHoraValida(tramo.entrada)) &&
    (tramo.salida === undefined ||
      tramo.salida === "" ||
      esHoraValida(tramo.salida)));

/* =========================
   🏖️ LÍMITE DE VACACIONES (por año natural)
========================= */
const contarVacaciones = async (
  empleadoId: string,
  year: string,
  excluirFechas: string[] = []
): Promise<number> => {
  const rango: any = {
    $gte: `${year}-01-01`,
    $lte: `${year}-12-31`,
    ...(excluirFechas.length ? { $nin: excluirFechas } : {}),
  };

  // Vacaciones marcadas al propio empleado
  const propias = await RegistroHorario.countDocuments({
    usuario: empleadoId,
    estado: "VACACIONES",
    fecha: rango,
  });

  // Vacaciones generales (marcadas desde "Todos los empleados"): también
  // se ven en su calendario, salvo que el día tenga un registro propio.
  const generales = await RegistroHorario.find({
    usuario: null,
    estado: "VACACIONES",
    fecha: rango,
  }).select("fecha");

  if (generales.length === 0) return propias;

  const fechasGenerales = generales.map((r: any) => r.fecha);
  const conRegistroPropio = await RegistroHorario.find({
    usuario: empleadoId,
    fecha: { $in: fechasGenerales },
  }).select("fecha");

  const propiasSet = new Set(conRegistroPropio.map((r: any) => r.fecha));
  const soloGenerales = new Set(
    fechasGenerales.filter((f: string) => !propiasSet.has(f))
  );

  return propias + soloGenerales.size;
};

/**
 * Comprueba que marcar estas fechas como VACACIONES no supera el máximo
 * del empleado en ningún año. Devuelve el mensaje de error o null.
 */
const errorLimiteVacaciones = async (
  empleadoId: string,
  fechas: string[]
): Promise<string | null> => {
  const empleado: any = await User.findById(empleadoId);
  const max: number = empleado?.maxDiasVacaciones ?? 30;

  const porAnio = new Map<string, string[]>();
  for (const f of fechas) {
    const y = f.slice(0, 4);
    porAnio.set(y, [...(porAnio.get(y) ?? []), f]);
  }

  for (const [year, lista] of porAnio) {
    // Los días que ya eran vacaciones no cuentan como nuevos
    const usados = await contarVacaciones(empleadoId, year, lista);
    if (usados + lista.length > max) {
      const quedan = Math.max(0, max - usados);
      return quedan === 0
        ? `Ya tiene aplicados los ${max} días de vacaciones de ${year}`
        : `Solo quedan ${quedan} días de vacaciones en ${year} (máximo ${max})`;
    }
  }
  return null;
};

/* =========================
   👥 OBTENER EMPLEADOS
   GET /api/crm/horario/empleados
========================= */
export const obtenerEmpleados = async (
  _req: Request,
  res: Response
) => {
  try {
    const empleados = await User.find(
      { role: "empleado", activo: true },
      { nombre: 1 }
    ).sort({ nombre: 1 });

    return res.json(empleados);
  } catch (error) {
    console.error("❌ Error empleados:", error);
    return res
      .status(500)
      .json({ message: "Error empleados" });
  }
};

/* =========================
   📅 CALENDARIO CRM
   GET /api/crm/horario?mes&empleadoId?
========================= */
export const obtenerCalendarioEmpleado = async (
  req: Request,
  res: Response
) => {
  try {
    const { mes, empleadoId } = req.query as {
      mes: string;
      empleadoId?: string;
    };

    if (!mes) {
      return res.status(400).json({ message: "Mes requerido" });
    }

    if (!esMesValido(mes)) {
      return res
        .status(400)
        .json({ message: "Mes inválido (formato YYYY-MM)" });
    }

    if (empleadoId && !isValidObjectId(empleadoId)) {
      return res.status(400).json({ message: "Empleado inválido" });
    }

    let horasContratadasSemana = 40;
    let maxDiasVacaciones = 30;

    if (empleadoId) {
      const empleado = await User.findById(empleadoId);

      if (empleado) {
        horasContratadasSemana =
          empleado.horasContratadasSemana ?? 40;

        maxDiasVacaciones =
          empleado.maxDiasVacaciones ?? 30;
      }
    }

    const { year, month, totalDias, desde, hasta } = rangoDelMes(mes);

    const filtro: any = {
      fecha: { $gte: desde, $lte: hasta },
    };

    if (empleadoId) {
      filtro.$or = [
        { usuario: empleadoId },
        { usuario: null },
        { usuario: { $exists: false } },
      ];
    }

    const registros = await RegistroHorario.find(filtro);
    const mapaRegistros = new Map<string, any>();

    for (const r of registros) {
      const key = `${r.fecha}__${r.usuario ?? "GLOBAL"}`;
      mapaRegistros.set(key, r);
    }

    let horasTrabajadas = 0;
    for (const r of registros) {
      if (
        typeof r.minutosTrabajados === "number" &&
        Number.isFinite(r.minutosTrabajados)
      ) {
        horasTrabajadas += r.minutosTrabajados;
      }
    }

    const dias: {
      fecha: string;
      minutosTrabajados: number;
      estado: "VACACIONES" | "DIA_LIBRE" | "BAJA" | "FESTIVO" | null;
      turno: "MANANA" | "TARDE" | "MANANA_TARDE" | null;
      esFinDeSemana: boolean;
      fichajes: FichajeDia[];
      horaEntradaManana: string | null;
      horaSalidaManana: string | null;
      horaEntradaTarde: string | null;
      horaSalidaTarde: string | null;
    }[] = [];

    const minutosDia = (horasContratadasSemana * 60) / 5;
    let minutosTeoricosMes = 0;
    // Suma de las horas de TODAS las jornadas (turnos) aplicadas en el mes
    let minutosAplicadosMes = 0;

    for (let d = 1; d <= totalDias; d++) {
      const fecha = claveFecha(year, month, d);

      const keyEmpleado = `${fecha}__${empleadoId ?? "GLOBAL"}`;
      const keyGlobal = `${fecha}__GLOBAL`;

      const registro =
        mapaRegistros.get(keyEmpleado) ??
        mapaRegistros.get(keyGlobal) ??
        null;

      // ⏱️ Minutos reales desde fichajes (mismo cálculo que en todo el sistema)
      const minutosTrabajados = registro?.fichajes?.length
        ? calcularMinutosTrabajados(registro.fichajes)
        : 0;

      const fichajes: FichajeDia[] = (registro?.fichajes ?? [])
        .filter((f: any) => f.activo !== false)
        .map((f: any) => ({
          tipo: f.tipo,
          hora: horaParaMostrar(f.hora),
          ...(f.motivo ? { motivo: String(f.motivo) } : {}),
        }))
        .filter(
          (f: FichajeDia) => f.hora !== "" && f.hora !== "00:00"
        );

      // Horas teóricas del mes (como siempre)
      let descuenta = true;

      if (esFinDeSemana(fecha)) descuenta = false;
      if (registro?.estado === "VACACIONES") descuenta = false;
      if (registro?.estado === "BAJA") descuenta = false;
      if (registro?.estado === "FESTIVO") descuenta = false;
      if (registro?.estado === "DIA_LIBRE") descuenta = false;

      if (descuenta) {
        minutosTeoricosMes += minutosDia;
      }

      // Horas de la jornada aplicada ese día (si tiene turno y no es un estado)
      if (registro?.turno && !registro?.estado) {
        minutosAplicadosMes += minutosObjetivoDia(
          registro,
          null,
          horasContratadasSemana,
          esFinDeSemana(fecha)
        );
      }

      dias.push({
        fecha,
        minutosTrabajados,
        estado: registro?.estado ?? null,
        turno: registro?.turno ?? null,
        esFinDeSemana: esFinDeSemana(fecha),
        fichajes,
        horaEntradaManana: registro?.horaEntradaManana ?? null,
        horaSalidaManana: registro?.horaSalidaManana ?? null,
        horaEntradaTarde: registro?.horaEntradaTarde ?? null,
        horaSalidaTarde: registro?.horaSalidaTarde ?? null,
      });
    }

    const balanceMinutos = horasTrabajadas - minutosTeoricosMes;

    // 🏖️ Vacaciones ya aplicadas en el año del mes consultado
    const diasVacacionesUsados = empleadoId
      ? await contarVacaciones(empleadoId, String(year))
      : 0;

    return res.json({
      dias,
      horasTrabajadas,
      balanceMinutos,
      diasVacacionesUsados,
      // Jornadas aplicadas vs horas que corresponden al mes
      minutosAplicadosMes,
      minutosTeoricosMes: Math.round(minutosTeoricosMes),
      horasContratadasSemana,
      maxDiasVacaciones,
    });
  } catch (error) {
    console.error("❌ Error calendario:", error);
    return res.status(500).json({ message: "Error calendario" });
  }
};

/* =========================
   ✏️ EDITAR FICHAJE
   PUT /api/crm/horario/:registroId/fichaje/:fichajeId
========================= */
export const editarFichaje = async (
  req: Request,
  res: Response
) => {
  try {
    const { registroId, fichajeId } = req.params;
    const { hora } = req.body;

    if (!hora) {
      return res
        .status(400)
        .json({ message: "Hora requerida" });
    }

    if (!esHoraValida(hora)) {
      return res
        .status(400)
        .json({ message: "Hora inválida (formato HH:mm)" });
    }

    if (!isValidObjectId(registroId)) {
      return res
        .status(400)
        .json({ message: "Registro inválido" });
    }

    const registro = await RegistroHorario.findById(registroId);

    if (!registro) {
      return res
        .status(404)
        .json({ message: "Registro no encontrado" });
    }

    const fichaje = registro.fichajes.find(
      (f: any) => f._id?.toString() === fichajeId
    );

    if (!fichaje || fichaje.activo === false) {
      return res
        .status(404)
        .json({ message: "Fichaje inválido" });
    }

    fichaje.hora = normalizarHora(hora); // "10:00"

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
    console.error("❌ Error editar fichaje:", error);
    return res
      .status(500)
      .json({ message: "Error editar fichaje" });
  }
};

/* =========================
   🗑️ ELIMINAR FICHAJE (DESACTIVAR)
   DELETE /api/crm/horario/:registroId/fichaje/:fichajeId
========================= */
export const eliminarFichaje = async (
  req: Request,
  res: Response
) => {
  try {
    const { registroId, fichajeId } = req.params;

    if (!isValidObjectId(registroId)) {
      return res
        .status(400)
        .json({ message: "Registro inválido" });
    }

    const registro = await RegistroHorario.findById(registroId);

    if (!registro) {
      return res
        .status(404)
        .json({ message: "Registro no encontrado" });
    }

    const fichaje = registro.fichajes.find(
      (f: any) => f._id?.toString() === fichajeId
    );

    if (!fichaje || fichaje.activo === false) {
      return res
        .status(404)
        .json({ message: "Fichaje inválido" });
    }

    fichaje.activo = false;

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
    console.error("❌ Error eliminar fichaje:", error);
    return res
      .status(500)
      .json({ message: "Error eliminar fichaje" });
  }
};

/* =========================
   🏖️ MARCAR DÍA (VACACIONES / BAJA / LIBRE)
   POST /api/crm/horario/dia
   - Sin empleadoId → marca GENERAL (festivo, etc.): usuario = null
   - Con empleadoId → marca de ese empleado
========================= */
export const marcarDia = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      fecha,
      estado,
      turno,
      empleadoId,
      horasManana,
      horasTarde,
    } = req.body;

    if (!fecha || (!estado && !turno)) {
      return res
        .status(400)
        .json({ message: "Datos incompletos" });
    }

    if (!esFechaValida(fecha)) {
      return res.status(400).json({ message: "Fecha inválida" });
    }

    if (estado && !ESTADOS.includes(estado)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    if (turno && !TURNOS.includes(turno)) {
      return res.status(400).json({ message: "Turno inválido" });
    }

    if (empleadoId && !isValidObjectId(empleadoId)) {
      return res.status(400).json({ message: "Empleado inválido" });
    }

    if (!tramoValido(horasManana) || !tramoValido(horasTarde)) {
      return res
        .status(400)
        .json({ message: "Horario de turno inválido (HH:mm)" });
    }

    if (estado === "VACACIONES" && empleadoId) {
      const errorLimite = await errorLimiteVacaciones(empleadoId, [fecha]);
      if (errorLimite) {
        return res.status(400).json({ message: errorLimite });
      }
    }

    // ✅ Siempre filtramos por usuario (null = registro general),
    //    para no modificar por error el registro de un empleado.
    const filtro: any = { fecha, usuario: empleadoId ?? null };

    let registro = await RegistroHorario.findOne(filtro);

    if (!registro) {
      registro = await RegistroHorario.create({
        fecha,
        usuario: empleadoId ?? null,
        estado: estado ?? undefined,
        turno: turno ?? undefined,
        minutosTrabajados: 0,
        fichajes: [],
      });
    } else {
      if (estado !== null && estado !== undefined) {
        registro.estado = estado;
      }

      if (turno !== null && turno !== undefined) {
        registro.turno = turno;
      }
    }

    if (horasManana) {
      registro.horaEntradaManana = horasManana.entrada;
      registro.horaSalidaManana = horasManana.salida;
    }

    if (horasTarde) {
      registro.horaEntradaTarde = horasTarde.entrada;
      registro.horaSalidaTarde = horasTarde.salida;
    }

    await registro.save();

    return res.json({ ok: true });
  } catch (error) {
    console.error("❌ Error marcar día:", error);
    return res
      .status(500)
      .json({ message: "Error marcar día" });
  }
};

/* =========================
   ❌ ELIMINAR MARCA DE DÍA
   DELETE /api/crm/horario/dia
========================= */
export const eliminarDia = async (
  req: Request,
  res: Response
) => {
  try {
    const { fecha, empleadoId } = req.body;

    if (!fecha) {
      return res
        .status(400)
        .json({ message: "Fecha requerida" });
    }

    if (!esFechaValida(fecha)) {
      return res.status(400).json({ message: "Fecha inválida" });
    }

    if (empleadoId && !isValidObjectId(empleadoId)) {
      return res.status(400).json({ message: "Empleado inválido" });
    }

    const registro = await RegistroHorario.findOne({
      fecha,
      usuario: empleadoId ?? null,
    });

    if (!registro) {
      return res.json({ ok: true });
    }

    // 🔹 Limpiar estado, turno y horas del turno
    registro.estado = undefined;
    registro.turno = undefined;
    registro.horaEntradaManana = undefined;
    registro.horaSalidaManana = undefined;
    registro.horaEntradaTarde = undefined;
    registro.horaSalidaTarde = undefined;

    // 🔹 Si NO tiene fichajes → borrar registro completo
    if (!registro.fichajes || registro.fichajes.length === 0) {
      await RegistroHorario.deleteOne({ _id: registro._id });
    } else {
      await registro.save();
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("❌ Error eliminar día:", error);
    return res
      .status(500)
      .json({ message: "Error eliminar día" });
  }
};

/* =========================
   📅 CALENDARIO GENERAL (VISUAL)
   GET /api/horario/calendario-general
   GET /api/crm/horario/calendario-general
========================= */
export const obtenerCalendarioGeneral = async (
  req: Request,
  res: Response
) => {
  try {
    const { mes } = req.query as { mes: string };

    if (!mes) {
      return res.status(400).json({ message: "Mes requerido" });
    }

    if (!esMesValido(mes)) {
      return res
        .status(400)
        .json({ message: "Mes inválido (formato YYYY-MM)" });
    }

    const { year, month, totalDias, desde, hasta } = rangoDelMes(mes);

    const registrosGenerales = await RegistroHorario.find({
      fecha: { $gte: desde, $lte: hasta },
      estado: { $in: ["FESTIVO", "DIA_LIBRE", "BAJA", "VACACIONES"] },
      $or: [{ usuario: null }, { usuario: { $exists: false } }],
    }).select("fecha estado");

    const mapaEstados = new Map(
      registrosGenerales.map((r) => [r.fecha, r.estado])
    );

    const dias = [];

    for (let d = 1; d <= totalDias; d++) {
      const fecha = claveFecha(year, month, d);

      let estado:
        | "VACACIONES"
        | "DIA_LIBRE"
        | "BAJA"
        | "FESTIVO"
        | null = null;

      if (mapaEstados.has(fecha)) {
        estado = mapaEstados.get(fecha) ?? null;
      } else if (esFinDeSemana(fecha)) {
        estado = "DIA_LIBRE";
      }

      dias.push({
        fecha,
        estado,
      });
    }

    return res.json({ dias });
  } catch (error) {
    console.error("❌ Error calendario general:", error);
    return res
      .status(500)
      .json({ message: "Error calendario general" });
  }
};

/* =========================
   📚 MARCAR VARIOS DÍAS A LA VEZ
   POST /api/crm/horario/dias-masivo
   body: {
     accion: "MARCAR" | "ELIMINAR",
     fechas: string[],            // YYYY-MM-DD (máx. 62)
     empleadoId?: string | null,  // null = general (festivos...)
     estado?: ESTADO,             // o bien
     turno?: TURNO + horasManana / horasTarde
   }
   - No toca los fichajes.
   - Con estado se quitan turno y horas; con turno se quita el estado.
========================= */
export const marcarDiasMasivo = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      accion,
      fechas,
      empleadoId,
      estado,
      turno,
      horasManana,
      horasTarde,
    } = req.body ?? {};

    if (accion !== "MARCAR" && accion !== "ELIMINAR") {
      return res.status(400).json({ message: "Acción inválida" });
    }

    if (!Array.isArray(fechas) || fechas.length === 0) {
      return res.status(400).json({ message: "Selecciona al menos un día" });
    }

    const unicas: string[] = Array.from(new Set<string>(fechas));

    if (unicas.length > 62) {
      return res
        .status(400)
        .json({ message: "Máximo 62 días por operación" });
    }

    if (!unicas.every((f) => esFechaValida(f))) {
      return res.status(400).json({ message: "Hay fechas inválidas" });
    }

    if (empleadoId && !isValidObjectId(empleadoId)) {
      return res.status(400).json({ message: "Empleado inválido" });
    }

    const usuario = empleadoId ?? null;

    /* ---------- ELIMINAR MARCAS ---------- */
    if (accion === "ELIMINAR") {
      await RegistroHorario.updateMany(
        { usuario, fecha: { $in: unicas } },
        {
          $unset: {
            estado: "",
            turno: "",
            horaEntradaManana: "",
            horaSalidaManana: "",
            horaEntradaTarde: "",
            horaSalidaTarde: "",
          },
        }
      );

      // Igual que el borrado de un día: sin fichajes → se borra el registro
      const borrados = await RegistroHorario.deleteMany({
        usuario,
        fecha: { $in: unicas },
        fichajes: { $size: 0 },
      });

      return res.json({
        ok: true,
        dias: unicas.length,
        registrosBorrados: borrados.deletedCount ?? 0,
      });
    }

    /* ---------- MARCAR ---------- */
    if (!estado && !turno) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    if (estado && turno) {
      return res
        .status(400)
        .json({ message: "Indica un estado o un turno, no los dos" });
    }

    if (estado && !ESTADOS.includes(estado)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    if (turno && !TURNOS.includes(turno)) {
      return res.status(400).json({ message: "Turno inválido" });
    }

    if (!tramoValido(horasManana) || !tramoValido(horasTarde)) {
      return res
        .status(400)
        .json({ message: "Horario de turno inválido (HH:mm)" });
    }

    if (estado === "VACACIONES" && empleadoId) {
      const errorLimite = await errorLimiteVacaciones(empleadoId, unicas);
      if (errorLimite) {
        return res.status(400).json({ message: errorLimite });
      }
    }

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ""> = {};

    if (estado) {
      $set.estado = estado;
      $unset.turno = "";
      $unset.horaEntradaManana = "";
      $unset.horaSalidaManana = "";
      $unset.horaEntradaTarde = "";
      $unset.horaSalidaTarde = "";
    } else {
      $set.turno = turno;
      $unset.estado = "";

      const usaManana = turno === "MANANA" || turno === "MANANA_TARDE";
      const usaTarde = turno === "TARDE" || turno === "MANANA_TARDE";

      const poner = (campo: string, valor: unknown, usa: boolean) => {
        if (usa && typeof valor === "string" && valor !== "") {
          $set[campo] = normalizarHora(valor);
        } else {
          $unset[campo] = "";
        }
      };

      poner("horaEntradaManana", horasManana?.entrada, usaManana);
      poner("horaSalidaManana", horasManana?.salida, usaManana);
      poner("horaEntradaTarde", horasTarde?.entrada, usaTarde);
      poner("horaSalidaTarde", horasTarde?.salida, usaTarde);
    }

    await RegistroHorario.bulkWrite(
      unicas.map((fecha) => ({
        updateOne: {
          filter: { usuario, fecha },
          update: {
            $set,
            $unset,
            $setOnInsert: {
              fichajes: [],
              minutosTrabajados: 0,
              corregida: false,
              cerrada: false,
            },
          },
          upsert: true,
        },
      })) as any
    );

    return res.json({ ok: true, dias: unicas.length });
  } catch (error) {
    console.error("❌ Error marcar días en masa:", error);
    return res.status(500).json({ message: "Error marcar días" });
  }
};