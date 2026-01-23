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
      return res.status(400).json({ message: "Usuario y contraseña obligatorios" });
    }

    const user = await User.findOne({
      $or: [
        { email: new RegExp(`^${login}$`, "i") },
        { numma: new RegExp(`^${login}$`, "i") },
      ],
    }).select("+password");

    if (!user || !user.activo) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    /* =========================
       📱 Detectar móvil
    ========================= */
    const ua = req.headers["user-agent"] || "";
    const isMobile = /android|iphone|ipad|mobile/i.test(ua);

    /* =========================
       🔐 CRM SESSION (desktop)
    ========================= */
    let crmSessionId = user.crmSessionId;
    if (!crmSessionId && !isMobile) {
      crmSessionId = crypto.randomUUID();
      await User.updateOne(
        { _id: user._id },
        { $set: { crmSessionId } }
      );
    }

    /* =========================
       🔑 ACCESS TOKEN
    ========================= */
    const accessToken = jwt.sign(
      {
        id: user._id,
        role: user.role,
        crmSessionId,
      },
      process.env.JWT_SECRET!,
      { expiresIn: isMobile ? "2h" : "8h" }
    );

    /* =========================
       🔁 REFRESH TOKEN (solo móvil)
    ========================= */
    let refreshToken: string | undefined;

    if (isMobile) {
      refreshToken = crypto.randomUUID();
      await User.updateOne(
        { _id: user._id },
        { $set: { refreshToken } }
      );
    }

    return res.json({
      token: accessToken,
      refreshToken,
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
    return res.status(500).json({ message: "Error al iniciar sesión" });
  }
};

/* =========================
   REFRESH TOKEN (MÓVIL)
========================= */
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: "No autorizado" });
    }

    const user = await User.findOne({ refreshToken });

    if (!user || !user.activo) {
      return res.status(401).json({ message: "Sesión no válida" });
    }

    const newAccessToken = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "2h" }
    );

    return res.json({ token: newAccessToken });
  } catch (error) {
    console.error("❌ Error refresh token:", error);
    return res.status(500).json({ message: "Error renovando sesión" });
  }
};

/* =========================
   LOGOUT
========================= */
export const logout = async (req: any, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: "No autenticado" });
  }

  await User.updateOne(
    { _id: req.user.id },
    { $set: { crmSessionId: null, refreshToken: null } }
  );

  return res.json({ message: "Sesión cerrada correctamente" });
};
