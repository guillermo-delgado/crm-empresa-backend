import { Router } from "express";
import multer from "multer";
import { requireJornadaActiva } from "../../middlewares/requireJornadaActiva";

import {
  crearVenta,
  libroVentas,
  eliminarVenta,
  editarVenta,
  obtenerVentaPorId,
  buscarVentas,
  obtenerSolicitudPendientePorVenta,
  contarRevisionesEmpleado,
  anularVenta,
  solicitarRehabilitacion,
  obtenerKPIsVentas,
  obtenerPolizasComparativa3Anios,
  obtenerVentaAdelantada, // 🔥 NUEVO CONTROLADOR
  descargarAdjuntoVenta,
} from "./ventas.controller";

import { authMiddleware } from "../../middlewares/auth";
import {
  validateCreateVenta,
  validateEditVenta,
} from "./ventas.validator";

const router = Router();
const uploadVentas = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 20,
  },
});

/* =========================
   SOLICITUDES EMPLEADOS
========================= */
router.get(
  "/revisiones-pendientes",
  authMiddleware,
  contarRevisionesEmpleado
);

/* =========================
   CREAR VENTA
========================= */
router.post(
  "/",
  authMiddleware,
  requireJornadaActiva,
  uploadVentas.any(),
  validateCreateVenta,
  crearVenta
);

/* =========================
   LIBRO DE VENTAS
========================= */
router.get(
  "/libro",
  authMiddleware,
  requireJornadaActiva,
  libroVentas
);

/* =========================
   KPIs COMPARATIVA AÑO ANTERIOR
========================= */
router.get(
  "/kpis",
  authMiddleware,
  requireJornadaActiva,
  obtenerKPIsVentas
);

/* =========================
   DASHBOARD · POLIZAS 3 AÑOS
========================= */
router.get(
  "/dashboard/polizas-3-anios",
  authMiddleware,
  requireJornadaActiva,
  obtenerPolizasComparativa3Anios
);

/* =========================
   🔥 DASHBOARD · VENTA ADELANTADA REAL
   - Filtra por createdAt del mes
   - fechaEfecto posterior
========================= */
router.get(
  "/dashboard/venta-adelantada",
  authMiddleware,
  requireJornadaActiva,
  obtenerVentaAdelantada
);

/* =========================
   BUSCADOR
========================= */
router.get(
  "/buscar",
  authMiddleware,
  buscarVentas
);

/* =========================
   EDITAR VENTA
========================= */
router.put(
  "/:id",
  authMiddleware,
  requireJornadaActiva,
  uploadVentas.any(),
  validateEditVenta,
  editarVenta
);

/* =========================
   ELIMINAR VENTA
========================= */
router.delete(
  "/:id",
  authMiddleware,
  requireJornadaActiva,
  eliminarVenta
);

/* =========================
   ANULAR VENTA
========================= */
router.post(
  "/:id/anular",
  authMiddleware,
  requireJornadaActiva,
  anularVenta
);

/* =========================
   OBTENER SOLICITUD PENDIENTE
========================= */
router.get(
  "/:ventaId/solicitud-pendiente",
  authMiddleware,
  requireJornadaActiva,
  obtenerSolicitudPendientePorVenta
);

/* =========================
   DESCARGAR ADJUNTO CIFRADO
========================= */
router.get(
  "/:id/adjuntos/:adjuntoId",
  authMiddleware,
  requireJornadaActiva,
  descargarAdjuntoVenta
);

/* =========================
   OBTENER VENTA POR ID
========================= */
router.get(
  "/:id",
  authMiddleware,
  requireJornadaActiva,
  obtenerVentaPorId
);

/* =========================
   MARCAR REVISIÓN COMO LEÍDA
========================= */
router.patch(
  "/:id/marcar-revision-leida",
  authMiddleware,
  requireJornadaActiva,
  async (req, res) => {
    const { marcarRevisionLeida } = await import("./ventas.controller");
    return marcarRevisionLeida(req, res);
  }
);

/* =========================
   SOLICITUD REHABILITAR
========================= */
router.post(
  "/:id/rehabilitar",
  authMiddleware,
  requireJornadaActiva,
  solicitarRehabilitacion
);

export default router;
