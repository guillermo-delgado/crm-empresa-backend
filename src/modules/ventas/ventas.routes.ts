import { Router } from "express";
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
} from "./ventas.controller";



import { authMiddleware } from "../../middlewares/auth";
import {
  validateCreateVenta,
  validateEditVenta,
} from "./ventas.validator";

const router = Router();

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
  requireJornadaActiva,
  libroVentas
);

/* =========================
   BUSCADOR
   - PÓLIZA
   - NIF, NIE, CIF
   - NOMBRE
========================= */

router.get("/buscar", authMiddleware, buscarVentas);



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
  obtenerSolicitudPendientePorVenta,
  requireJornadaActiva,
);


/* =========================
   OBTENER VENTA POR ID
   - Autenticado
========================= */
router.get(
  "/:id",
  authMiddleware,
  obtenerVentaPorId,
  requireJornadaActiva,
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
