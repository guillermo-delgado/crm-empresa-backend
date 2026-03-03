import dotenv from "dotenv";
dotenv.config();



import http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
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
        origin: "*",
        credentials: true,
      },
    });

    setIO(io);

    io.use((socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        if (!token) {
          return next(new Error("No token"));
        }

        const decoded: any = jwt.verify(
          token,
          process.env.JWT_SECRET as string
        );

        socket.data.userId = decoded.id;
        next();
      } catch (err) {
        next(new Error("Unauthorized"));
      }
    });

    io.on("connection", (socket) => {
      const userId = socket.data.userId;

      console.log("🟢 Cliente conectado:", socket.id, "Usuario:", userId);

      socket.join(`user:${userId}`);

      console.log("🏠 Socket unido a room:", `user:${userId}`);

      socket.emit("test_event", "✅ Socket funcionando correctamente");
    });

    setTimeout(() => {
      try {
        getIO().emit("test_event", "✅ Socket funcionando correctamente");
        console.log("🔔 Evento test_event emitido");
      } catch {
        console.warn("⚠️ No se pudo emitir test_event");
      }
    }, 3000);

    server.listen(PORT, () => {
      console.log(`🚀 Backend escuchando en puerto ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Error arrancando servidor:", error);
    process.exit(1);
  }
})();