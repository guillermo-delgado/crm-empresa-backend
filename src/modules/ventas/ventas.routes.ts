import { Router } from "express";
import { requireJornadaActiva } from "../../middlewares/requireJornadaActiva";
import { obtenerSolicitudPendientePorVenta } from "./ventas.controller";



import {
  crearVenta,
  libroVentas,
  eliminarVenta,
  editarVenta,
  obtenerVentaPorId,
} from "./ventas.controller";


import { authMiddleware } from "../../middlewares/auth";
import {
  validateCreateVenta,
  validateEditVenta,
} from "./ventas.validator";

const router = Router();

/* =========================
   CREAR VENTA
   - Empleado y Admin
   - 🔒 Requiere jornada activa
========================= */
router.post(
  "/",
  authMiddleware,
  requireJornadaActiva,
  validateCreateVenta,
  crearVenta
);

/* =========================
   LIBRO DE VENTAS
   - Autenticado
========================= */
router.get(
  "/libro",
  authMiddleware,
  libroVentas
);



/* =========================
   EDITAR VENTA
   - Admin: edita directo
   - Empleado: crea solicitud
   - 🔒 Requiere jornada activa
========================= */
router.put(
  "/:id",
  authMiddleware,
  requireJornadaActiva,
  validateEditVenta,
  editarVenta
);

/* =========================
   ELIMINAR VENTA
   - Admin: elimina directo
   - Empleado: crea solicitud
   - 🔒 Requiere jornada activa
========================= */
router.delete(
  "/:id",
  authMiddleware,
  requireJornadaActiva,
  eliminarVenta
);

/* =========================
   OBTENER SOLICITUD PENDIENTE DE EDICIÓN (EMPLEADO)
========================= */
router.get(
  "/:ventaId/solicitud-pendiente",
  authMiddleware,
  obtenerSolicitudPendientePorVenta
);


/* =========================
   OBTENER VENTA POR ID
   - Autenticado
========================= */
router.get(
  "/:id",
  authMiddleware,
  obtenerVentaPorId
);

/* =========================
   MARCAR REVISIÓN COMO LEÍDA
   - Empleado propietario
   - 🔒 Requiere jornada activa
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

export default router;
