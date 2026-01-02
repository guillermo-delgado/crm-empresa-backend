import { Router } from "express";
import {
  crearVenta,
  libroVentas,
  eliminarVenta,
  editarVenta,
} from "./ventas.controller";

import { authMiddleware } from "../../middlewares/auth";
import { adminOnly } from "../../middlewares/role.middleware";
import {
  validateCreateVenta,
  validateEditVenta,
} from "./ventas.validator";

const router = Router();

/* =========================
   CREAR VENTA
   - Empleado y Admin
========================= */
router.post(
  "/",
  authMiddleware,
  validateCreateVenta,
  crearVenta
);

/* =========================
   LIBRO DE VENTAS
   - Autenticado
   - Filtrado por rol en controller
========================= */
router.get(
  "/libro",
  authMiddleware,
  libroVentas
);

/* =========================
   EDITAR VENTA
   - Admin: edita directo
   - Empleado: crea solicitud (lógica en controller)
========================= */
router.put(
  "/:id",
  authMiddleware,
  validateEditVenta,
  editarVenta
);

/* =========================
   ELIMINAR VENTA
   - Admin: elimina directo
   - Empleado: crea solicitud (lógica en controller)
========================= */
router.delete(
  "/:id",
  authMiddleware,
  eliminarVenta
);

export default router;
