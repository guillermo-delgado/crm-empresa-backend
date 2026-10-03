import { Request, Response } from "express";
import mongoose from "mongoose";
import { createHash, randomInt } from "node:crypto";

import Sorteo from "./sorteos.model";
import Venta from "../../models/Venta";

/* =====================================================
   UTILIDADES
===================================================== */

const obtenerUsuarioId = (req: Request): string | null => {
  const usuario = (req as any).user;

  return (
    usuario?.id ||
    usuario?._id ||
    usuario?.userId ||
    null
  );
};

const normalizarTexto = (valor: unknown): string =>
  String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const esMapfre = (aseguradora: unknown): boolean => {
  const nombre = normalizarTexto(aseguradora);
  return nombre.includes("mapfre");
};

const inicioDelDia = (fecha: Date): Date => {
  const resultado = new Date(fecha);
  resultado.setHours(0, 0, 0, 0);
  return resultado;
};

const finDelDia = (fecha: Date): Date => {
  const resultado = new Date(fecha);
  resultado.setHours(23, 59, 59, 999);
  return resultado;
};

const buscarRamoConfigurado = (
  ramos: any[],
  ramoVenta: string
) => {
  const nombre = normalizarTexto(ramoVenta);

  return ramos.find(
    (ramo) =>
      ramo.activo &&
      normalizarTexto(ramo.nombre) === nombre
  );
};

const validarFechas = (
  fechaInicio: unknown,
  fechaFin: unknown
): { inicio: Date; fin: Date } | null => {
  const inicio = new Date(String(fechaInicio));
  const fin = new Date(String(fechaFin));

  if (
    Number.isNaN(inicio.getTime()) ||
    Number.isNaN(fin.getTime())
  ) {
    return null;
  }

  if (inicio > fin) {
    return null;
  }

  return {
    inicio: inicioDelDia(inicio),
    fin: finDelDia(fin),
  };
};

/* Participación extra: 1 por cada 1.000 € de prima neta (importes completos). */
const EUROS_POR_PARTICIPACION_EXTRA = 1000;

const calcularParticipacionesExtra = (prima: unknown): number => {
  const importe = Number(prima);
  return Number.isFinite(importe) && importe > 0
    ? Math.floor(importe / EUROS_POR_PARTICIPACION_EXTRA)
    : 0;
};

const serializarParticipante = (
  venta: any,
  participaciones: number,
  origen: "IMPORTACION" | "MANUAL"
) => {
  const extra = calcularParticipacionesExtra(venta.primaNeta);

  return {
    ventaId: venta._id,
    numeroPoliza: String(venta.numeroPoliza).trim(),
    tomador: venta.tomador,
    aseguradora: venta.aseguradora,
    ramo: venta.ramo,
    fechaEfecto: venta.fechaEfecto,
    fechaRegistro: venta.createdAt,
    primaNeta: Number(venta.primaNeta) || 0,
    participacionesBase: participaciones,
    participacionesExtra: extra,
    participaciones: participaciones + extra,
    origen,
    agregadoEn: new Date(),
  };
};

/* =====================================================
   CREAR SORTEO
===================================================== */

export const crearSorteo = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = obtenerUsuarioId(req);

    if (!usuarioId || !mongoose.Types.ObjectId.isValid(usuarioId)) {
      return res.status(401).json({
        message: "Usuario no autenticado.",
      });
    }

    const {
      nombre,
      descripcion = "",
      fechaInicio,
      fechaFin,
      criterioFecha = "EFECTO",
      ramos = [],
    } = req.body;

    if (!nombre?.trim()) {
      return res.status(400).json({
        message: "El nombre del sorteo es obligatorio.",
      });
    }

    const fechas = validarFechas(fechaInicio, fechaFin);

    if (!fechas) {
      return res.status(400).json({
        message: "Las fechas no son válidas o el intervalo es incorrecto.",
      });
    }

    if (!["REGISTRO", "EFECTO"].includes(criterioFecha)) {
      return res.status(400).json({
        message: "El criterio de fecha no es válido.",
      });
    }

    if (!Array.isArray(ramos)) {
      return res.status(400).json({
        message: "La configuración de ramos debe ser una lista.",
      });
    }

    const ramosNormalizados = ramos.map((ramo: any) => ({
      nombre: String(ramo.nombre ?? "").trim(),
      participaciones: Number(ramo.participaciones),
      activo: ramo.activo !== false,
    }));

    const ramosInvalidos = ramosNormalizados.some(
      (ramo: any) =>
        !ramo.nombre ||
        !Number.isInteger(ramo.participaciones) ||
        ramo.participaciones < 1
    );

    if (ramosInvalidos) {
      return res.status(400).json({
        message: "Cada ramo debe tener un nombre y al menos una participación.",
      });
    }

    const sorteo = await Sorteo.create({
      nombre: nombre.trim(),
      descripcion,
      fechaInicio: fechas.inicio,
      fechaFin: fechas.fin,
      criterioFecha,
      ramos: ramosNormalizados,
      participantes: [],
      ganadores: [],
      estado: "CONFIGURACION",
      creadoPor: usuarioId,
    });

    return res.status(201).json(sorteo);
  } catch (error) {
    console.error("Error al crear sorteo:", error);

    return res.status(500).json({
      message: "No se pudo crear el sorteo.",
    });
  }
};

/* =====================================================
   LISTAR SORTEOS
===================================================== */

export const listarSorteos = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = obtenerUsuarioId(req);

    if (!usuarioId) {
      return res.status(401).json({
        message: "Usuario no autenticado.",
      });
    }

    // Lectura abierta a cualquier usuario autenticado (los empleados ven los sorteos en modo lectura).
    const sorteos = await Sorteo.find({}).sort({ createdAt: -1 });

    return res.json(sorteos);
  } catch (error) {
    console.error("Error al listar sorteos:", error);

    return res.status(500).json({
      message: "No se pudieron obtener los sorteos.",
    });
  }
};

/* =====================================================
   OBTENER SORTEO POR ID
===================================================== */

export const obtenerSorteo = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    const { id } = req.params;

    if (!usuarioId) {
      return res.status(401).json({
        message: "Usuario no autenticado.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "El identificador del sorteo no es válido.",
      });
    }

    // Lectura abierta a cualquier usuario autenticado.
    const sorteo = await Sorteo.findOne({ _id: id });

    if (!sorteo) {
      return res.status(404).json({
        message: "No se encontró el sorteo.",
      });
    }

    return res.json(sorteo);
  } catch (error) {
    console.error("Error al obtener sorteo:", error);

    return res.status(500).json({
      message: "No se pudo obtener el sorteo.",
    });
  }
};

/* =====================================================
   ACTUALIZAR CONFIGURACIÓN
===================================================== */

export const actualizarSorteo = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    const { id } = req.params;

    if (!usuarioId) {
      return res.status(401).json({
        message: "Usuario no autenticado.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "El identificador del sorteo no es válido.",
      });
    }

    const sorteo = await Sorteo.findOne({
      _id: id,
      creadoPor: usuarioId,
    });

    if (!sorteo) {
      return res.status(404).json({
        message: "No se encontró el sorteo.",
      });
    }

    if (sorteo.estado === "REALIZADO") {
      return res.status(400).json({
        message: "No se puede modificar un sorteo ya realizado.",
      });
    }

    const {
      nombre,
      descripcion,
      fechaInicio,
      fechaFin,
      criterioFecha,
      ramos,
    } = req.body;

    if (nombre !== undefined) {
      if (!String(nombre).trim()) {
        return res.status(400).json({
          message: "El nombre no puede estar vacío.",
        });
      }

      sorteo.nombre = String(nombre).trim();
    }

    if (descripcion !== undefined) {
      sorteo.descripcion = String(descripcion);
    }

    if (fechaInicio !== undefined || fechaFin !== undefined) {
      const inicio = fechaInicio ?? sorteo.fechaInicio;
      const fin = fechaFin ?? sorteo.fechaFin;
      const fechas = validarFechas(inicio, fin);

      if (!fechas) {
        return res.status(400).json({
          message: "El intervalo de fechas no es válido.",
        });
      }

      sorteo.fechaInicio = fechas.inicio;
      sorteo.fechaFin = fechas.fin;
    }

    if (criterioFecha !== undefined) {
      if (!["REGISTRO", "EFECTO"].includes(criterioFecha)) {
        return res.status(400).json({
          message: "El criterio de fecha no es válido.",
        });
      }

      sorteo.criterioFecha = criterioFecha;
    }

    if (ramos !== undefined) {
      if (!Array.isArray(ramos)) {
        return res.status(400).json({
          message: "La configuración de ramos debe ser una lista.",
        });
      }

      const normalizados = ramos.map((ramo: any) => ({
        nombre: String(ramo.nombre ?? "").trim(),
        participaciones: Number(ramo.participaciones),
        activo: ramo.activo !== false,
      }));

      const invalidos = normalizados.some(
        (ramo: any) =>
          !ramo.nombre ||
          !Number.isInteger(ramo.participaciones) ||
          ramo.participaciones < 1
      );

      if (invalidos) {
        return res.status(400).json({
          message: "Hay ramos con una configuración incorrecta.",
        });
      }

      sorteo.ramos = normalizados as any;
    }

    await sorteo.save();

    return res.json(sorteo);
  } catch (error) {
    console.error("Error al actualizar sorteo:", error);

    return res.status(500).json({
      message: "No se pudo actualizar el sorteo.",
    });
  }
};

/* =====================================================
   IMPORTAR PÓLIZAS POR FECHAS
===================================================== */

export const importarParticipantes = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    const { id } = req.params;

    if (!usuarioId) {
      return res.status(401).json({
        message: "Usuario no autenticado.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "El identificador del sorteo no es válido.",
      });
    }

    const sorteo = await Sorteo.findOne({
      _id: id,
      creadoPor: usuarioId,
    });

    if (!sorteo) {
      return res.status(404).json({
        message: "No se encontró el sorteo.",
      });
    }

    if (sorteo.estado === "REALIZADO") {
      return res.status(400).json({
        message: "No se pueden importar pólizas en un sorteo realizado.",
      });
    }

    const fechas = validarFechas(
      req.body.fechaInicio ?? sorteo.fechaInicio,
      req.body.fechaFin ?? sorteo.fechaFin
    );

    if (!fechas) {
      return res.status(400).json({
        message: "El intervalo de fechas no es válido.",
      });
    }

    const criterio = req.body.criterioFecha ?? sorteo.criterioFecha;

    if (!["REGISTRO", "EFECTO"].includes(criterio)) {
      return res.status(400).json({
        message: "El criterio de fecha no es válido.",
      });
    }

    const campoFecha =
      criterio === "REGISTRO" ? "createdAt" : "fechaEfecto";

    const filtro: any = {
      estado: "ACTIVA",
      derivadoVerti: { $ne: true },
      [campoFecha]: {
        $gte: fechas.inicio,
        $lte: fechas.fin,
      },
    };

    const ventas = await Venta.find(filtro).lean();

    const existentes = new Set(
      sorteo.participantes.map((p: any) =>
        String(p.numeroPoliza).trim()
      )
    );

    let importadas = 0;
    let duplicadas = 0;
    let excluidas = 0;

    for (const venta of ventas as any[]) {
      if (!esMapfre(venta.aseguradora)) {
        excluidas++;
        continue;
      }

      const numeroPoliza = String(venta.numeroPoliza ?? "").trim();

      if (!numeroPoliza || existentes.has(numeroPoliza)) {
        duplicadas++;
        continue;
      }

      const ramo = buscarRamoConfigurado(
        sorteo.ramos as any[],
        venta.ramo
      );

      if (!ramo) {
        excluidas++;
        continue;
      }

      sorteo.participantes.push(
        serializarParticipante(
          venta,
          ramo.participaciones,
          "IMPORTACION"
        ) as any
      );

      existentes.add(numeroPoliza);
      importadas++;
    }

    if (sorteo.estado === "CONFIGURACION") {
      sorteo.estado = "ABIERTO";
    }

    await sorteo.save();

    return res.json({
      message: "Importación completada.",
      importadas,
      duplicadas,
      excluidas,
      totalParticipantes: sorteo.participantes.length,
      sorteo,
    });
  } catch (error) {
    console.error("Error al importar participantes:", error);

    return res.status(500).json({
      message: "No se pudieron importar las pólizas.",
    });
  }
};

/* =====================================================
   BÚSQUEDA MANUAL POR NÚMERO DE PÓLIZA
===================================================== */

export const agregarParticipanteManual = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    const { id } = req.params;
    const numeroPoliza = String(
      req.body.numeroPoliza ?? ""
    ).trim();

    if (!usuarioId) {
      return res.status(401).json({
        message: "Usuario no autenticado.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "El identificador del sorteo no es válido.",
      });
    }

    if (!numeroPoliza) {
      return res.status(400).json({
        message: "Debes indicar el número de póliza.",
      });
    }

    const sorteo = await Sorteo.findOne({
      _id: id,
      creadoPor: usuarioId,
    });

    if (!sorteo) {
      return res.status(404).json({
        message: "No se encontró el sorteo.",
      });
    }

    if (sorteo.estado === "REALIZADO") {
      return res.status(400).json({
        message: "No se pueden añadir pólizas a un sorteo realizado.",
      });
    }

    const duplicada = sorteo.participantes.some(
      (p: any) =>
        String(p.numeroPoliza).trim() === numeroPoliza
    );

    if (duplicada) {
      return res.status(409).json({
        message: "Esta póliza ya participa en el sorteo.",
      });
    }

    const venta = await Venta.findOne({
      numeroPoliza,
    }).lean();

    if (!venta) {
      return res.status(404).json({
        message: "No se encontró ninguna venta con ese número de póliza.",
      });
    }

    if (!esMapfre((venta as any).aseguradora)) {
      return res.status(400).json({
        message: "La póliza no pertenece a MAPFRE.",
      });
    }

    if (
      (venta as any).estado !== "ACTIVA" ||
      (venta as any).derivadoVerti === true
    ) {
      return res.status(400).json({
        message: "La póliza no está activa o no es válida para este sorteo.",
      });
    }

    const ramo = buscarRamoConfigurado(
      sorteo.ramos as any[],
      (venta as any).ramo
    );

    if (!ramo) {
      return res.status(400).json({
        message: "El ramo de esta póliza no está activo en la configuración.",
      });
    }

    sorteo.participantes.push(
      serializarParticipante(
        venta,
        ramo.participaciones,
        "MANUAL"
      ) as any
    );

    if (sorteo.estado === "CONFIGURACION") {
      sorteo.estado = "ABIERTO";
    }

    await sorteo.save();

    return res.status(201).json({
      message: "Póliza añadida correctamente.",
      participante:
        sorteo.participantes[sorteo.participantes.length - 1],
      totalParticipantes: sorteo.participantes.length,
    });
  } catch (error) {
    console.error("Error al añadir participante:", error);

    return res.status(500).json({
      message: "No se pudo añadir la póliza.",
    });
  }
};

/* =====================================================
   ELIMINAR PARTICIPANTE
===================================================== */

export const eliminarParticipante = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    const { id, participanteId } = req.params;

    if (!usuarioId) {
      return res.status(401).json({
        message: "Usuario no autenticado.",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(participanteId)
    ) {
      return res.status(400).json({
        message: "Los identificadores no son válidos.",
      });
    }

    const sorteo = await Sorteo.findOne({
      _id: id,
      creadoPor: usuarioId,
    });

    if (!sorteo) {
      return res.status(404).json({
        message: "No se encontró el sorteo.",
      });
    }

    if (sorteo.estado === "REALIZADO") {
      return res.status(400).json({
        message: "No se pueden modificar los participantes de un sorteo realizado.",
      });
    }

    const indice = sorteo.participantes.findIndex(
      (p: any) => String(p._id) === participanteId
    );

    if (indice === -1) {
      return res.status(404).json({
        message: "No se encontró el participante.",
      });
    }

    sorteo.participantes.splice(indice, 1);
    await sorteo.save();

    return res.json({
      message: "Participante eliminado.",
      totalParticipantes: sorteo.participantes.length,
    });
  } catch (error) {
    console.error("Error al eliminar participante:", error);

    return res.status(500).json({
      message: "No se pudo eliminar el participante.",
    });
  }
};

/* =====================================================
   REALIZAR SORTEO
===================================================== */

export const realizarSorteo = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    const { id } = req.params;

    if (!usuarioId || !mongoose.Types.ObjectId.isValid(usuarioId)) {
      return res.status(401).json({
        message: "Usuario no autenticado.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "El identificador del sorteo no es válido.",
      });
    }

    const sorteo = await Sorteo.findOne({
      _id: id,
      creadoPor: usuarioId,
    });

    if (!sorteo) {
      return res.status(404).json({
        message: "No se encontró el sorteo.",
      });
    }

    if (sorteo.estado === "REALIZADO" || sorteo.auditoria) {
      return res.status(409).json({
        message: "Este sorteo ya se ha realizado.",
      });
    }

    const participantes = sorteo.participantes;

    if (!participantes.length) {
      return res.status(400).json({
        message: "No hay participantes para realizar el sorteo.",
      });
    }

    // Validamos las participaciones antes de congelar el listado.
    const participacionesInvalidas = participantes.some((p: any) => {
      const cantidad = Number(p.participaciones);
      return !Number.isSafeInteger(cantidad) || cantidad < 1;
    });

    if (participacionesInvalidas) {
      return res.status(400).json({
        message: "Hay participantes con un número de participaciones no válido.",
      });
    }

    const totalParticipaciones = participantes.reduce(
      (total: number, p: any) => total + Number(p.participaciones),
      0
    );

    // crypto.randomInt admite límites inferiores a 2^48.
    if (
      !Number.isSafeInteger(totalParticipaciones) ||
      totalParticipaciones <= 0 ||
      totalParticipaciones > 2 ** 48 - 1
    ) {
      return res.status(400).json({
        message: "El total de participaciones supera el límite permitido.",
      });
    }

    /*
     * Fotografía del listado que participa.
     * Se guarda una entrada por póliza, con su número de participaciones.
     */
    const listadoAuditoria = participantes.map((p: any) => ({
      participanteId: new mongoose.Types.ObjectId(String(p._id)),
      numeroPoliza: String(p.numeroPoliza),
      tomador: String(p.tomador),
      ramo: String(p.ramo),
      participaciones: Number(p.participaciones),
    }));

    /*
     * Huella SHA-256 del listado congelado.
     * La representación JSON se genera con un orden fijo de propiedades.
     */
    const contenidoHuella = JSON.stringify(
      listadoAuditoria.map((p) => ({
        participanteId: String(p.participanteId),
        numeroPoliza: p.numeroPoliza,
        tomador: p.tomador,
        ramo: p.ramo,
        participaciones: p.participaciones,
      }))
    );

    const huellaSHA256 = createHash("sha256")
      .update(contenidoHuella, "utf8")
      .digest("hex");

    /*
     * Selección ponderada:
     * cada participación ocupa una posición del 0 al total - 1.
     */
    const indiceSeleccionado = randomInt(totalParticipaciones);

    let acumulado = 0;
    let ganador: any = null;

    for (const participante of participantes as any[]) {
      const cantidad = Number(participante.participaciones);

      if (indiceSeleccionado < acumulado + cantidad) {
        ganador = participante;
        break;
      }

      acumulado += cantidad;
    }

    if (!ganador) {
      return res.status(500).json({
        message: "No se pudo seleccionar un ganador.",
      });
    }

    const fechaResultado = new Date();

    const ganadorGuardado = {
      participanteId: ganador._id,
      numeroPoliza: ganador.numeroPoliza,
      tomador: ganador.tomador,
      ramo: ganador.ramo,
      participaciones: Number(ganador.participaciones),
      fechaResultado,
    };

    const auditoria = {
      fecha: fechaResultado,
      metodo: "crypto.randomInt",
      totalParticipaciones,
      indiceSeleccionado,
      huellaSHA256,
      listado: listadoAuditoria,
    };

    /*
     * Cierre atómico:
     * solo se guarda si el sorteo sigue sin realizarse y no ha cambiado
     * desde que cargamos la lista de participantes.
     */
    const sorteoActualizado = await Sorteo.findOneAndUpdate(
      {
        _id: id,
        creadoPor: usuarioId,
        estado: { $ne: "REALIZADO" },
        auditoria: { $exists: false },
        updatedAt: sorteo.updatedAt,
      },
      {
        $set: {
          ganadores: [ganadorGuardado],
          historialResultados: [{ ganador: ganadorGuardado, fecha: fechaResultado, motivo: "Resultado inicial", tipo: "INICIAL" }],
          auditoria,
          estado: "REALIZADO",
          fechaRealizacion: fechaResultado,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!sorteoActualizado) {
      return res.status(409).json({
        message:
          "El sorteo ha cambiado o ya se ha realizado. Actualiza los datos antes de continuar.",
      });
    }

    return res.json({
      message: "Sorteo realizado y registrado correctamente.",
      ganador: ganadorGuardado,
      fechaResultado,
      totalParticipantes: participantes.length,
      totalParticipaciones,
      auditoria: {
        metodo: auditoria.metodo,
        indiceSeleccionado,
        huellaSHA256,
        fecha: fechaResultado,
      },
      sorteo: sorteoActualizado,
    });
  } catch (error) {
    console.error("Error al realizar sorteo:", error);

    return res.status(500).json({
      message: "No se pudo realizar el sorteo.",
    });
  }
};

/* =====================================================
   ELIMINAR SORTEO
===================================================== */

export const eliminarSorteo = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    const { id } = req.params;

    if (!usuarioId) {
      return res.status(401).json({
        message: "Usuario no autenticado.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "El identificador del sorteo no es válido.",
      });
    }

    const sorteo = await Sorteo.findOne({
      _id: id,
      creadoPor: usuarioId,
    });

    if (!sorteo) {
      return res.status(404).json({
        message: "No se encontró el sorteo.",
      });
    }

    await Sorteo.deleteOne({
      _id: id,
      creadoPor: usuarioId,
    });

    return res.json({
      message: "Sorteo eliminado correctamente.",
    });
  } catch (error) {
    console.error("Error al eliminar sorteo:", error);

    return res.status(500).json({
      message: "No se pudo eliminar el sorteo.",
    });
  }
};

/* =====================================================
   REPETIR SORTEO POR PREMIO NO RECLAMADO
===================================================== */

export const repetirSorteo = async (req: Request, res: Response) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    const { id } = req.params;
    const motivo = String(req.body?.motivo ?? "").trim();
    if (!usuarioId || !mongoose.Types.ObjectId.isValid(usuarioId)) return res.status(401).json({ message: "Usuario no autenticado." });
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "El identificador del sorteo no es válido." });
    if (!motivo) return res.status(400).json({ message: "Indica el motivo de la repetición." });
    const sorteo = await Sorteo.findOne({ _id: id, creadoPor: usuarioId });
    if (!sorteo) return res.status(404).json({ message: "No se encontró el sorteo." });
    if (sorteo.estado !== "REALIZADO" || !sorteo.auditoria || !sorteo.ganadores.length) return res.status(409).json({ message: "Primero debe existir un resultado inicial." });
    const previos = new Set((sorteo.historialResultados || []).map((r: any) => String(r.ganador?.participanteId)));
    const elegibles = (sorteo.auditoria.listado as any[]).filter((p: any) => !previos.has(String(p.participanteId)));
    const total = elegibles.reduce((sum: number, p: any) => sum + Number(p.participaciones), 0);
    if (!total) return res.status(409).json({ message: "No quedan participantes elegibles para repetir el sorteo." });
    const indice = randomInt(total);
    let acumulado = 0;
    let elegido: any = null;
    for (const p of elegibles) {
      acumulado += Number(p.participaciones);
      if (indice < acumulado) { elegido = p; break; }
    }
    if (!elegido) return res.status(500).json({ message: "No se pudo seleccionar un ganador." });
    const fecha = new Date();
    const ganador = { participanteId: elegido.participanteId, numeroPoliza: elegido.numeroPoliza, tomador: elegido.tomador, ramo: elegido.ramo, participaciones: Number(elegido.participaciones), fechaResultado: fecha };
    const actualizado = await Sorteo.findOneAndUpdate(
      { _id: id, creadoPor: usuarioId, estado: "REALIZADO", updatedAt: sorteo.updatedAt },
      { $push: { ganadores: ganador, historialResultados: { ganador, fecha, motivo, tipo: "REPETICION" } } },
      { new: true, runValidators: true }
    );
    if (!actualizado) return res.status(409).json({ message: "El sorteo ha cambiado. Actualiza e inténtalo de nuevo." });
    return res.json({ message: "Repetición registrada correctamente.", ganador, historialResultados: actualizado.historialResultados, sorteo: actualizado });
  } catch (error) {
    console.error("Error al repetir sorteo:", error);
    return res.status(500).json({ message: "No se pudo repetir el sorteo." });
  }
};


export const actualizarParticipante = async (req: Request, res: Response) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    const { id, participanteId } = req.params;
    const n = Number(req.body?.participaciones);

    if (!usuarioId) return res.status(401).json({ message: "Usuario no autenticado." });
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(participanteId))
      return res.status(400).json({ message: "Los identificadores no son válidos." });
    if (!Number.isInteger(n) || n < 1 || n > 1000)
      return res.status(400).json({ message: "Las participaciones deben ser un entero entre 1 y 1000." });

    const sorteo = await Sorteo.findOne({ _id: id, creadoPor: usuarioId });
    if (!sorteo) return res.status(404).json({ message: "No se encontró el sorteo." });
    if (sorteo.estado === "REALIZADO")
      return res.status(400).json({ message: "No se pueden modificar los participantes de un sorteo realizado." });

    const participante: any = sorteo.participantes.find((p: any) => String(p._id) === participanteId);
    if (!participante) return res.status(404).json({ message: "No se encontró el participante." });

    participante.participaciones = n;
    participante.participacionesPersonalizadas = true; // fijado a mano: el recálculo no lo toca
    await sorteo.save();
    return res.json({ message: "Participaciones actualizadas.", participante });
  } catch (error) {
    console.error("Error al actualizar participante:", error);
    return res.status(500).json({ message: "No se pudo actualizar el participante." });
  }
};

/* =====================================================
   RECALCULAR PARTICIPACIONES (ramo + prima)
===================================================== */

export const recalcularParticipaciones = async (req: Request, res: Response) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    const { id } = req.params;

    if (!usuarioId) return res.status(401).json({ message: "Usuario no autenticado." });
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "El identificador del sorteo no es válido." });

    const sorteo = await Sorteo.findOne({ _id: id, creadoPor: usuarioId });
    if (!sorteo) return res.status(404).json({ message: "No se encontró el sorteo." });
    if (sorteo.estado === "REALIZADO")
      return res.status(400).json({ message: "No se puede modificar un sorteo realizado." });

    const ids = (sorteo.participantes as any[]).map((p) => p.ventaId).filter(Boolean);
    const ventas = await Venta.find({ _id: { $in: ids } }).select("primaNeta ramo").lean();
    const mapa = new Map((ventas as any[]).map((v) => [String(v._id), v]));

    let actualizadas = 0;

    for (const p of sorteo.participantes as any[]) {
      if (p.participacionesPersonalizadas) continue;

      const venta: any = mapa.get(String(p.ventaId));
      if (!venta) continue;

      const ramo = buscarRamoConfigurado(sorteo.ramos as any[], venta.ramo);
      if (!ramo) continue;

      const extra = calcularParticipacionesExtra(venta.primaNeta);
      const total = ramo.participaciones + extra;

      if (p.participaciones !== total || p.participacionesExtra !== extra) {
        p.primaNeta = Number(venta.primaNeta) || 0;
        p.participacionesBase = ramo.participaciones;
        p.participacionesExtra = extra;
        p.participaciones = total;
        actualizadas++;
      }
    }

    await sorteo.save();
    return res.json({ message: "Participaciones recalculadas.", actualizadas });
  } catch (error) {
    console.error("Error al recalcular participaciones:", error);
    return res.status(500).json({ message: "No se pudieron recalcular las participaciones." });
  }
};