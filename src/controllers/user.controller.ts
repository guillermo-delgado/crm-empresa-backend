import User from "../models/User";
import bcrypt from "bcryptjs";
import { Request, Response } from "express";

/* =========================
   CREAR USUARIO
========================= */
export const crearUsuario = async (req: Request, res: Response) => {
  try {
    const {
      nombre,
      apellidos,
      nif,
      numma,
      email,
      password,
      role,
      horasContratadasSemana,
      maxDiasVacaciones,
    } = req.body;

    if (
      !nombre ||
      !apellidos ||
      !nif ||
      !numma ||
      !email ||
      !password
    ) {
      return res
        .status(400)
        .json({ message: "Faltan campos obligatorios" });
    }

    const existe = await User.findOne({
      $or: [{ email }, { nif }, { numma }],
    });

    if (existe) {
      return res.status(400).json({
        message:
          "Ya existe un usuario con ese email, NIF o NUMMA",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const usuario = await User.create({
      nombre,
      apellidos,
      nif,
      numma,
      email,
      password: hashedPassword,
      role: role || "empleado",

      // CONFIGURACIÓN LABORAL
      horasContratadasSemana:
        horasContratadasSemana ?? 40,
      maxDiasVacaciones:
        maxDiasVacaciones ?? 30,
    });

    return res.status(201).json({
      message: "Usuario creado correctamente",
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        apellidos: usuario.apellidos,
        nif: usuario.nif,
        numma: usuario.numma,
        email: usuario.email,
        role: usuario.role,
        activo: usuario.activo,
        horasContratadasSemana:
          usuario.horasContratadasSemana,
        maxDiasVacaciones:
          usuario.maxDiasVacaciones,
      },
    });
  } catch (error) {
    console.error("CREAR USUARIO ERROR:", error);
    return res
      .status(500)
      .json({ message: "Error creando usuario" });
  }
};

/* =========================
   LISTAR USUARIOS (ADMIN / CRM)
========================= */
export const listarUsuariosAsignables = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        message: "Solo administradores",
      });
    }

    const usuarios = await User.find(
      { activo: true },
      `
        nombre
        apellidos
        email
        numma
        role
        horasContratadasSemana
        maxDiasVacaciones
      `
    ).sort({ nombre: 1 });

    return res.json(usuarios);
  } catch (error) {
    console.error(
      "LISTAR USUARIOS ERROR:",
      error
    );
    return res
      .status(500)
      .json({ message: "Error cargando usuarios" });
  }
};

/* =========================
   ✏️ ACTUALIZAR CONFIGURACIÓN LABORAL
   PUT /api/users/:id/config
========================= */
export const actualizarConfigLaboral = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        message: "Solo administradores",
      });
    }

    const { id } = req.params;
    const {
      horasContratadasSemana,
      maxDiasVacaciones,
    } = req.body;

    const usuario = await User.findById(id);

    if (!usuario) {
      return res
        .status(404)
        .json({ message: "Usuario no encontrado" });
    }

    usuario.horasContratadasSemana =
      Number(horasContratadasSemana);
    usuario.maxDiasVacaciones =
      Number(maxDiasVacaciones);

    await usuario.save();

    return res.json({
      ok: true,
      horasContratadasSemana:
        usuario.horasContratadasSemana,
      maxDiasVacaciones:
        usuario.maxDiasVacaciones,
    });
  } catch (error) {
    console.error(
      "CONFIG LABORAL ERROR:",
      error
    );
    return res
      .status(500)
      .json({ message: "Error guardando configuración" });
  }
};


/* =========================
   OBTENER USUARIO (CONFIG)
========================= */
export const obtenerUsuario = async (
  req: Request,
  res: Response
) => {
  try {
    const user = await User.findById(req.params.id).select(
      "horasContratadasSemana maxDiasVacaciones"
    );

    if (!user) {
      return res.status(404).json({
        message: "Usuario no encontrado",
      });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({
      message: "Error cargando usuario",
    });
  }
};
