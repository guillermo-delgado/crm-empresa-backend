import { Types } from "mongoose";

declare global {
  namespace Express {
    interface User {
      id: string;
      role: "admin" | "empleado" | "colaborador";
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
