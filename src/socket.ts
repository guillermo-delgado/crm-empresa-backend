import { Server } from "socket.io";

let io: Server | null = null;

/**
 * 🔹 NUEVO
 * Permite registrar la instancia creada en server.ts
 * (uso principal en producción)
 */
export const setIO = (ioInstance: Server) => {
  io = ioInstance;
};

/**
 * 🔹 EXISTENTE
 * Inicialización alternativa (si algún día la usas)
 * NO se elimina para no romper nada
 */
export const initSocket = (server: any) => {
  // ⚠️ Evitar doble inicialización
  if (io) return io;

  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("🟢 Socket conectado:", socket.id);
  });

  return io;
};

/**
 * 🔹 EXISTENTE
 * Obtener la instancia activa (controllers)
 */
export const getIO = (): Server => {
  if (!io) {
    throw new Error("Socket.IO no inicializado");
  }
  return io;
};
