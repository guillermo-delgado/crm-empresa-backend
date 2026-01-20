import { Request, Response } from "express";
import User from "../models/User";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

/* =========================
   LOGIN
========================= */
export const login = async (req: Request, res: Response) => {
  try {
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

    /* 🔐 SESIÓN CRM (la primera manda) */
    let sessionId = user.crmSessionId;

    if (!sessionId) {
      sessionId = crypto.randomUUID();

      // ⚠️ updateOne → NO dispara validaciones del modelo
      await User.updateOne(
        { _id: user._id },
        { $set: { crmSessionId: sessionId } }
      );
    }

    /* 🔑 JWT */
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        crmSessionId: sessionId,
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
  } catch (error) {
    console.error("❌ Error en login:", error);
    return res.status(500).json({
      message: "Error al iniciar sesión",
    });
  }
};

/* =========================
   LOGOUT
   - Libera la sesión CRM
========================= */
export const logout = async (req: any, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "No autenticado",
      });
    }

    // ⚠️ aquí también usamos updateOne (más limpio)
    await User.updateOne(
      { _id: req.user.id },
      { $set: { crmSessionId: null } }
    );

    return res.json({
      message: "Sesión cerrada correctamente",
    });
  } catch (error) {
    console.error("❌ Error en logout:", error);

    return res.status(500).json({
      message: "Error cerrando sesión",
    });
  }
};
