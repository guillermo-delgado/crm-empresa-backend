import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import ventasRoutes from "./modules/ventas/ventas.routes";
import solicitudesRoutes from "./modules/solicitudes/solicitudes.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ventas", ventasRoutes);
app.use("/api/solicitudes", solicitudesRoutes);

export default app;
