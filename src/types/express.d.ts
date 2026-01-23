import { Types } from "mongoose";

declare global {
  namespace Express {
    interface User {
      id: string;
      role: "admin" | "empleado" | "colaborador";
      nombre: string; 
    }

    interface Request {
      user?: User;
    }
  }
}

export {};

