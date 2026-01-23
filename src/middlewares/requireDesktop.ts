// middlewares/requireDesktop.ts

import { Response, NextFunction } from "express";
import IntentoFraude from "../models/IntentoFraude";

const isMobileOrTablet = (userAgent: string) => {
  const ua = userAgent.toLowerCase();

  return (
    ua.includes("mobile") ||
    ua.includes("android") ||
    ua.includes("iphone") ||
    ua.includes("ipad") ||
    ua.includes("tablet")
  );
};

const registrarFraude = async (req: any, motivo: string) => {
  try {
    await IntentoFraude.create({
      usuario: req.user?.id || "desconocido",
      ruta: req.originalUrl,
      metodo: req.method,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      motivo,
    });
  } catch (e) {
    console.error("⚠️ Error registrando fraude:", e);
  }
};

export const requireDesktop = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ message: "No autenticado" });
  }

  // 👑 ADMIN → siempre permitido
  if (req.user.role === "admin") {
    return next();
  }

  // 👤 SOLO EMPLEADOS
  if (req.user.role !== "empleado") {
    return res.status(403).json({ message: "Acceso no permitido" });
  }

  const ua = req.headers["user-agent"] || "";

  if (isMobileOrTablet(ua)) {
    await registrarFraude(req, "DISPOSITIVO_NO_AUTORIZADO");

    return res.status(403).json({
      message: "Acceso no permitido desde este dispositivo",
    });
  }

  next();
};
