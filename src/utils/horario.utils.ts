/**
 * Utilidades de fecha y hora del módulo de horarios (zona horaria de España).
 *
 * REGLAS:
 *  1. "Ahora" y "hoy" SIEMPRE en Europe/Madrid, nunca con la zona del servidor
 *     (un servidor en UTC guardaría fichajes con 1-2 h de diferencia y, entre
 *     las 00:00 y las 02:00, en el día anterior).
 *  2. Las fechas "YYYY-MM-DD" nunca se pasan a new Date("YYYY-MM-DD")
 *     (se interpreta como UTC). Se usa Date.UTC + getUTC*().
 *  3. Las horas de fichaje son texto "HH:mm" (reloj de pared de España).
 *  4. El cálculo de minutos trabajados existe UNA sola vez, aquí.
 *
 * Ubicación: src/utils/horario.utils.ts
 */

export const ZONA_ES = "Europe/Madrid";

const formatoEspana = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_ES,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
} as Intl.DateTimeFormatOptions);

/** Fecha y hora actuales de España: { fecha: "YYYY-MM-DD", hora: "HH:mm" } */
export function ahoraEspana(instante: Date = new Date()): {
  fecha: string;
  hora: string;
} {
  const partes = formatoEspana.formatToParts(instante);
  const valor = (tipo: string) =>
    partes.find((p) => p.type === tipo)?.value ?? "";

  // Algunos motores devuelven "24" a medianoche
  const hh = valor("hour") === "24" ? "00" : valor("hour");

  return {
    fecha: `${valor("year")}-${valor("month")}-${valor("day")}`,
    hora: `${hh}:${valor("minute")}`,
  };
}

/** "YYYY-MM-DD" de hoy en España */
export const hoyEspana = (): string => ahoraEspana().fecha;

/** "YYYY-MM" del mes actual en España */
export const mesActualEspana = (): string => hoyEspana().slice(0, 7);

/* =========================
   VALIDACIONES
========================= */

export function esFechaValida(valor: unknown): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return false;
  }

  const [y, m, d] = valor.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));

  return (
    f.getUTCFullYear() === y &&
    f.getUTCMonth() === m - 1 &&
    f.getUTCDate() === d
  );
}

export function esMesValido(valor: unknown): valor is string {
  return typeof valor === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor);
}

/** Acepta "9:05" y "09:05" al LEER; al escribir se normaliza a "HH:mm". */
export function esHoraValida(valor: unknown): valor is string {
  return (
    typeof valor === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(valor)
  );
}

export function normalizarHora(hora: string): string {
  const [h, m] = hora.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

/**
 * Hora a mostrar en pantalla. Si el valor es una hora "HH:mm" se devuelve
 * normalizada; si es una fecha antigua (Date/ISO) se convierte a hora de
 * España; si no es válido devuelve "".
 */
export function horaParaMostrar(valor: unknown): string {
  if (esHoraValida(valor)) return normalizarHora(valor);

  if (valor instanceof Date || typeof valor === "string") {
    const fecha = new Date(valor);
    if (!Number.isNaN(fecha.getTime())) return ahoraEspana(fecha).hora;
  }

  return "";
}

/* =========================
   CALENDARIO
========================= */

/** 0 = domingo ... 6 = sábado (sin depender de la zona del servidor) */
export function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function esFinDeSemana(fecha: string): boolean {
  const dia = diaSemana(fecha);
  return dia === 0 || dia === 6;
}

/** "sábado" */
export function nombreDiaSemana(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-ES", {
    weekday: "long",
    timeZone: "UTC",
  });
}

export function ultimoDiaDelMes(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Rango de un mes "YYYY-MM": primer día, último día y nº de días. */
export function rangoDelMes(mes: string): {
  year: number;
  month: number;
  totalDias: number;
  desde: string;
  hasta: string;
} {
  const [year, month] = mes.split("-").map(Number);
  const totalDias = ultimoDiaDelMes(year, month);
  const mm = String(month).padStart(2, "0");

  return {
    year,
    month,
    totalDias,
    desde: `${year}-${mm}-01`,
    hasta: `${year}-${mm}-${String(totalDias).padStart(2, "0")}`,
  };
}

export function claveFecha(year: number, month: number, dia: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(dia).padStart(
    2,
    "0"
  )}`;
}

/* =========================
   MINUTOS
========================= */

export function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

export function minutosATexto(min: number): string {
  const total = Math.max(0, Math.round(Number(min) || 0));
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, "0")} min`;
}

/**
 * ÚNICO cálculo de minutos trabajados de un día.
 * - Ignora fichajes inactivos, con hora inválida o "00:00".
 * - Ordena por hora y empareja ENTRADA → SALIDA mirando el tipo.
 * - Una SALIDA sin entrada previa, o una ENTRADA repetida, se ignoran.
 * - Una ENTRADA sin SALIDA no suma (jornada abierta).
 */
export function calcularMinutosTrabajados(fichajes: any[]): number {
  // Si hay fichajes erróneos por el ajuste al horario, se cuentan ya corregidos
  const validos = corregirFichajesErroneos(fichajes ?? [])
    .fichajes.filter(
      (f: any) =>
        f &&
        f.activo !== false &&
        esHoraValida(f.hora) &&
        normalizarHora(f.hora) !== "00:00"
    )
    .map((f: any) => ({
      tipo: f.tipo as string,
      minutos: horaAMinutos(f.hora),
    }))
    .sort((a, b) => a.minutos - b.minutos);

  let total = 0;
  let entrada: number | null = null;

  for (const f of validos) {
    if (f.tipo === "ENTRADA") {
      if (entrada === null) entrada = f.minutos;
    } else if (f.tipo === "SALIDA" && entrada !== null) {
      total += f.minutos - entrada;
      entrada = null;
    }
  }

  return Math.max(0, Math.round(total));
}


/* =========================
   AJUSTE DEL FICHAJE AL HORARIO ASIGNADO
========================= */

/** Margen de salida: hasta estos minutos de retraso se registra la hora del horario. */
export const TOLERANCIA_SALIDA_MIN = 17;

/** Cortesía de entrada: hasta estos minutos después del inicio del turno se registra la hora del turno. */
export const TOLERANCIA_ENTRADA_MIN = 5;

type HorarioAsignado = {
  turno?: string | null;
  horaEntradaManana?: string | null;
  horaSalidaManana?: string | null;
  horaEntradaTarde?: string | null;
  horaSalidaTarde?: string | null;
};

/**
 * Aplica las reglas del horario asignado a la hora real del fichaje:
 *  - ENTRADA antes de la hora del turno, o hasta TOLERANCIA_ENTRADA_MIN
 *    minutos después → se registra la hora del turno (no se cuenta tiempo
 *    anterior). Con más retraso o sin horario → hora real.
 *  - SALIDA hasta TOLERANCIA_SALIDA_MIN minutos después del fin del turno →
 *    se registra la hora de fin del turno. Más tarde → hora real.
 *    Salir antes de tiempo → hora real.
 * Con turno mañana+tarde elige el tramo más cercano. Sin horas definidas
 * no cambia nada.
 */
export function ajustarAHorario(
  tipo: "ENTRADA" | "SALIDA",
  horaReal: string,
  horario: HorarioAsignado | null | undefined
): { hora: string; ajustado: boolean } {
  const sinCambio = { hora: horaReal, ajustado: false };
  if (!horario || !esHoraValida(horaReal)) return sinCambio;

  const tramos: { entrada: number; salida: number; e: string; s: string }[] =
    [];

  const anadir = (e?: string | null, s?: string | null) => {
    if (esHoraValida(e) && esHoraValida(s)) {
      const en = horaAMinutos(e);
      const sa = horaAMinutos(s);
      if (sa > en) {
        tramos.push({
          entrada: en,
          salida: sa,
          e: normalizarHora(e),
          s: normalizarHora(s),
        });
      }
    }
  };

  // Solo los tramos que corresponden al turno asignado (evita horas viejas)
  if (horario.turno !== "TARDE") {
    anadir(horario.horaEntradaManana, horario.horaSalidaManana);
  }
  if (horario.turno !== "MANANA") {
    anadir(horario.horaEntradaTarde, horario.horaSalidaTarde);
  }

  if (tramos.length === 0) return sinCambio;

  const ahora = horaAMinutos(horaReal);

  if (tipo === "ENTRADA") {
    // Cortesía: hasta TOLERANCIA_ENTRADA_MIN minutos después del inicio de un
    // turno se registra la hora del turno
    const cortesia = tramos
      .filter(
        (t) =>
          ahora >= t.entrada &&
          ahora <= t.entrada + TOLERANCIA_ENTRADA_MIN &&
          ahora < t.salida
      )
      .sort((a, b) => b.entrada - a.entrada);

    if (cortesia.length > 0) {
      return { hora: cortesia[0].e, ajustado: ahora !== cortesia[0].entrada };
    }

    // Llega con el turno ya empezado (y pasada la cortesía) → su hora real.
    // Sin esto, una entrada tarde por la mañana saltaba al turno de la tarde.
    if (tramos.some((t) => ahora > t.entrada && ahora < t.salida)) {
      return sinCambio;
    }

    // Próximo inicio de turno que aún no ha empezado
    const proximos = tramos
      .filter((t) => ahora < t.entrada)
      .sort((a, b) => a.entrada - b.entrada);

    return proximos.length > 0
      ? { hora: proximos[0].e, ajustado: true }
      : sinCambio;
  }

  // SALIDA: fin de turno más reciente que ya ha pasado
  const pasados = tramos
    .filter((t) => t.salida <= ahora)
    .sort((a, b) => b.salida - a.salida);

  if (pasados.length > 0 && ahora - pasados[0].salida <= TOLERANCIA_SALIDA_MIN) {
    const ajustada = ahora !== pasados[0].salida;
    return { hora: pasados[0].s, ajustado: ajustada };
  }

  return sinCambio;
}


/* =========================
   CORRECCIÓN DE FICHAJES ERRÓNEOS
========================= */

export type CambioFichaje = {
  indice: number;
  tipo: string;
  de: string;
  a: string;
};

/**
 * Corrige el error que producía el ajuste al horario: una ENTRADA se subía al
 * inicio de un turno POSTERIOR a la hora real en que el empleado salió (p. ej.
 * entrada real 08:55 guardada como 17:00 porque el horario del día no incluía
 * la mañana) y la SALIDA siguiente quedaba clavada a esa hora (14:02 → 17:00).
 *
 * Señal: una SALIDA ajustada cuya hora quedó DESPUÉS de su hora real, justo
 * detrás de una ENTRADA ajustada.
 *
 * Corrección (mismas reglas de siempre, sobre las horas reales guardadas):
 *  - ENTRADA: si llegó antes del turno se marca la hora del turno, salvo que
 *    esa hora sea posterior a la salida real; entonces, su hora real.
 *  - SALIDA: la regla de salida de siempre sobre su hora real, sin quedar
 *    antes que la entrada.
 * Sin `horario` se usan las horas reales.
 *
 * No modifica lo que recibe: devuelve una copia y la lista de cambios.
 */
export function corregirFichajesErroneos(
  fichajes: any[],
  horario?: HorarioAsignado | null
): { fichajes: any[]; cambios: CambioFichaje[] } {
  const lista: any[] = (fichajes ?? []).map((f: any) =>
    f && typeof f.toObject === "function" ? { ...f.toObject() } : { ...f }
  );
  const cambios: CambioFichaje[] = [];

  let entradaIdx = -1;

  lista.forEach((f, i) => {
    if (!f || f.activo === false) return;

    if (f.tipo === "ENTRADA") {
      entradaIdx = i;
      return;
    }
    if (f.tipo !== "SALIDA") return;

    const e = entradaIdx >= 0 ? lista[entradaIdx] : null;
    const idxE = entradaIdx;
    entradaIdx = -1;

    if (
      !e ||
      !e.ajustado ||
      !f.ajustado ||
      !esHoraValida(e.hora) ||
      !esHoraValida(e.horaReal) ||
      !esHoraValida(f.hora) ||
      !esHoraValida(f.horaReal)
    ) {
      return;
    }

    // La salida solo está mal si quedó más tarde que la real...
    if (horaAMinutos(f.hora) <= horaAMinutos(f.horaReal)) return;
    // ...y los datos reales deben tener sentido (entrada real antes de la salida real)
    if (horaAMinutos(e.horaReal) > horaAMinutos(f.horaReal)) return;

    const porHorarioE = horario
      ? ajustarAHorario("ENTRADA", e.horaReal, horario).hora
      : e.horaReal;
    const entradaOk = normalizarHora(
      horaAMinutos(porHorarioE) <= horaAMinutos(f.horaReal)
        ? porHorarioE
        : e.horaReal
    );

    const porHorarioS = horario
      ? ajustarAHorario("SALIDA", f.horaReal, horario).hora
      : f.horaReal;
    let salidaOk = normalizarHora(porHorarioS);
    if (horaAMinutos(salidaOk) < horaAMinutos(entradaOk)) {
      salidaOk = normalizarHora(f.horaReal);
    }

    if (normalizarHora(e.hora) !== entradaOk) {
      cambios.push({ indice: idxE, tipo: "ENTRADA", de: e.hora, a: entradaOk });
      e.hora = entradaOk;
      e.ajustado = entradaOk !== normalizarHora(e.horaReal);
    }
    if (normalizarHora(f.hora) !== salidaOk) {
      cambios.push({ indice: i, tipo: "SALIDA", de: f.hora, a: salidaOk });
      f.hora = salidaOk;
      f.ajustado = salidaOk !== normalizarHora(f.horaReal);
    }
  });

  return { fichajes: lista, cambios };
}


/* =========================
   HORAS QUE DEBERÍA TRABAJAR UN DÍA (según horario aplicado)
========================= */

/**
 * Minutos objetivo de un día:
 *  - Con estado (vacaciones, libre, festivo, baja) → 0.
 *  - Con turno → suma de sus tramos con horas; si no tienen horas,
 *    mañana/tarde = 4 h y mañana+tarde = 8 h.
 *  - Sin turno → laborable: horas contratadas / 5; fin de semana: 0.
 */
export function minutosObjetivoDia(
  registro: (HorarioAsignado & { estado?: string | null }) | null | undefined,
  estadoGlobal: string | null | undefined,
  horasContratadasSemana: number,
  finDeSemana: boolean
): number {
  const estado = registro?.estado ?? estadoGlobal ?? null;
  if (estado) return 0;

  const turno = registro?.turno ?? null;

  if (turno && registro) {
    const tramo = (e?: string | null, s?: string | null) =>
      esHoraValida(e) && esHoraValida(s) && horaAMinutos(s) > horaAMinutos(e)
        ? horaAMinutos(s) - horaAMinutos(e)
        : null;

    const manana = tramo(registro.horaEntradaManana, registro.horaSalidaManana);
    const tarde = tramo(registro.horaEntradaTarde, registro.horaSalidaTarde);

    const m = turno !== "TARDE" ? manana ?? 240 : 0;
    const t = turno !== "MANANA" ? tarde ?? 240 : 0;
    return m + t;
  }

  if (finDeSemana) return 0;
  return Math.round(((Number(horasContratadasSemana) || 0) * 60) / 5);
}


/**
 * Tramos de trabajo del turno asignado ("HH:mm"), respetando el turno
 * (mañana / tarde / ambos). Vacío si no hay turno u horas definidas.
 */
export function tramosDelTurno(
  horario: HorarioAsignado | null | undefined
): { entrada: string; salida: string }[] {
  if (!horario || !horario.turno) return [];

  const tramos: { entrada: string; salida: string }[] = [];

  const anadir = (e?: string | null, s?: string | null) => {
    if (esHoraValida(e) && esHoraValida(s) && horaAMinutos(s) > horaAMinutos(e)) {
      tramos.push({ entrada: normalizarHora(e), salida: normalizarHora(s) });
    }
  };

  if (horario.turno !== "TARDE") {
    anadir(horario.horaEntradaManana, horario.horaSalidaManana);
  }
  if (horario.turno !== "MANANA") {
    anadir(horario.horaEntradaTarde, horario.horaSalidaTarde);
  }

  return tramos;
}