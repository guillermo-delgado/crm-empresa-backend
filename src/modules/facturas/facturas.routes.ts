import { Router } from "express";
import multer from "multer";
import {
  procesarFactura,
  obtenerArchivoFactura
} from "./facturas.controller";
import { authMiddleware, adminOnly } from "../../middlewares/auth";

const router = Router();
const upload = multer();

/* =========================
   SUBIR Y PROCESAR FACTURA
========================= */
router.post(
  "/procesar",
  authMiddleware,
  adminOnly,
  upload.single("file"),
  procesarFactura
);

/* =========================
   OBTENER ARCHIVO (URL FIRMADA 5 MIN)
========================= */
router.get(
  "/:id/archivo",
  authMiddleware,
  adminOnly,
  obtenerArchivoFactura
);

export default router;