import { Request, Response } from "express";
import mongoose from "mongoose";
import NotaAgenda from "./NotaAgenda";
import User from "../../models/User";
import { getIO } from "../../socket";

const TIPOS = ["LLAMADA", "AVISO", "GESTION", "OTRO"];

const limpiarTipoPersonalizado = (v: unknown): string | undefined => {
  const t = String(v ?? "").trim().slice(0, 30);
  return t || undefined;
};
const PRIORIDADES = ["NORMAL", "ALTA", "URGENTE"];
const COLORES = ["amarillo", "azul", "verde", "rosa", "lila"];

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const esAdmin = (req: Request) => req.user?.role === "admin";

/* Avisa en tiempo real a las personas implicadas */
const avisarSocket = (
  evento: string,
  nota: any,
  quien: (string | undefined)[]
) => {
  try {
    const io = getIO();
    const salas = new Set(quien.filter(Boolean) as string[]);
    salas.forEach((id) => io.to(`user:${id}`).emit(evento, nota));
  } catch {
    /* sin socket no pasa nada */
  }
};

const poblar = (q: any) =>
  q
    .populate("asignadoA", "nombre numma")
    .populate("creadoPor", "nombre");

/* =========================
   LISTAR
   GET /api/agenda?usuarioId=<id|todos>
   - Empleado: solo las suyas.
   - Admin: las suyas por defecto; usuarioId=<id> o "todos".
   Devuelve las pendientes y las hechas de los últimos 7 días.
========================= */
export const listarNotas = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: "No autenticado" });

    const filtro: any = {};

    if (esAdmin(req)) {
      const u = String(req.query.usuarioId || "").trim();
      if (u === "todos") {
        /* sin filtro de persona */
      } else if (u && mongoose.isValidObjectId(u)) {
        filtro.asignadoA = u;
      } else {
        filtro.asignadoA = req.user.id;
      }
    } else {
      filtro.asignadoA = req.user.id;
    }

    const hace7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    filtro.$or = [
      { estado: "PENDIENTE" },
      { estado: "HECHA", hechaEn: { $gte: hace7 } },
    ];

    const notas = await poblar(NotaAgenda.find(filtro))
      .sort({ dia: 1, hora: 1, createdAt: 1 })
      .lean();

    res.json(notas);
  } catch (error) {
    console.error("AGENDA LISTAR ERROR:", error);
    res.status(500).json({ message: "No se han podido cargar las notas" });
  }
};

/* =========================
   CREAR
   POST /api/agenda
   - Empleado: siempre para sí mismo.
   - Admin: asignadoA = [ids]; si no manda ninguno, para sí mismo.
========================= */
export const crearNota = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: "No autenticado" });

    const b = req.body || {};

    const titulo = String(b.titulo || "").trim();
    if (!titulo) {
      return res.status(400).json({ message: "Escribe qué hay que hacer" });
    }

    const tipo = TIPOS.includes(b.tipo) ? b.tipo : "AVISO";
    const tipoPersonalizado =
      tipo === "OTRO" ? limpiarTipoPersonalizado(b.tipoPersonalizado) || "Otro" : undefined;
    const prioridad = PRIORIDADES.includes(b.prioridad) ? b.prioridad : "NORMAL";
    const color = COLORES.includes(b.color) ? b.color : "amarillo";

    const dia = b.dia && RE_DIA.test(String(b.dia)) ? String(b.dia) : undefined;
    const hora =
      dia && b.hora && RE_HORA.test(String(b.hora)) ? String(b.hora) : undefined;

    const avisoMinutos = Number.isFinite(Number(b.avisoMinutos))
      ? Math.max(0, Math.min(1440, Number(b.avisoMinutos)))
      : 10;

    /* ---- destinatarios ---- */
    let destinatarios: string[] = [req.user.id];

    if (esAdmin(req) && Array.isArray(b.asignadoA) && b.asignadoA.length) {
      const ids = [...new Set(b.asignadoA.map((x: any) => String(x)))].filter(
        (x) => mongoose.isValidObjectId(x)
      ) as string[];

      const existentes = await User.find({ _id: { $in: ids } }).select("_id");
      if (!existentes.length) {
        return res.status(400).json({ message: "El usuario seleccionado no existe." });
      }
      destinatarios = existentes.map((u) => u._id.toString());
    }

    const creadas = await NotaAgenda.insertMany(
      destinatarios.map((uid) => ({
        tipo,
        tipoPersonalizado,
        titulo,
        detalle: b.detalle ? String(b.detalle).trim() : undefined,
        telefono: b.telefono ? String(b.telefono).trim() : undefined,
        dia,
        hora,
        prioridad,
        color,
        avisoMinutos,
        asignadoA: uid,
        creadoPor: req.user!.id,
        impuesta: uid !== req.user!.id && esAdmin(req),
      })) as any[]
    );

    const completas = await poblar(
      NotaAgenda.find({ _id: { $in: creadas.map((n) => n._id) } })
    ).lean();

    completas.forEach((n: any) => {
      const para = String(n.asignadoA?._id || n.asignadoA);
      avisarSocket("AGENDA_ASIGNADA", n, [para, req.user!.id]);
    });

    res.status(201).json(completas);
  } catch (error) {
    console.error("AGENDA CREAR ERROR:", error);
    res.status(500).json({ message: "No se ha podido crear la nota" });
  }
};

/* =========================
   ACTUALIZAR
   PATCH /api/agenda/:id
   - La persona asignada puede cambiar casi todo (no reasignar).
   - El admin puede cambiar todo, incluida la persona asignada.
========================= */
export const actualizarNota = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: "No autenticado" });

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Nota no válida" });
    }

    const nota = await NotaAgenda.findById(id);
    if (!nota) return res.status(404).json({ message: "La nota no existe" });

    const admin = esAdmin(req);
    const esSuya = nota.asignadoA.toString() === req.user.id;

    if (!admin && !esSuya) {
      return res.status(403).json({ message: "No puedes modificar esta nota" });
    }

    const b = req.body || {};

    /* Una nota impuesta por el admin: el empleado solo puede
       moverla de día/hora, marcarla, leerla y anotar la llamada. */
    const soloOperativo = !admin && nota.impuesta;

    if (!soloOperativo) {
      if (typeof b.titulo === "string" && b.titulo.trim()) nota.titulo = b.titulo.trim();
      if (typeof b.detalle === "string") nota.detalle = b.detalle.trim();
      if (typeof b.telefono === "string") nota.telefono = b.telefono.trim();
      if (TIPOS.includes(b.tipo)) nota.tipo = b.tipo;
      if (nota.tipo === "OTRO") {
        if (b.tipoPersonalizado !== undefined || b.tipo === "OTRO") {
          nota.tipoPersonalizado =
            limpiarTipoPersonalizado(b.tipoPersonalizado) ||
            nota.tipoPersonalizado ||
            "Otro";
        }
      } else {
        nota.tipoPersonalizado = undefined;
      }
      if (PRIORIDADES.includes(b.prioridad)) nota.prioridad = b.prioridad;
      if (COLORES.includes(b.color)) nota.color = b.color;
    }

    if (b.dia === null || b.dia === "") {
      nota.dia = undefined;
      nota.hora = undefined;
    } else if (typeof b.dia === "string" && RE_DIA.test(b.dia)) {
      nota.dia = b.dia;
    }

    if (b.hora === null || b.hora === "") {
      nota.hora = undefined;
    } else if (typeof b.hora === "string" && RE_HORA.test(b.hora) && nota.dia) {
      nota.hora = b.hora;
    }

    if (Number.isFinite(Number(b.avisoMinutos)) && b.avisoMinutos !== null) {
      nota.avisoMinutos = Math.max(0, Math.min(1440, Number(b.avisoMinutos)));
    }

    /* Posición en el tablón (la mueve quien tiene la nota o el admin) */
    if (b.x === null && b.y === null) {
      nota.x = undefined;
      nota.y = undefined;
    } else if (
      typeof b.x === "number" &&
      typeof b.y === "number" &&
      Number.isFinite(b.x) &&
      Number.isFinite(b.y)
    ) {
      nota.x = Math.max(0, Math.min(1, b.x));
      nota.y = Math.max(0, Math.min(5000, b.y));
    }

    if (typeof b.notaLlamada === "string") nota.notaLlamada = b.notaLlamada.trim();

    if (b.estado === "HECHA" && nota.estado !== "HECHA") {
      nota.estado = "HECHA";
      nota.hechaEn = new Date();
    } else if (b.estado === "PENDIENTE" && nota.estado !== "PENDIENTE") {
      nota.estado = "PENDIENTE";
      nota.hechaEn = undefined;
    }

    if (b.leida === true && !nota.leidaEn && esSuya) {
      nota.leidaEn = new Date();
    }

    /* Solo el admin reasigna */
    if (
      admin &&
      b.asignadoA &&
      mongoose.isValidObjectId(String(b.asignadoA)) &&
      String(b.asignadoA) !== nota.asignadoA.toString()
    ) {
      const destino = await User.findById(String(b.asignadoA)).select("_id");
      if (destino) {
        nota.asignadoA = destino._id as any;
        nota.impuesta = destino._id.toString() !== req.user.id;
        nota.leidaEn = undefined;
      }
    }

    await nota.save();

    const completa: any = await poblar(NotaAgenda.findById(nota._id)).lean();

    avisarSocket("AGENDA_ACTUALIZADA", completa, [
      String(completa.asignadoA?._id || completa.asignadoA),
      String(completa.creadoPor?._id || completa.creadoPor),
      req.user.id,
    ]);

    res.json(completa);
  } catch (error) {
    console.error("AGENDA ACTUALIZAR ERROR:", error);
    res.status(500).json({ message: "No se ha podido guardar el cambio" });
  }
};

/* =========================
   ELIMINAR
   DELETE /api/agenda/:id
   - Admin: cualquiera.
   - Empleado: solo las suyas que no sean impuestas.
========================= */
export const eliminarNota = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: "No autenticado" });

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Nota no válida" });
    }

    const nota = await NotaAgenda.findById(id);
    if (!nota) return res.status(404).json({ message: "La nota no existe" });

    const admin = esAdmin(req);
    const esSuya = nota.asignadoA.toString() === req.user.id;

    if (!admin && !(esSuya && !nota.impuesta)) {
      return res.status(403).json({
        message: "Las notas que te manda el administrador no se pueden borrar",
      });
    }

    await nota.deleteOne();

    avisarSocket("AGENDA_ELIMINADA", { _id: id }, [
      nota.asignadoA.toString(),
      nota.creadoPor.toString(),
      req.user.id,
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error("AGENDA ELIMINAR ERROR:", error);
    res.status(500).json({ message: "No se ha podido eliminar la nota" });
  }
};