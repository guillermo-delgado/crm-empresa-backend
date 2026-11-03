import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth";
import {
  listarNotas,
  crearNota,
  actualizarNota,
  eliminarNota,
} from "./agenda.controller";

const router = Router();

/* =========================
   🔒 TODAS REQUIEREN LOGIN
========================= */
router.use(authMiddleware);

// GET    /api/agenda
router.get("/", listarNotas);

// POST   /api/agenda
router.post("/", crearNota);

// PATCH  /api/agenda/:id
router.patch("/:id", actualizarNota);

// DELETE /api/agenda/:id
router.delete("/:id", eliminarNota);

export default router;