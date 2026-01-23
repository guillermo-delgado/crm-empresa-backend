import { Router } from "express";
import { login, logout, refreshToken } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth";

const router = Router();

router.post("/login", login);
router.post("/refresh", refreshToken);
router.post("/logout", authMiddleware, logout);

export default router;
