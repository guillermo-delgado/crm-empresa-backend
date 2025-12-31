import { Router } from "express";
import {
  listarSolicitudesPendientes,
  aprobarSolicitud,
  rechazarSolicitud,
} from "./solicitudes.controller";
import { authMiddleware } from "../../middlewares/auth";

const router = Router();

/* =========================
   LISTAR SOLICITUDES (ADMIN)
========================= */
router.get("/", authMiddleware, listarSolicitudesPendientes);

/* =========================
   APROBAR SOLICITUD
========================= */
router.post("/:id/aprobar", authMiddleware, aprobarSolicitud);

/* =========================
   RECHAZAR SOLICITUD
========================= */
router.post("/:id/rechazar", authMiddleware, rechazarSolicitud);

export default router;
