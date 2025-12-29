import { Request, Response, NextFunction } from "express";

export const adminOnly = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Acceso solo para administradores" });
  }

  next();
};
