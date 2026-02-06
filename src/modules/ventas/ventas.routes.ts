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
  anularVenta,
  solicitarRehabilitacion,
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
   ANULAR VENTA
   - Admin: anula directo
   - Empleado: crea solicitud
   - 🔒 Requiere jornada activa
========================= */
router.post(
  "/:id/anular",
  authMiddleware,
  requireJornadaActiva,
  anularVenta
);


/* =========================
   OBTENER SOLICITUD PENDIENTE DE EDICIÓN (EMPLEADO)
========================= */
router.get(
  "/:ventaId/solicitud-pendiente",
  authMiddleware,
  requireJornadaActiva,
  obtenerSolicitudPendientePorVenta,
);


/* =========================
   OBTENER VENTA POR ID
   - Autenticado
========================= */
router.get(
  "/:id",
  authMiddleware,
  requireJornadaActiva,
  obtenerVentaPorId,
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


// SOLICITUD REHABILITAR

router.post(
  "/:id/rehabilitar",
  authMiddleware,
  requireJornadaActiva,
  solicitarRehabilitacion
);



export default router;
