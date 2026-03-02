import { Router } from "express";
import multer from "multer";
import { procesarMapfreVida } from "./mapfreVida.controller";

import { authMiddleware, adminOnly } from "../../../middlewares/auth";

const router = Router();
const upload = multer();

router.post(
  "/mapfre-vida",
  authMiddleware,
  adminOnly,
  upload.single("file"),
  procesarMapfreVida
);

export default router;