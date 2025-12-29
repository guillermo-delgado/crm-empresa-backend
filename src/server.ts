import "dotenv/config";
import app from "./app";
import { connectDB } from "./config/database";

const PORT = process.env.PORT || 3001;

(async () => {
  try {
    await connectDB();
    console.log("Base de datos conectada");

    app.listen(PORT, () => {
      console.log(`Servidor escuchando en puerto ${PORT}`);
    });
  } catch (error) {
    console.error("Error al iniciar el servidor:", error);
    process.exit(1);
  }
})();
