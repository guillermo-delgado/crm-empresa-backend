import { Router } from "express";
import {
  crearVenta,
  libroVentas,
  eliminarVenta,
  editarVenta,
} from "./ventas.controller";

import { authMiddleware } from "../../middlewares/auth";
import { adminOnly } from "../../middlewares/role.middleware";

const router = Router();

// Crear venta → empleado + admin
router.post("/", authMiddleware, crearVenta);

// Libro de ventas → autenticado (filtras por rol dentro)
router.get("/libro", authMiddleware, libroVentas);

// Editar venta → solo admin
router.put("/:id", authMiddleware, editarVenta);

// Eliminar venta → solo admin
router.delete("/:id", authMiddleware, eliminarVenta);

export default router;
