import dotenv from "dotenv";
dotenv.config();

import http from "http";
import { Server } from "socket.io";
import app from "./app";
import { connectDB } from "./config/database";
import { setIO, getIO } from "./socket";

const PORT = process.env.PORT || 3001;

(async () => {
  try {
    // 🔹 Conectar a MongoDB
    await connectDB();

    // 🔹 Crear servidor HTTP
    const server = http.createServer(app);

    // 🔹 Inicializar Socket.IO
    const io = new Server(server, {
      cors: {
        origin: "*", // luego lo afinamos si quieres
      },
    });

    // 🔹 Registrar IO para uso global (controllers)
    setIO(io);

    // 🔹 Eventos de conexión
    io.on("connection", (socket) => {
      console.log("🟢 Cliente conectado:", socket.id);

      socket.on("disconnect", () => {
        console.log("🔴 Cliente desconectado:", socket.id);
      });
    });

    // 🔔 EVENTO DE PRUEBA (TEMPORAL)
    setTimeout(() => {
      try {
        getIO().emit("test_event", "✅ Socket funcionando correctamente");
        console.log("🔔 Evento test_event emitido");
      } catch (e) {
        console.warn("⚠️ No se pudo emitir test_event");
      }
    }, 3000);

    // 🔹 Arrancar servidor
    server.listen(PORT, () => {
      console.log(`🚀 Backend escuchando en puerto ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Error arrancando servidor:", error);
    process.exit(1);
  }
})();
