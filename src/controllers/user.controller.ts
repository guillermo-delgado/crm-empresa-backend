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
    } = req.body;

    // Validación básica
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

    // Comprobar duplicados
    const existe = await User.findOne({
      $or: [{ email }, { nif }, { numma }],
    });

    if (existe) {
      return res.status(400).json({
        message: "Ya existe un usuario con ese email, NIF o NUMMA",
      });
    }

    // Hash de contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    const usuario = await User.create({
      nombre,
      apellidos,
      nif,
      numma,
      email,
      password: hashedPassword,
      role: role || "empleado",
    });

    res.status(201).json({
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
      },
    });
  } catch (error) {
    console.error("CREAR USUARIO ERROR:", error);
    res.status(500).json({ message: "Error creando usuario" });
  }
};

/* =========================
   LISTAR USUARIOS ASIGNABLES (ADMIN)
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
      {
        role: { $in: ["empleado", "colaborador"] },
      },
      "nombre email role"
    ).sort({ nombre: 1 });

    res.json(usuarios);
  } catch (error) {
    console.error("LISTAR USUARIOS ASIGNABLES ERROR:", error);
    res.status(500).json({
      message: "Error cargando usuarios",
    });
  }
};
