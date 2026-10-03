import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth";

import {
  crearSorteo,
  listarSorteos,
  obtenerSorteo,
  actualizarSorteo,
  importarParticipantes,
  agregarParticipanteManual,
  actualizarParticipante,
  eliminarParticipante,
  realizarSorteo,
  repetirSorteo,
  recalcularParticipaciones,
  eliminarSorteo,
} from "./sorteos.controller";

const router = Router();

/* =========================
   AUTENTICACIÓN
========================= */

router.use(authMiddleware);

/* =========================
   LECTURA (cualquier usuario con sesión)
========================= */

// GET /api/crm/sorteos
router.get("/", listarSorteos);

// GET /api/crm/sorteos/:id
router.get("/:id", obtenerSorteo);

/* =========================
   A PARTIR DE AQUÍ: SOLO ADMINISTRADOR
========================= */

router.use((req, res, next) =>
  (req as any).user?.role === "admin"
    ? next()
    : res.status(403).json({ message: "Solo el administrador puede gestionar sorteos." })
);

// POST /api/crm/sorteos
router.post("/", crearSorteo);

// PUT /api/crm/sorteos/:id
router.put("/:id", actualizarSorteo);

// DELETE /api/crm/sorteos/:id
router.delete("/:id", eliminarSorteo);

/* =========================
   PARTICIPANTES
========================= */

// POST /api/crm/sorteos/:id/importar
router.post("/:id/importar", importarParticipantes);

// POST /api/crm/sorteos/:id/recalcular
router.post("/:id/recalcular", recalcularParticipaciones);

// POST /api/crm/sorteos/:id/participantes
router.post("/:id/participantes", agregarParticipanteManual);

// PATCH /api/crm/sorteos/:id/participantes/:participanteId
router.patch("/:id/participantes/:participanteId", actualizarParticipante);

// DELETE /api/crm/sorteos/:id/participantes/:participanteId
router.delete("/:id/participantes/:participanteId", eliminarParticipante);

/* =========================
   REALIZAR Y REPETIR SORTEO
========================= */

// POST /api/crm/sorteos/:id/realizar
router.post("/:id/realizar", realizarSorteo);

// Repetir el sorteo conservando todos los resultados anteriores.
router.post("/:id/repetir", repetirSorteo);

export default router;