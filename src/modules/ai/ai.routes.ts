import { Router } from "express";
import multer from "multer";
import { analyzeDocumentController } from "./ai.controller";
import { authMiddleware, adminOnly } from "../../middlewares/auth";

const router = Router();
const upload = multer();

/*
   🔐 Protección:
   - JWT válido
   - Solo admin
*/
router.post(
  "/analyze",
  authMiddleware,
  adminOnly,
  upload.single("file"),
  analyzeDocumentController
);

/*
   👇 Export NOMBRADO
   Esto es lo que tu app.ts espera
*/
export const aiRoutes = router;