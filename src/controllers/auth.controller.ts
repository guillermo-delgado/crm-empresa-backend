import { Request, Response } from "express";
import User from "../models/User";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email y password obligatorios" });
  }

  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    return res.status(401).json({ message: "Credenciales incorrectas" });
  }

  if (!user.activo) {
    return res.status(403).json({ message: "Usuario desactivado" });
  }

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    return res.status(401).json({ message: "Credenciales incorrectas" });
  }

  const token = jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
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
    },
  });
};
