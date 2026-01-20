import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import ventasRoutes from "./modules/ventas/ventas.routes";
import solicitudesRoutes from "./modules/solicitudes/solicitudes.routes";

// ⏱️ Horario trabajador
import horarioRoutes from "./modules/horario/horario.routes";

// 🖥️ Horario CRM (ADMIN)
import horarioCrmRoutes from "./modules/horario/horario.crm.routes";
import fichajesCrmRoutes from "./modules/horario/fichajes.crm.routes";


const app = express();

/* =========================
   CORS (LOCAL + PRODUCCIÓN)
========================= */
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_PROD,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // permitir llamadas internas (Postman, server-to-server, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());

/* =========================
   ROUTES
========================= */
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ventas", ventasRoutes);
app.use("/api/solicitudes", solicitudesRoutes);

// 👷 Trabajador
app.use("/api/horario", horarioRoutes);

// 🧑‍💼 CRM / Admin
app.use("/api/crm/horario", horarioCrmRoutes);
app.use("/api/crm/fichajes", fichajesCrmRoutes);


export default app;
