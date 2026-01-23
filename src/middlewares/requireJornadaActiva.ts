import { Response, NextFunction } from "express";
import RegistroHorario from "../models/RegistroHorario";
import IntentoFraude from "../models/IntentoFraude";

/**
 * 🧾 Registrar intento antifraude
 * (NO bloquea el flujo si falla)
 */
const registrarFraude = async (
  req: any,
  motivo: string
) => {
  try {
    await IntentoFraude.create({
      usuario: req.user?.id || "desconocido",
      ruta: req.originalUrl,
      metodo: req.method,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      motivo,
    });
  } catch (error) {
    console.error("⚠️ Error registrando intento de fraude:", error);
  }
};

/**
 * 🔐 Middleware: requiere jornada activa para acceder al CRM
 * - Admin: siempre permitido
 * - Empleado: solo si está DENTRO de jornada hoy
 * - Registra intentos fuera de jornada (antifraude)
 */
export const requireJornadaActiva = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    /* =========================
       🔒 Seguridad básica
    ========================= */
    if (!req.user) {
      return res.status(401).json({
        message: "No autenticado",
      });
    }

    /* =========================
       👑 ADMIN → acceso total
    ========================= */
    if (req.user.role === "admin") {
      return next();
    }

/* =========================
   📱 BLOQUEO MÓVIL / TABLET
   - Empleados NO pueden acceder
========================= */
const userAgent = req.headers["user-agent"] || "";

const esMovilOTablet =
  /android|iphone|ipad|ipod|mobile|tablet/i.test(userAgent);

if (req.user.role === "empleado" && esMovilOTablet) {
  await registrarFraude(req, "ACCESO_MOBILE_CRM");

  return res.status(403).json({
    message: "Acceso no permitido desde dispositivos móviles",
  });
}


    /* =========================
       👤 Solo EMPLEADOS
    ========================= */
    if (req.user.role !== "empleado") {
      return res.status(403).json({
        message: "Acceso no permitido",
      });
    }

    /* =========================
       📅 Registro de HOY
    ========================= */
    const hoy = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD


    const registro = await RegistroHorario.findOne({
      usuario: req.user.id,
      fecha: hoy,
    }).lean();

    /* =========================
       ❌ Sin jornada hoy
    ========================= */
    if (!registro || !registro.fichajes?.length) {
      await registrarFraude(req, "SIN_JORNADA");

      return res.status(403).json({
        message: "Fuera de jornada",
      });
    }

/* =========================
   ⏱️ Último fichaje ACTIVO
========================= */
const fichajesActivos = registro.fichajes.filter(
  (f: any) => f.activo !== false
);

if (!fichajesActivos.length) {
  await registrarFraude(req, "SIN_JORNADA_ACTIVA");

  return res.status(403).json({
    message: "Fuera de jornada",
  });
}

const ultimo = fichajesActivos[fichajesActivos.length - 1];

if (ultimo.tipo !== "ENTRADA") {
  await registrarFraude(req, "FUERA_JORNADA");

  return res.status(403).json({
    message: "Fuera de jornada",
  });
}

    /* =========================
       ✅ Jornada activa
    ========================= */
    next();
  } catch (error) {
    console.error("❌ Error comprobando jornada:", error);

    return res.status(500).json({
      message: "Error comprobando jornada",
    });
  }
};
