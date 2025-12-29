import { Router } from "express";
import {
  crearVenta,
  libroVentas,
  eliminarVenta,
  editarVenta,
} from "./ventas.controller";
import { authMiddleware, adminOnly } from "../../middlewares/auth";

const router = Router();

router.post("/", authMiddleware, adminOnly, crearVenta);
router.get("/libro", authMiddleware, adminOnly, libroVentas);
router.delete("/:id", authMiddleware, adminOnly, eliminarVenta);
router.put("/:id", authMiddleware, adminOnly, editarVenta);



export default router;
