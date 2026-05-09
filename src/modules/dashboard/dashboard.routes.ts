import { Router } from "express";
import { getFacturacionDashboard } from "./dashboard.controller";

import { authMiddleware, adminOnly } from "../../middlewares/auth";

const router = Router();

/* =========================
   DASHBOARD FACTURACIÓN
   SOLO ADMIN
========================= */

router.get(
  "/facturacion",
  authMiddleware,
  adminOnly,
  getFacturacionDashboard
);

export default router;