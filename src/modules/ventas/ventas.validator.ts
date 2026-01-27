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
    documentoFiscal,
    primaNeta,
    formaPago,
    actividad,
  } = req.body;

  // 2️⃣ Campos obligatorios SOLO para crear
  const requiredFields = {
    fechaEfecto,
    aseguradora,
    ramo,
    numeroPoliza,
    tomador,
    documentoFiscal,
    primaNeta,
    formaPago,
    actividad,
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

  // 4️⃣ Prima válida
  const prima = Number(primaNeta);
  if (isNaN(prima) || prima <= 0) {
    return res.status(400).json({
      message: "La prima neta debe ser un número mayor que 0",
    });
  }

  if (typeof documentoFiscal !== "string" || documentoFiscal.trim().length < 9) {
  return res.status(400).json({
    message: "El NIF / NIE / CIF no es válido",
  });
}


  // 5️⃣ Actividad válida
 const actividadesPermitidas = [
  "RECOMENDADO",
  "SGC",
  "OFICINA",
  "TELEFONICO",
  "INTERNET",
  "RED PERSONAL",
  "FINCAS",
  "COLABORADORES",
];


  if (!actividadesPermitidas.includes(actividad)) {
    return res.status(400).json({
      message: "La actividad no es válida",
      actividadesPermitidas,
    });
  }

  next();
};

export const validateEditVenta = (
  
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log("🧪 VALIDATE EDIT BODY:", req.body);

  const {
    fechaEfecto,
    primaNeta,
    actividad,
    documentoFiscal,
  } = req.body;

  // 📅 Fecha (si viene)
  if (fechaEfecto) {
    const fecha = new Date(fechaEfecto);
    if (isNaN(fecha.getTime())) {
      return res.status(400).json({
        message: "La fecha de efecto no es válida",
      });
    }
  }

  // 💰 Prima (si viene)
  if (primaNeta !== undefined) {
    const prima = Number(primaNeta);
    if (isNaN(prima) || prima <= 0) {
      return res.status(400).json({
        message: "La prima neta debe ser un número mayor que 0",
      });
    }
  }

  // 🆔 Documento fiscal (si viene)
if (documentoFiscal !== undefined) {
  const doc = documentoFiscal.trim();

  if (doc !== "" && doc.length < 9) {
    return res.status(400).json({
      message: "El NIF / NIE / CIF no es válido",
    });
  }
}



  // 🏷️ Actividad (si viene)
  if (actividad) {
    const actividadesPermitidas = [
      "RECOMENDADO",
      "SGC",
      "OFICINA",
      "TELEFONICO",
      "INTERNET",
      "RED PERSONAL",
      "FINCAS",
      "COLABORADORES",
    ];

    if (!actividadesPermitidas.includes(actividad)) {
      return res.status(400).json({
        message: "La actividad no es válida",
        actividadesPermitidas,
      });
    }
  }

  next();
};

