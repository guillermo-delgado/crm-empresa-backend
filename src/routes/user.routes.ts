import { Router } from "express";
import {
  crearUsuario,
  listarUsuariosAsignables,
} from "../controllers/user.controller";
import { authMiddleware, adminOnly } from "../middlewares/auth";

const router = Router();

/* =========================
   CREAR USUARIO (ADMIN)
========================= */
router.post("/", authMiddleware, adminOnly, crearUsuario);

/* =========================
   LISTAR USUARIOS ASIGNABLES (ADMIN)
========================= */
router.get(
  "/asignables",
  authMiddleware,
  adminOnly,
  listarUsuariosAsignables
);

export default router;
