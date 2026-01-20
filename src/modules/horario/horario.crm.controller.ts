import { Request, Response } from "express";
import RegistroHorario from "../../models/RegistroHorario";
import User from "../../models/User";


/* =========================
   HELPERS
========================= */
const calcularMinutos = (fichajes: any[]) => {
  const activos = fichajes
    .filter((f) => f.activo !== false)
    .sort(
      (a, b) =>
        new Date(a.hora).getTime() -
        new Date(b.hora).getTime()
    );

  let total = 0;

  for (let i = 0; i < activos.length; i += 2) {
    const entrada = activos[i];
    const salida = activos[i + 1];
    if (!salida) break;

    total +=
      (new Date(salida.hora).getTime() -
        new Date(entrada.hora).getTime()) /
      60000;
  }

  return Math.round(total);
};

const esFinDeSemana = (fecha: string) => {
  const d = new Date(fecha);
  const day = d.getDay(); // 0 = domingo, 6 = sábado
  return day === 0 || day === 6;
};


/* =========================
   👥 OBTENER EMPLEADOS
   GET /api/horario/crm/empleados
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
   GET /api/horario/crm?mes&empleadoId?
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

    const [y, m] = mes.split("-").map(Number);
    const desde = `${y}-${String(m).padStart(2, "0")}-01`;
    const hasta = `${y}-${String(m).padStart(2, "0")}-31`;

    const filtro: any = {
      fecha: { $gte: desde, $lte: hasta },
    };

    if (empleadoId) {
  filtro.$or = [
    { usuario: empleadoId },
    { usuario: null },
    { usuario: { $exists: false } }, // ✅ CLAVE
  ];
}



    const registros = await RegistroHorario.find(filtro);
    const mapaRegistros = new Map(
  registros.map((r) => [r.fecha, r])
);


    let horasTrabajadas = 0;
    for (const r of registros) {
  if (typeof r.minutosTrabajados === "number") {
    horasTrabajadas += r.minutosTrabajados;
  }
}


   const dias: {
  fecha: string;
  minutosTrabajados: number;
  estado: "VACACIONES" | "DIA_LIBRE" | "BAJA" | "FESTIVO" | null;
  turno: "MANANA" | "TARDE" | "MANANA_TARDE" | null;
  esFinDeSemana: boolean;
  horaEntradaManana: string | null;
  horaSalidaManana: string | null;
  horaEntradaTarde: string | null;
  horaSalidaTarde: string | null;
}[] = [];




const totalDiasMes = new Date(y, m, 0).getDate();
const minutosDia = (horasContratadasSemana * 60) / 5;
let minutosTeoricosMes = 0;


for (let d = 1; d <= totalDiasMes; d++) {
  const fecha = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const registro = mapaRegistros.get(fecha);

let estado: "VACACIONES" | "DIA_LIBRE" | "BAJA" | "FESTIVO" | null = null;
  let minutosTrabajados = 0;

 const filtro: any = {
  fecha: { $gte: desde, $lte: hasta },
};


 let descuenta = true;

if (esFinDeSemana(fecha)) descuenta = false;
if (registro?.estado === "VACACIONES") descuenta = false;
if (registro?.estado === "BAJA") descuenta = false;
if (registro?.estado === "FESTIVO") descuenta = false;
if (registro?.estado === "DIA_LIBRE") descuenta = false;

if (descuenta) {
  minutosTeoricosMes += minutosDia;
}



// ⏱️ Calcular minutos trabajados reales desde fichajes


if (registro?.fichajes?.length) {
  const fichajesActivos = registro.fichajes
    .filter((f: any) => f.activo)
    .sort(
      (a: any, b: any) =>
        new Date(a.hora).getTime() - new Date(b.hora).getTime()
    );

  for (let i = 0; i < fichajesActivos.length; i += 2) {
    const entrada = fichajesActivos[i];
    const salida = fichajesActivos[i + 1];

    if (entrada && salida) {
      const diff =
        (new Date(salida.hora).getTime() -
          new Date(entrada.hora).getTime()) /
        60000;

      if (diff > 0) minutosTrabajados += diff;
    }
  }
}

// 📅 Día final enviado al CRM
dias.push({
  fecha,
  minutosTrabajados: Math.round(minutosTrabajados),
  estado: registro?.estado ?? null,
  turno: registro?.turno ?? null,
  esFinDeSemana: esFinDeSemana(fecha),
  horaEntradaManana: registro?.horaEntradaManana ?? null,
  horaSalidaManana: registro?.horaSalidaManana ?? null,
  horaEntradaTarde: registro?.horaEntradaTarde ?? null,
  horaSalidaTarde: registro?.horaSalidaTarde ?? null,
});




}

const balanceMinutos = horasTrabajadas - minutosTeoricosMes;

    return res.json({
      dias,
      horasTrabajadas,
      balanceMinutos,
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
   PUT /api/horario/crm/:registroId/fichaje/:fichajeId
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

    const registro = await RegistroHorario.findById(
      registroId
    );

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

    fichaje.hora = new Date(hora);

    registro.minutosTrabajados = calcularMinutos(
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
   DELETE /api/horario/crm/:registroId/fichaje/:fichajeId
========================= */
export const eliminarFichaje = async (
  req: Request,
  res: Response
) => {
  try {
    const { registroId, fichajeId } = req.params;

    const registro = await RegistroHorario.findById(
      registroId
    );

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

    registro.minutosTrabajados = calcularMinutos(
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
   POST /api/horario/crm/dia
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


    const filtro: any = { fecha };
    if (empleadoId) {
      filtro.usuario = empleadoId;
    }

    let registro = await RegistroHorario.findOne(
      filtro
    );

    if (!registro) {
     registro = await RegistroHorario.create({
  fecha,
  usuario: empleadoId ?? null, // ✅ CLAVE
  estado: estado ?? undefined,
  turno: turno ?? undefined,
  minutosTrabajados: 0,
  fichajes: [],
});


if (horasManana) {
  registro.horaEntradaManana = horasManana.entrada;
  registro.horaSalidaManana = horasManana.salida;
}

if (horasTarde) {
  registro.horaEntradaTarde = horasTarde.entrada;
  registro.horaSalidaTarde = horasTarde.salida;
}

await registro.save();


    } else {
      if (estado !== null && estado !== undefined) {
  registro.estado = estado;
}

if (turno !== null && turno !== undefined) {
  registro.turno = turno;
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


    }

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
   DELETE /api/horario/crm/dia
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

const filtro: any = { fecha };
filtro.usuario = empleadoId ?? null;


    const registro = await RegistroHorario.findOne(
      filtro
    );

    if (!registro) {
  return res.json({ ok: true });
}

// 🔹 Limpiar estado y turno
registro.estado = undefined;
registro.turno = undefined;

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
   GET /api/horario/crm/calendario-general
========================= */
console.log("CRM CONTROLLER CARGADO");
export const obtenerCalendarioGeneral = async (
  req: Request,
  res: Response
) => {
  try {
    console.log("🔥🔥🔥 CALENDARIO GENERAL EJECUTADO 🔥🔥🔥");
    const { mes } = req.query as { mes: string };

    if (!mes) {
      return res.status(400).json({ message: "Mes requerido" });
    }

    const [y, m] = mes.split("-").map(Number);
    const totalDias = new Date(y, m, 0).getDate();

    // 🔹 Vacaciones de CUALQUIER empleado
   const registrosVacaciones = await RegistroHorario.find({
  fecha: {
    $gte: `${y}-${String(m).padStart(2, "0")}-01`,
    $lte: `${y}-${String(m).padStart(2, "0")}-${totalDias}`,
  },
  estado: "VACACIONES",
  usuario: null, // 🔴 ESTA LÍNEA ES LA CLAVE
}).select("fecha");

const registrosGenerales = await RegistroHorario.find({
  fecha: {
    $gte: `${y}-${String(m).padStart(2, "0")}-01`,
    $lte: `${y}-${String(m).padStart(2, "0")}-${totalDias}`,
  },
  estado: { $in: ["FESTIVO", "DIA_LIBRE", "BAJA", "VACACIONES"] },
  $or: [
    { usuario: null },
    { usuario: { $exists: false } }, // ✅ CLAVE
  ],
}).select("fecha estado");





    const diasVacaciones = new Set(
  registrosVacaciones.map((r) => r.fecha)
);

const mapaEstados = new Map(
  registrosGenerales.map((r) => [r.fecha, r.estado])
);



    const dias = [];

    for (let d = 1; d <= totalDias; d++) {
      const fecha = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(
        2,
        "0"
      )}`;

     let estado: "VACACIONES" | "DIA_LIBRE" | "BAJA" | "FESTIVO" | null = null;

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
