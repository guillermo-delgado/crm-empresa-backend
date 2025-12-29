import User from "../models/User";
import bcrypt from "bcryptjs";
import { Request, Response } from "express";

export const crearUsuario = async (req: Request, res: Response) => {
  try {
    const { nombre, email, password, role } = req.body;

    const existe = await User.findOne({ email });
    if (existe) {
      return res.status(400).json({ message: "El usuario ya existe" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const usuario = await User.create({
      nombre,
      email,
      password: hashedPassword,
      role,
    });

    res.status(201).json({
      message: "Usuario creado correctamente",
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        role: usuario.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error creando usuario" });
  }
};
