import { Request, Response } from "express";
import User from "../models/User";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const login = async (req: Request, res: Response) => {
  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({
      message: "Usuario y contraseña obligatorios",
    });
  }

  const user = await User.findOne({
    $or: [
      { email: new RegExp(`^${login}$`, "i") },
      { numma: new RegExp(`^${login}$`, "i") },
    ],
  }).select("+password");

  if (!user) {
    return res.status(401).json({ message: "Credenciales incorrectas" });
  }

  if (!user.activo) {
    return res.status(403).json({ message: "Usuario desactivado" });
  }

  const validPassword = await bcrypt.compare(password, user.password);

  if (!validPassword) {
    return res.status(401).json({ message: "Credenciales incorrectas" });
  }

  const token = jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "8h" }
  );

  return res.json({
    token,
    user: {
      id: user._id,
      nombre: user.nombre,
      role: user.role,
      email: user.email,
      numma: user.numma,
    },
  });
};

