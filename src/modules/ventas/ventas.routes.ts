import { Router } from "express";
import {
  crearVenta,
  libroVentas,
  eliminarVenta,
  editarVenta,
} from "./ventas.controller"; // 👈 MISMO DIRECTORIO

import { authMiddleware, adminOnly } from "../../middlewares/auth";

const router = Router();

router.post("/", authMiddleware, crearVenta); // empleado + admin
router.get("/libro", authMiddleware, libroVentas); // control por rol dentro
router.put("/:id", authMiddleware, adminOnly); // solo admin
router.delete("/:id", authMiddleware, adminOnly);


export default router;
