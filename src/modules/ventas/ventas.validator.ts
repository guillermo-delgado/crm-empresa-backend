import { Request, Response, NextFunction } from "express";

export const validateCreateVenta = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 1️⃣ Body obligatorio
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({
      message: "El body de la petición es obligatorio",
    });
  }

  const {
    fechaEfecto,
    aseguradora,
    ramo,
    numeroPoliza,
    tomador,
    primaNeta,
    formaPago,
  } = req.body;

  // 2️⃣ Campos obligatorios
  const requiredFields = {
    fechaEfecto,
    aseguradora,
    ramo,
    numeroPoliza,
    tomador,
    primaNeta,
    formaPago,
  };

  const missingFields = Object.entries(requiredFields)
    .filter(([_, value]) => value === undefined || value === "")
    .map(([key]) => key);

  if (missingFields.length > 0) {
    return res.status(400).json({
      message: "Faltan campos obligatorios",
      missingFields,
    });
  }

  // 3️⃣ Fecha válida
  const fecha = new Date(fechaEfecto);
  if (isNaN(fecha.getTime())) {
    return res.status(400).json({
      message: "La fecha de efecto no es válida",
    });
  }

  // 4️⃣ Prima neta válida
  const prima = Number(primaNeta);
  if (isNaN(prima) || prima <= 0) {
    return res.status(400).json({
      message: "La prima neta debe ser un número mayor que 0",
    });
  }

  next();
};
