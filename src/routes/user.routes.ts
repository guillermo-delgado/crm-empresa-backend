import { Router } from "express";
import { crearUsuario } from "../controllers/user.controller";
import { authMiddleware, adminOnly } from "../middlewares/auth";

const router = Router();

router.post("/", authMiddleware, adminOnly, crearUsuario);

export default router;
