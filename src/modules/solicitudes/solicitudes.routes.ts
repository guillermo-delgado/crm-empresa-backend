import { Router } from "express";
import {
  listarSolicitudesPendientes,
  aprobarSolicitud,
  rechazarSolicitud,
} from "./solicitudes.controller";
import { authMiddleware } from "../../middlewares/auth";

const router = Router();

/* 🔐 AUTH GLOBAL PARA TODAS LAS RUTAS */
router.use(authMiddleware);

/* =========================
   LISTAR SOLICITUDES (ADMIN)
========================= */
router.get("/", listarSolicitudesPendientes);

/* =========================
   APROBAR SOLICITUD
========================= */
router.post("/:id/aprobar", aprobarSolicitud);

/* =========================
   RECHAZAR SOLICITUD
========================= */
router.post("/:id/rechazar", rechazarSolicitud);




export default router;
