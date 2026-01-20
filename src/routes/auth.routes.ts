import { Router } from "express";
import { login, logout } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth";

const router = Router();

/* =========================
   LOGIN
========================= */
router.post("/login", login);

/* =========================
   LOGOUT
========================= */
router.post("/logout", authMiddleware, logout);

export default router;
