import { spawn } from "child_process";
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
    const scriptPath = path.join(process.cwd(), "python", "procesar_mapfre.py");

    const pythonCommand = process.env.PYTHON_COMMAND || "python";
    console.log("🐍 PYTHON COMMAND:", pythonCommand);
console.log("🐍 PYTHON SCRIPT:", scriptPath);

const python = spawn(pythonCommand, [scriptPath, "--stdin"], {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    python.stderr.on("data", (data) => {
      const msg = data.toString();
      stderr += msg;

      msg
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter(Boolean)
        .forEach((line: string) => {
          if (line.startsWith("PROGRESO|")) {
            const [, fase, porcentajeRaw, mensaje] = line.split("|");

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
      console.error("❌ Error ejecutando Python:", error);
      reject(error);
    });

    python.on("close", (code) => {
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
  } catch (e) {
    console.error("❌ Python no devolvió JSON válido");

    console.error(
      "⚠️ STDOUT Python:",
      stdout || "STDOUT vacío"
    );

    console.error(
      "⚠️ STDERR Python:",
      stderr || "STDERR vacío"
    );

    return reject(e);
  }
});

    python.stdin.write(pdfBuffer);
    python.stdin.end();
  });
};