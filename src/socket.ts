import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";

let io: Server | null = null;

/**
 * 🔹 Registrar la instancia creada en server.ts
 */
export const setIO = (ioInstance: Server) => {
  io = ioInstance;
};

/**
 * 🔹 Inicialización alternativa (legacy / local)
 */
export const initSocket = (server: any) => {
  if (io) return io;

  const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_URL_PROD,
  ].filter(Boolean);

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
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

  io.on("connection", (socket: Socket) => {
    console.log("🟢 Socket conectado:", socket.id);

    let userId: string | null = null;

    /* ======================================================
       1️⃣ auth.userId (legacy)
    ====================================================== */
    if (typeof socket.handshake.auth?.userId === "string") {
      userId = socket.handshake.auth.userId;
    }

    /* ======================================================
       2️⃣ query.userId (legacy)
    ====================================================== */
    if (!userId && typeof socket.handshake.query?.userId === "string") {
      userId = socket.handshake.query.userId;
    }

    /* ======================================================
       3️⃣ JWT (FUENTE CANÓNICA)
    ====================================================== */
    if (!userId) {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token;

      if (typeof token === "string") {
        try {
          const payload: any = jwt.verify(
            token,
            process.env.JWT_SECRET as string
          );
          userId = payload.id;
        } catch {
          userId = null;
        }
      }
    }

    /* ======================================================
       🏠 ROOM DE USUARIO (UNIFICADA)
    ====================================================== */
    if (userId) {
      socket.data.userId = userId;

      const room = `user:${userId}`;
      socket.join(room);

      console.log(`👤 Socket unido a room ${room}`);
    } else {
      console.log("⚠️ Socket SIN usuario válido");
    }

    socket.on("disconnect", () => {
      console.log("🔴 Socket desconectado:", socket.id);
    });
  });

  return io;
};

/**
 * 🔹 Obtener la instancia activa
 */
export const getIO = (): Server => {
  if (!io) {
    throw new Error("Socket.IO no inicializado");
  }
  return io;
};
