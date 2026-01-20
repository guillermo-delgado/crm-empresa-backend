import { Router } from "express";
import {
  crearUsuario,
  listarUsuariosAsignables,
  actualizarConfigLaboral,
  obtenerUsuario,
} from "../controllers/user.controller";
import { authMiddleware, adminOnly } from "../middlewares/auth";

const router = Router();

/* =========================
   CREAR USUARIO (ADMIN)
========================= */
router.post(
  "/",
  authMiddleware,
  adminOnly,
  crearUsuario
);

/* =========================
   LISTAR USUARIOS (ADMIN / CRM)
========================= */
router.get(
  "/asignables",
  authMiddleware,
  adminOnly,
  listarUsuariosAsignables
);

router.get(
  "/:id",
  authMiddleware,
  adminOnly,
  obtenerUsuario
);

/* =========================
   ✏️ CONFIGURACIÓN LABORAL
   PUT /api/users/:id/config
========================= */
router.put(
  "/:id/config",
  authMiddleware,
  adminOnly,
  actualizarConfigLaboral
);



export default router;
