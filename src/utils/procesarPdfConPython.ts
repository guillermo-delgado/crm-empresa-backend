import { spawn, execSync } from "child_process";
import path from "path";

type ProgresoPython = {
  fase: string;
  porcentaje: number;
  texto: string;
};

export const procesarPdfConPython = (
  pdfBuffer: Buffer,
  onProgress?: (progreso: ProgresoPython) => void
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(
      process.cwd(),
      "python",
      "procesar_mapfre.py"
    );

    const pythonCommand =
      process.env.PYTHON_COMMAND || "python3";

    console.log("🐍 PYTHON COMMAND:", pythonCommand);
    console.log("🐍 PYTHON SCRIPT:", scriptPath);

    try {
      const version = execSync(`${pythonCommand} --version`, {
        encoding: "utf8",
      });

      console.log("🐍 PYTHON VERSION:", version.trim());
    } catch (error) {
      console.error("❌ PYTHON NO DISPONIBLE:", pythonCommand);
      return reject(
        new Error(`Python no disponible: ${pythonCommand}`)
      );
    }

    const python = spawn(
      pythonCommand,
      [scriptPath, "--stdin"],
      {
        cwd: process.cwd(),
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    let finalizado = false;

    python.stdout.on("data", (data) => {
      stdout += data.toString("utf8");
    });

    python.stderr.on("data", (data) => {
      const msg = data.toString("utf8");
      stderr += msg;

      msg
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter(Boolean)
        .forEach((line: string) => {
          if (line.startsWith("PROGRESO|")) {
            const [, fase, porcentajeRaw, mensaje] =
              line.split("|");

            const porcentaje = Number(porcentajeRaw);

            console.log(`⏳ ${porcentaje}% - ${mensaje}`);

            if (onProgress && !Number.isNaN(porcentaje)) {
              onProgress({
                fase: fase || "OCR",
                porcentaje,
                texto: mensaje || "Procesando PDF...",
              });
            }

            return;
          }

          if (
            line.includes("ERROR") ||
            line.includes("Traceback") ||
            line.includes("Exception")
          ) {
            console.error("🐍 Python:", line);
          }
        });
    });

    python.on("error", (error) => {
      if (finalizado) return;
      finalizado = true;

      console.error("❌ Error ejecutando Python:", error);

      return reject(error);
    });

    python.on("close", (code) => {
      if (finalizado) return;
      finalizado = true;

      if (code !== 0) {
        console.error("⚠️ Python terminó con código:", code);
        console.error(
          "⚠️ STDERR Python:",
          stderr || "STDERR vacío"
        );
        console.error(
          "⚠️ STDOUT Python:",
          stdout || "STDOUT vacío"
        );

        return reject(
          new Error(
            `Python terminó con código ${code}. STDERR: ${
              stderr || "vacío"
            }`
          )
        );
      }

      try {
        return resolve(JSON.parse(stdout));
      } catch (error) {
        console.error("❌ Python no devolvió JSON válido");
        console.error(
          "⚠️ STDOUT Python:",
          stdout || "STDOUT vacío"
        );
        console.error(
          "⚠️ STDERR Python:",
          stderr || "STDERR vacío"
        );

        return reject(error);
      }
    });

    python.stdin.on("error", (error) => {
      console.error("❌ Error enviando PDF a Python:", error);
    });

    python.stdin.write(pdfBuffer);
    python.stdin.end();
  });
};