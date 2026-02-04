import { Router } from "express";
import {
  listarSolicitudesPendientes,
  aprobarSolicitud,
  rechazarSolicitud,
} from "./solicitudes.controller";
import { authMiddleware } from "../../middlewares/auth";



const router = Router();

/* 🔐 AUTH GLOBAL */
router.use(authMiddleware);



/* =========================
   LISTAR SOLICITUDES (ADMIN)
   - EDITAR_VENTA
   - ELIMINAR_VENTA
   - ANULAR_VENTA 🆕
========================= */
router.get("/", listarSolicitudesPendientes);

/* =========================
   APROBAR SOLICITUD (ADMIN)
   - EDITAR → aplica cambios
   - ELIMINAR → borra venta
   - ANULAR → marca venta como ANULADA 🆕
========================= */
router.post("/:id/aprobar", aprobarSolicitud);

/* =========================
   RECHAZAR SOLICITUD (ADMIN)
   - Cualquier tipo
========================= */
router.post("/:id/rechazar", rechazarSolicitud);

export default router;
