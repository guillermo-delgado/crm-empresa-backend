import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User";
import "dotenv/config";

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI!);

  const password = await bcrypt.hash("admin123", 10);

  await User.create({
    nombre: "Guillermo Delgado",
    email: "aptoguillermo@gmail.com",
    password,
    role: "admin",
  });

  console.log("ADMIN creado");
  process.exit();
};

run();
