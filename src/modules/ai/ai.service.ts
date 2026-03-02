import OpenAI from "openai";
import { DocumentoContable } from "./ai.types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzeDocumentWithAI(
  structuredText: string
): Promise<DocumentoContable> {

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `
Eres un auditor financiero experto en liquidaciones aseguradoras.

Recibirás datos estructurados en formato <ROW>.

NO debes interpretar.
NO debes inventar.
NO debes completar campos inexistentes.

Tu trabajo es estrictamente matemático.

REGLAS OBLIGATORIAS:

1) Usa TODAS las filas <ROW>.
2) Si una cifra no existe explícitamente, usa 0.
3) No redondees salvo que el documento ya esté redondeado.
4) Calcula:
   - Producción = suma comisiones positivas
   - Extornos = suma comisiones negativas
   - Base real = Producción + Extornos
   - Total = Base real + otros_gastos (si existen)
   - Líquido = Total - retenciones - impuestos
5) Si una cifra declarada no coincide con la recalculada,
   añade incoherencia detallando ambos valores.
6) No elimines líneas aunque estén a 0.
7) Devuelve SIEMPRE JSON válido.
8) No escribas nada fuera del JSON.

Estructura obligatoria EXACTA:

{
  "tipo": "",
  "totales": {
    "produccion": 0,
    "otros_gastos": 0,
    "total_comisiones_seguro": 0,
    "total_no_seguro": 0,
    "base": 0,
    "impuestos": 0,
    "retenciones": 0,
    "total": 0,
    "liquido": 0
  },
  "lineas": [
    {
      "codigo": "",
      "concepto": "",
      "base": 0,
      "comision": 0
    }
  ],
  "incoherencias": []
}
        `
      },
      {
        role: "user",
        content: `
ANALIZA LOS SIGUIENTES DATOS ESTRICTAMENTE:

${structuredText}

IMPORTANTE:

- Si aparecen líneas tipo póliza con comisión, inclúyelas TODAS.
- No agrupes líneas.
- No omitas líneas pequeñas.
- Si el documento es liquidación MAPFRE, tipo = "LIQUIDACION_COMISIONES".
- Si es factura, tipo = "FACTURA".
- Si no estás seguro, tipo = "DESCONOCIDO".
        `
      }
    ]
  });

  const content = response.choices[0].message.content;

  if (!content) {
    throw new Error("Respuesta vacía de la IA");
  }

  try {
    return JSON.parse(content);
  } catch (err) {
    console.error("JSON inválido IA:", content);
    throw new Error("La IA no devolvió JSON válido");
  }
}