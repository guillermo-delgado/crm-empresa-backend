// modules/horario/horario.crm.routes.ts

import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth";
import { adminOnly } from "../../middlewares/role.middleware";

import {
  editarFichaje,
  eliminarFichaje,
  obtenerEmpleados,
  obtenerCalendarioEmpleado,
  obtenerCalendarioGeneral,
  marcarDia,
  eliminarDia,
} from "./horario.crm.controller";

const router = Router();

/* =========================
   🔒 SOLO ADMIN CRM
========================= */
router.use(authMiddleware);
router.use(adminOnly);

/* =========================
   👥 EMPLEADOS
   GET /api/horario/crm/empleados
========================= */
router.get("/empleados", obtenerEmpleados);

/* =========================
   📅 CALENDARIO EMPLEADO / MES
   GET /api/horario/crm?mes=YYYY-MM&empleadoId=ID?
========================= */
router.get("/", obtenerCalendarioEmpleado);

/* =========================
   📆 CALENDARIO GENERAL (VISUAL)
   GET /api/horario/crm/calendario-general?mes=YYYY-MM
========================= */
router.get(
  "/calendario-general",
  obtenerCalendarioGeneral
);

/* =========================
   ✏️ EDITAR FICHAJE
   PUT /api/horario/crm/:registroId/fichaje/:fichajeId
========================= */
router.put(
  "/:registroId/fichaje/:fichajeId",
  editarFichaje
);

/* =========================
   🗑️ ELIMINAR FICHAJE
   DELETE /api/horario/crm/:registroId/fichaje/:fichajeId
========================= */
router.delete(
  "/:registroId/fichaje/:fichajeId",
  eliminarFichaje
);

/* =========================
   🏖️ MARCAR DÍA (VACACIONES / LIBRE / BAJA)
   POST /api/horario/crm/dia
========================= */
router.post("/dia", marcarDia);

/* =========================
   ❌ ELIMINAR MARCA DE DÍA
   DELETE /api/horario/crm/dia
========================= */
router.delete("/dia", eliminarDia);

export default router;
