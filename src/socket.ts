import { Server } from "socket.io";

let io: Server | null = null;

/**
 * 🔹 Registrar la instancia creada en server.ts
 * (uso principal en producción)
 */
export const setIO = (ioInstance: Server) => {
  io = ioInstance;
};

/**
 * 🔹 Inicialización alternativa (legacy / local)
 * NO se elimina para no romper nada
 */
export const initSocket = (server: any) => {
  // ⚠️ Evitar doble inicialización
  if (io) return io;

  const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_URL_PROD,
  ].filter(Boolean);

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        // permitir llamadas internas (Postman, cron, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("🟢 Socket conectado:", socket.id);
  });

  return io;
};

/**
 * 🔹 Obtener la instancia activa (controllers)
 */
export const getIO = (): Server => {
  if (!io) {
    throw new Error("Socket.IO no inicializado");
  }
  return io;
};
