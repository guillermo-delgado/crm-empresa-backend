export interface LineaMapfreEspana {
  /* ===============================
     EXISTENTE (NO TOCAR)
  =============================== */

  comision: number;               // comisión en euros
  tomador?: string;               // nombre del tomador
  concepto?: string;              // texto completo de la línea
  tipoProduccion?: "N" | "C";     // Nueva o Renovación
  fechaEfecto?: string;           // opcional para futuros filtros

  /* ===============================
     NUEVO (PARA PARSER REAL MAPFRE)
  =============================== */

  poliza?: string;                // número de póliza
  fechaVencimiento?: string;      // fecha del recibo
  totalRecibo?: number;           // total del recibo
  primaBase?: number;             // prima base
  porcentaje?: number;            // % comisión
}

export interface ResultadoMapfreEspana {
  /* ===============================
     BLOQUE CONTABLE
  =============================== */

  extornos: number;        // comisiones negativas
  base: number;            // abonos - extornos
  irpf: number;            // 15% sobre base
  compensaciones: number;  // compensaciones detectadas
  otrosGastos: number;     // otros gastos tributables
  liquido: number;         // líquido final mostrado

  /* ===============================
     DESGLOSE RESUMEN PDF (🔥 NUEVO)
  =============================== */

  incentivos: number;               // INCENTIVOS FIJOS
  rappeles: number;                 // RAPPEL
  otrasContraprestaciones: number;  // OTRAS CONTRAPRESTACIONES
  traspaso: number;                 // TRASPASO DE COMISIONES

  /* ===============================
     PRODUCCIÓN CRM
  =============================== */

  nuevaProduccion?: number;
  renovaciones?: number;

  /* ===============================
     CONTROL INTERNO (SIEMPRE PRESENTE)
  =============================== */

  liquidoCalculado: number;        // cálculo matemático puro
  liquidoOficial: number | null;   // importe detectado en PDF
  diferencia: number;              // diferencia entre ambos
  usandoLiquidoOficial: boolean;   // si se usa el oficial
}