import ventasRoutes from "./modules/ventas/ventas.routes";
import express from "express";
import userRoutes from "./routes/user.routes";
import authRoutes from "./routes/auth.routes";
import solicitudesRoutes from "./modules/solicitudes/solicitudes.routes";

const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/ventas", ventasRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/solicitudes", solicitudesRoutes);

export default app;
