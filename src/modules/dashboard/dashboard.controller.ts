import { Request, Response } from "express";
import MapfreEspana from "../facturas/mapfreEspana/mapfreEspana.model";
import MapfreVida from "../facturas/mapfreVida/mapfreVida.model";

/* =========================
   REDONDEO SEGURO
========================= */
const round2 = (n: number) => Number((n || 0).toFixed(2));

export const getFacturacionDashboard = async (req: Request, res: Response) => {
  try {

    const espana = await MapfreEspana.find();
    const vida = await MapfreVida.find();

    const meses = [
      "",
      "Ene","Feb","Mar","Abr","May","Jun",
      "Jul","Ago","Sep","Oct","Nov","Dic"
    ];

    const facturacionMap: any = {};
    const produccionMap: any = {};

    /* =========================
       MAPFRE ESPAÑA
    ========================= */

    espana.forEach((f: any) => {

      if (!f.fechaTexto) return;

      const [, mes, año] = f.fechaTexto.split("/");

      const mesNum = Number(mes);
      const añoNum = Number(año);
      const mesNombre = meses[mesNum];

      if (!facturacionMap[mesNombre]) {
        facturacionMap[mesNombre] = { mes: mesNombre, mesNum };
      }

      facturacionMap[mesNombre][añoNum] =
        round2((facturacionMap[mesNombre][añoNum] || 0) + (f.liquidoFinal || 0));

      if (!produccionMap[mesNombre]) {
        produccionMap[mesNombre] = {
          mes: mesNombre,
          mesNum,
          nueva: 0,
          renovacion: 0
        };
      }

      produccionMap[mesNombre].nueva =
        round2(produccionMap[mesNombre].nueva + (f.nuevaProduccion || 0));

      produccionMap[mesNombre].renovacion =
        round2(produccionMap[mesNombre].renovacion + (f.renovaciones || 0));

    });

    /* =========================
       MAPFRE VIDA
    ========================= */

    vida.forEach((f: any) => {

      if (!f.factura?.fecha) return;

      const [, mes, año] = f.factura.fecha.split("/");

      const mesNum = Number(mes);
      const añoNum = Number(año);
      const mesNombre = meses[mesNum];

      if (!facturacionMap[mesNombre]) {
        facturacionMap[mesNombre] = { mes: mesNombre, mesNum };
      }

      facturacionMap[mesNombre][añoNum] =
        round2((facturacionMap[mesNombre][añoNum] || 0) + (f.resumen?.liquidoFinal || 0));

      if (!produccionMap[mesNombre]) {
        produccionMap[mesNombre] = {
          mes: mesNombre,
          mesNum,
          nueva: 0,
          renovacion: 0
        };
      }

      produccionMap[mesNombre].nueva =
        round2(produccionMap[mesNombre].nueva + (f.resumen?.nuevaProduccion || 0));

      produccionMap[mesNombre].renovacion =
        round2(produccionMap[mesNombre].renovacion + (f.resumen?.renovaciones || 0));

    });

    /* =========================
       ORDENAR MESES
    ========================= */

    const facturacionMensual = Object.values(facturacionMap)
      .sort((a: any, b: any) => a.mesNum - b.mesNum);

    const produccion = Object.values(produccionMap)
      .sort((a: any, b: any) => a.mesNum - b.mesNum);

    res.json({
      facturacionMensual,
      produccion
    });

  } catch (error) {
    console.error("Dashboard error", error);
    res.status(500).json({ error: "Error generando dashboard" });
  }
};