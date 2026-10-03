// modules/horario/horario.routes.ts

import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth";

// 👇 CONTROLADORES NORMALES (empleado)
import {
  fichar,
  pausar,
  obtenerHoy,
  historialMensual,
} from "./horario.controller";

// 👇 CONTROLADORES CRM (admin / visual)
import {
  obtenerCalendarioGeneral,
} from "./horario.crm.controller";

const router = Router();

/* =========================
   🔒 TODAS REQUIEREN LOGIN
========================= */
router.use(authMiddleware);

/* =========================
   ⏱️ FICHAR (ENTRADA / SALIDA)
   POST /api/horario/fichar
========================= */
router.post("/fichar", fichar);

/* =========================
   ☕ PAUSA (salir del puesto un rato)
   POST /api/horario/pausa  { motivo }
   Para volver se usa /fichar
========================= */
router.post("/pausa", pausar);

/* =========================
   📅 MI ESTADO DE HOY
   GET /api/horario/hoy
========================= */
router.get("/hoy", obtenerHoy);

/* =========================
   📊 HISTORIAL MENSUAL (MIYO)
   GET /api/horario/historial?mes=YYYY-MM
========================= */
router.get("/historial", historialMensual);

/* =========================
   📆 CALENDARIO GENERAL (CRM / ADMIN)
   GET /api/horario/crm/calendario-general?mes=YYYY-MM
========================= */
router.get(
  "/crm/calendario-general",
  obtenerCalendarioGeneral
);

/* =========================
   📆 CALENDARIO GENERAL (EMPLEADO)
   GET /api/horario/calendario-general?mes=YYYY-MM
========================= */
router.get(
  "/calendario-general",
  obtenerCalendarioGeneral
);

export default router;