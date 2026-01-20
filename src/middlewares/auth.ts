import { Request, Response, NextFunction } from "express";
import jwt, { TokenExpiredError } from "jsonwebtoken";
import User from "../models/User";

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "No autorizado",
      code: "NO_TOKEN",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded: any = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    );

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        message: "Usuario no válido",
        code: "USER_NOT_FOUND",
      });
    }

    if (!user.activo) {
      return res.status(403).json({
        message: "Usuario desactivado",
        code: "USER_DISABLED",
      });
    }

    /* =========================
       🔐 BLOQUEO DE SESIÓN CRM
       - Solo para rutas /crm/*
       - La primera sesión manda
    ========================= */
    if (
      req.originalUrl.startsWith("/crm") &&
      user.crmSessionId && // hay sesión CRM registrada
      decoded.crmSessionId !== user.crmSessionId
    ) {
      return res.status(403).json({
        message: "Sesión CRM no válida",
        code: "CRM_SESSION_CONFLICT",
      });
    }

    // 👤 Usuario autenticado
    req.user = {
      id: user._id.toString(),
      role: user.role,
    };

    next();
  } catch (error) {
    // 🔴 TOKEN CADUCADO
    if (error instanceof TokenExpiredError) {
      return res.status(401).json({
        message: "Token caducado",
        code: "TOKEN_EXPIRED",
      });
    }

    // 🔴 TOKEN INVÁLIDO
    return res.status(401).json({
      message: "Token inválido",
      code: "TOKEN_INVALID",
    });
  }
};

export const adminOnly = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      message: "Acceso denegado",
      code: "ADMIN_ONLY",
    });
  }

  next();
};
