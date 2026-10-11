import { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import RegistroHorario from "../../models/RegistroHorario";
import AjusteHoras from "../../models/AjusteHoras";
import User from "../../models/User";
import {
  calcularMinutosTrabajados,
  corregirFichajesErroneos,
  esFechaValida,
  esFinDeSemana,
  esMesValido,
  hoyEspana,
} from "../../utils/horario.utils";

const TIPOS = ["DESCANSO", "NOMINA", "REGULARIZACION"];
const MAX_MINUTOS_AJUSTE = 60 * 500;

/* ---------- fechas (YYYY-MM-DD, sin zona horaria) ---------- */
const aUTC = (f: string) => {
  const [y, m, d] = f.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const deUTC = (t: number) => new Date(t).toISOString().slice(0, 10);
const sumarDias = (f: string, n: number) => deUTC(aUTC(f) + n * 86400000);

/** "2026-06" → "2026-07" */
const sumarMeses = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return deUTC(Date.UTC(y, m, 1)).slice(0, 7);
};

/**
 * BOLSA DE HORAS (se arrastra de un mes al siguiente)
 *
 * Cómputo MENSUAL: el neto de un mes es
 *     horas trabajadas del mes − horas que tocaban en el mes
 * (las que tocaban = horas contratadas / 5 por cada día laborable; no cuentan
 * fines de semana ni días marcados: vacaciones, baja, festivo, libre).
 * Es el mismo balance mensual que se ve en el calendario. El primer mes cuenta
 * desde el primer fichaje del empleado.
 *
 * Solo los meses CERRADOS se arrastran. El mes en curso es provisional (aún
 * quedan días por trabajar) y no entra en el arrastre hasta que termina.
 *
 * Para el mes consultado se devuelve:
 *   apertura   = lo que traía de meses cerrados anteriores (con sus ajustes)
 *   mes        = neto del mes (provisional si es el mes en curso)
 *   ajustes    = ajustes con fecha dentro del mes
 *   cierre     = apertura + mes + ajustes
 *   confirmado = lo realmente pendiente y pagable: el cierre si el mes ya
 *                terminó; apertura + ajustes si es el mes en curso
 */
async function calcularSaldo(empleadoId: string, mesConsulta?: string) {
  const empleado: any = await User.findById(empleadoId).select(
    "horasContratadasSemana"
  );
  const horasSemana: number = empleado?.horasContratadasSemana ?? 40;
  const minutosDia = (horasSemana * 60) / 5;

  const hoy = hoyEspana();
  const mesActual = hoy.slice(0, 7);
  const mes = esMesValido(mesConsulta) ? mesConsulta : mesActual;

  const primero: any = await RegistroHorario.findOne({
    usuario: empleadoId,
    "fichajes.0": { $exists: true },
  })
    .sort({ fecha: 1 })
    .select("fecha");

  // neto de cada mes, de lo que lleva hasta el mes en curso (completo)
  const netoMes = new Map<string, number>();
  let desde: string | null = null;

  if (primero) {
    desde = primero.fecha as string;
    const [ya, ma] = mesActual.split("-").map(Number);
    const finMesActual = deUTC(Date.UTC(ya, ma, 0));

    if (desde <= finMesActual) {
      const registros = await RegistroHorario.find({
        fecha: { $gte: desde, $lte: finMesActual },
        $or: [{ usuario: empleadoId }, { usuario: null }],
      });

      const propios = new Map<string, any>();
      const globales = new Map<string, any>();
      for (const r of registros) {
        (r.usuario ? propios : globales).set(r.fecha, r);
      }

      for (let f = desde; f <= finMesActual; f = sumarDias(f, 1)) {
        const reg = propios.get(f) ?? globales.get(f) ?? null;

        const trabajado = reg?.fichajes?.length
          ? calcularMinutosTrabajados(
              corregirFichajesErroneos(reg.fichajes, reg).fichajes
            )
          : 0;

        const descuenta = !esFinDeSemana(f) && !reg?.estado;
        const m = f.slice(0, 7);
        netoMes.set(
          m,
          (netoMes.get(m) ?? 0) + trabajado - (descuenta ? minutosDia : 0)
        );
      }
    }
  }

  const todos: any[] = await AjusteHoras.find({ usuario: empleadoId })
    .sort({ fecha: -1, createdAt: -1 })
    .lean();

  const inicioMes = `${mes}-01`;
  const [anio, nMes] = mes.split("-").map(Number);
  const inicioSiguiente = deUTC(Date.UTC(anio, nMes, 1));

  // meses cerrados (anteriores al mes en curso)
  let cerradosTotal = 0;
  let apertura = 0;
  for (const [m, v] of netoMes) {
    if (m < mesActual) {
      cerradosTotal += v;
      if (m < mes) apertura += v;
    }
  }
  const mesNeto = netoMes.get(mes) ?? 0;

  let ajustesTotal = 0;
  let ajustesMes = 0;
  for (const a of todos) {
    ajustesTotal += a.minutos ?? 0;
    if (a.fecha < inicioMes) apertura += a.minutos ?? 0;
    else if (a.fecha < inicioSiguiente) ajustesMes += a.minutos ?? 0;
  }

  const r = Math.round;
  const esMesActual = mes === mesActual;
  const cierre = apertura + mesNeto + ajustesMes;
  const confirmado = esMesActual ? apertura + ajustesMes : cierre;

  return {
    // acumulado de meses cerrados + todos los ajustes
    saldoMinutos: r(cerradosTotal + ajustesTotal),
    automaticoMinutos: r(cerradosTotal),
    ajustesMinutos: r(ajustesTotal),
    desde,
    horasContratadasSemana: horasSemana,
    // detalle del mes consultado
    mes,
    esMesActual,
    esMesFuturo: mes > mesActual,
    aperturaMinutos: r(apertura),
    mesMinutos: r(mesNeto),
    ajustesMesMinutos: r(ajustesMes),
    cierreMinutos: r(cierre),
    confirmadoMinutos: r(confirmado),
    ajustes: todos.slice(0, 100).map((a) => ({
      id: String(a._id),
      fecha: a.fecha,
      tipo: a.tipo,
      minutos: a.minutos,
      comentario: a.comentario ?? "",
    })),
  };
}

/* =========================
   👤 MI SALDO (empleado)
   GET /api/horario/saldo
========================= */
export const obtenerMiSaldo = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: "No autorizado" });
    const mes = req.query.mes ? String(req.query.mes) : undefined;
    return res.json(await calcularSaldo(String(req.user.id), mes));
  } catch (error) {
    console.error("❌ Error saldo:", error);
    return res.status(500).json({ message: "Error al calcular el saldo" });
  }
};

/* =========================
   🛠️ SALDO DE UN EMPLEADO (admin)
   GET /api/crm/horario/saldo?empleadoId=ID&mes=YYYY-MM
========================= */
export const obtenerSaldoEmpleado = async (req: Request, res: Response) => {
  try {
    const empleadoId = String(req.query.empleadoId ?? "");
    if (!isValidObjectId(empleadoId)) {
      return res.status(400).json({ message: "Empleado inválido" });
    }
    const mes = req.query.mes ? String(req.query.mes) : undefined;
    return res.json(await calcularSaldo(empleadoId, mes));
  } catch (error) {
    console.error("❌ Error saldo:", error);
    return res.status(500).json({ message: "Error al calcular el saldo" });
  }
};

/* =========================
   ➕ CREAR AJUSTE (admin)
   POST /api/crm/horario/saldo/ajustes
   body: { empleadoId, tipo, minutos, fecha?, comentario? }
   - DESCANSO / NOMINA: minutos en positivo → se restan del saldo
   - REGULARIZACION: minutos con signo (+ suma, − resta), comentario obligatorio
========================= */
export const crearAjusteHoras = async (req: Request, res: Response) => {
  try {
    const { empleadoId, tipo, comentario } = req.body ?? {};
    const minutos = Number(req.body?.minutos);
    const fecha = req.body?.fecha || hoyEspana();

    if (!isValidObjectId(empleadoId)) {
      return res.status(400).json({ message: "Empleado inválido" });
    }
    if (!TIPOS.includes(tipo)) {
      return res.status(400).json({ message: "Tipo de ajuste inválido" });
    }
    if (!esFechaValida(fecha)) {
      return res.status(400).json({ message: "Fecha inválida" });
    }
    if (
      !Number.isFinite(minutos) ||
      !Number.isInteger(minutos) ||
      minutos === 0 ||
      Math.abs(minutos) > MAX_MINUTOS_AJUSTE
    ) {
      return res.status(400).json({ message: "Cantidad de horas inválida" });
    }

    const texto = typeof comentario === "string" ? comentario.trim() : "";
    if (tipo === "REGULARIZACION" && !texto) {
      return res
        .status(400)
        .json({ message: "La regularización necesita un comentario" });
    }

    const empleado = await User.findById(empleadoId).select("_id");
    if (!empleado) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    const delta = tipo === "REGULARIZACION" ? minutos : -Math.abs(minutos);

    await AjusteHoras.create({
      usuario: empleadoId,
      fecha,
      tipo,
      minutos: delta,
      comentario: texto || undefined,
      creadoPor: req.user?.id ?? null,
    });

    return res.status(201).json(await calcularSaldo(String(empleadoId)));
  } catch (error) {
    console.error("❌ Error creando ajuste:", error);
    return res.status(500).json({ message: "Error al guardar el ajuste" });
  }
};

/* =========================
   🗑️ ELIMINAR AJUSTE (admin)
   DELETE /api/crm/horario/saldo/ajustes/:id
========================= */
export const eliminarAjusteHoras = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Ajuste inválido" });
    }

    const ajuste = await AjusteHoras.findByIdAndDelete(id);
    if (!ajuste) {
      return res.status(404).json({ message: "Ajuste no encontrado" });
    }

    return res.json(await calcularSaldo(String(ajuste.usuario)));
  } catch (error) {
    console.error("❌ Error eliminando ajuste:", error);
    return res.status(500).json({ message: "Error al eliminar el ajuste" });
  }
};

/* =========================
   ✅ LIQUIDAR SALDO → VUELVE A 0 (admin)
   POST /api/crm/horario/saldo/liquidar
   body: { empleadoId, mes?, tipo, comentario? }
   Liquida lo CONFIRMADO del mes indicado: su cierre si el mes ya terminó; si
   es el mes en curso, solo lo arrastrado de meses cerrados (las horas del mes
   en curso son provisionales). El ajuste queda fechado dentro de ese mes
   (último día si ya terminó, hoy si está en curso).
   - saldo a favor del empleado: tipo NOMINA (pagadas) o DESCANSO (devueltas
     con tiempo libre)
   - saldo en contra: se da por saldado como REGULARIZACION
   Deja un ajuste con la cantidad exacta, así queda constancia y se puede
   borrar desde la lista si fue un error.
========================= */
export const liquidarSaldoHoras = async (req: Request, res: Response) => {
  try {
    const { empleadoId, tipo, comentario } = req.body ?? {};

    if (!isValidObjectId(empleadoId)) {
      return res.status(400).json({ message: "Empleado inválido" });
    }

    const mesPedido =
      typeof req.body?.mes === "string" && esMesValido(req.body.mes)
        ? req.body.mes
        : undefined;

    const actual = await calcularSaldo(String(empleadoId), mesPedido);
    if (actual.esMesFuturo) {
      return res.status(400).json({ message: "Ese mes aún no ha empezado" });
    }
    const total = actual.confirmadoMinutos;

    if (total === 0) {
      return res.status(400).json({ message: "No hay nada pendiente que liquidar" });
    }

    let tipoFinal: "DESCANSO" | "NOMINA" | "REGULARIZACION";
    if (total > 0) {
      if (tipo !== "NOMINA" && tipo !== "DESCANSO") {
        return res
          .status(400)
          .json({ message: "Indica si se pagan en nómina o se devuelven" });
      }
      tipoFinal = tipo;
    } else {
      tipoFinal = "REGULARIZACION";
    }

    const texto =
      typeof comentario === "string" && comentario.trim()
        ? comentario.trim()
        : total > 0
        ? "Bolsa liquidada"
        : "Saldo en contra dado por saldado";

    // Mes ya terminado → último día de ese mes; mes en curso → hoy
    const fechaAjuste = actual.esMesActual
      ? hoyEspana()
      : sumarDias(`${sumarMeses(actual.mes)}-01`, -1);

    await AjusteHoras.create({
      usuario: empleadoId,
      fecha: fechaAjuste,
      tipo: tipoFinal,
      minutos: -total,
      comentario: texto,
      creadoPor: req.user?.id ?? null,
    });

    return res
      .status(201)
      .json(await calcularSaldo(String(empleadoId), actual.mes));
  } catch (error) {
    console.error("❌ Error liquidando saldo:", error);
    return res.status(500).json({ message: "Error al liquidar la bolsa" });
  }
};