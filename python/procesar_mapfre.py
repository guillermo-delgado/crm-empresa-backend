# -*- coding: utf-8 -*-

import io
import sys
import json
import re
import os
import pdfplumber
import pytesseract

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

if os.name == "nt":
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
from typing import Optional, Dict, Any, List



def parse_importe(value: str) -> float:
    if not value:
        return 0.0

    value = value.strip()
    value = value.replace(".", "")
    value = value.replace(",", ".")
    value = re.sub(r"[^\d\.-]", "", value)

    try:
        return round(float(value), 2)
    except Exception:
        return 0.0


def normalizar(text: str) -> str:
    if not text:
        return ""

    replacements = {
        "Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ñ": "N",
        "á": "A", "é": "E", "í": "I", "ó": "O", "ú": "U", "ñ": "N",
    }

    for k, v in replacements.items():
        text = text.replace(k, v)

    return text.upper().strip()


def extraer_texto_pdf(origen, logs: List[str]) -> str:
    texto_final = ""

    with pdfplumber.open(origen) as pdf:
        total_paginas = len(pdf.pages)
        logs.append(f"Páginas PDF: {total_paginas}")

        if total_paginas == 0:
            logs.append("PDF sin páginas")
            return ""

        # 🔥 1) Leer SOLO la primera página
        page = pdf.pages[0]
        texto = page.extract_text()

        if not texto:
            palabras = page.extract_words()
            texto = " ".join([w["text"] for w in palabras])

        # 🔥 2) Si NO hay texto suficiente → cortar aquí
        if not texto or len(texto.strip()) < 80:
            logs.append("Página 1 sin texto suficiente. Se usará OCR.")
            return ""

        # 🔥 3) Si hay texto → continuar normal
        logs.append(f"Página 1: texto extraído {len(texto)} caracteres")
        texto_final += texto + "\n"

        # 🔥 4) Leer resto de páginas SOLO si merece la pena
        for i, page in enumerate(pdf.pages[1:], start=2):
            texto = page.extract_text()

            if not texto:
                palabras = page.extract_words()
                texto = " ".join([w["text"] for w in palabras])

            if texto:
                logs.append(f"Página {i}: texto extraído {len(texto)} caracteres")
                texto_final += texto + "\n"
            else:
                logs.append(f"Página {i}: sin texto extraíble")

    return texto_final.strip()


def extraer_texto_ocr_local(origen, logs: List[str]) -> str:
    try:
        import fitz
        from PIL import Image
    except Exception as e:
        logs.append(f"OCR local no disponible: {str(e)}")
        return ""

    texto_final = ""

    try:
        if isinstance(origen, (bytes, bytearray)):
            doc = fitz.open(stream=origen, filetype="pdf")
        else:
            doc = fitz.open(origen)

        total_paginas = len(doc)
        logs.append(f"OCR local activado. Páginas: {total_paginas}")

        for page_index in range(total_paginas):
            try:
                porcentaje = round(((page_index + 1) / total_paginas) * 100, 1)
                print(
                    f"PROGRESO|OCR|{porcentaje}|Leyendo página {page_index + 1} de {total_paginas}",
                    file=sys.stderr,
                    flush=True
                )
            except Exception:
                pass

            page = doc[page_index]
            matrix = fitz.Matrix(2.2, 2.2)
            pix = page.get_pixmap(matrix=matrix, alpha=False)

            img = Image.open(io.BytesIO(pix.tobytes("png")))

            texto = pytesseract.image_to_string(
                img,
                lang="spa+eng",
                config="--psm 6"
            ).strip()

            logs.append(f"OCR página {page_index + 1}: {len(texto)} caracteres")

            if texto:
                texto_final += texto + "\n"

        doc.close()

    except Exception as e:
        logs.append(f"Error OCR local: {str(e)}")
        return ""

    return texto_final.strip()

def extraer_liquido_ultima_pagina(origen, logs: List[str]) -> Optional[float]:
    try:
        import fitz
        from PIL import Image
    except Exception as e:
        logs.append(f"OCR líquido no disponible: {str(e)}")
        return None

    try:
        if isinstance(origen, (bytes, bytearray)):
            doc = fitz.open(stream=origen, filetype="pdf")
        else:
            doc = fitz.open(origen)

        if len(doc) == 0:
            return None

        page = doc[len(doc) - 1]
        matrix = fitz.Matrix(4, 4)
        pix = page.get_pixmap(matrix=matrix, alpha=False)

        img = Image.open(io.BytesIO(pix.tobytes("png")))
        w, h = img.size

        crop = img.crop((
            int(w * 0.00),
            int(h * 0.32),
            int(w * 1.00),
            int(h * 0.58),
        ))

        texto = pytesseract.image_to_string(
            crop,
            lang="spa+eng",
            config="--psm 6 --oem 3"
        ).strip()

        doc.close()

        logs.append("OCR específico líquido ejecutado sobre última página")

        for raw in texto.splitlines():
            line = normalizar(raw)
            compact = re.sub(r"[^A-Z0-9]", "", line)

            if "IMPORTE" in compact and "LIQUID" in compact:
                nums = re.findall(r"-?\d[\d\.]*,\d{2}", raw)
                valores = [parse_importe(n) for n in nums]

                if len(valores) >= 2:
                    return round(valores[-2], 2)

                if len(valores) == 1 and valores[0] > 50:
                    return round(valores[0], 2)

        return None

    except Exception as e:
        logs.append(f"Error OCR líquido última página: {str(e)}")
        return None

def extraer_datos_factura(text: str) -> Dict[str, str]:
    upper = normalizar(text)

    numero_factura = ""
    fecha = ""
    periodo = ""
    razon_social = ""
    cif = ""

    factura_match = re.search(r"\b\d{12,}[A-Z0-9]*\b", upper)
    if factura_match:
        numero_factura = factura_match.group(0)

    fecha_match = re.search(r"\b\d{2}/\d{2}/\d{4}\b", text)
    if fecha_match:
        fecha = fecha_match.group(0)

    periodo_match = re.search(
        r"(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s*[- ]\s*\d{4}",
        upper
    )
    if periodo_match:
        periodo = periodo_match.group(0).replace(" ", "")

    if "MAPFRE ESPANA" in upper or "MAPFRE ESPA" in upper:
        razon_social = "Mapfre España"

    cif_match = re.search(r"\b[A-Z]\d{8}\b", upper)
    if cif_match:
        cif = cif_match.group(0)

    return {
        "numeroFactura": numero_factura,
        "fecha": fecha,
        "periodo": periodo,
        "razonSocial": razon_social,
        "cif": cif,
    }


def extraer_concepto(text: str, *keywords: str) -> float:
    lines = text.splitlines()

    for i, raw in enumerate(lines):
        line = normalizar(raw)

        if all(normalizar(k) in line for k in keywords):

            # 1) Misma línea
            nums = re.findall(r"-?\d[\d\.]*,\d{2}", raw)
            if nums:
                return parse_importe(nums[-1])

            # 2) Buscar en las siguientes 6 líneas
            bloque = "\n".join(lines[i:i + 7])
            nums_bloque = re.findall(r"-?\d[\d\.]*,\d{2}", bloque)

            if nums_bloque:
                return parse_importe(nums_bloque[-1])

    return 0.0

def extraer_desglose_resumen_variable(text: str) -> Dict[str, Any]:
    resultado = {
        "sistemaCompensacion": [],
        "incentivos": [],
        "rappeles": [],
        "otrasContraprestaciones": [],
    }

    lines = [
        re.sub(r"\s+", " ", l).strip()
        for l in text.splitlines()
        if l.strip()
    ]

    dentro_bloque = False

    for raw in lines:
        line = normalizar(raw)

        if "OTRAS COMISIONES" in line and "COMPENSACION" in line:
            dentro_bloque = True

            nums = re.findall(r"-?\d[\d\.]*,\d{2}", raw)
            if nums:
                resultado["sistemaCompensacion"].append({
                    "concepto": raw,
                    "importe": parse_importe(nums[-1])
                })
            continue

        if dentro_bloque and (
            "OTROS GASTOS TRIBUTABLES" in line
            or "TOTAL COMISIONES SEGURO" in line
            or "TOTAL COMISIONES DE SEGURO" in line
        ):
            break

        if not dentro_bloque:
            continue

        nums = re.findall(r"-?\d[\d\.]*,\d{2}", raw)
        if not nums:
            continue

        importe = parse_importe(nums[-1])

        if "INCENTIVO" in line:
            resultado["incentivos"].append({
                "concepto": raw,
                "importe": importe
            })

        elif "RAPPEL" in line:
            resultado["rappeles"].append({
                "concepto": raw,
                "importe": importe
            })

        elif "CONTRAPREST" in line:
            resultado["otrasContraprestaciones"].append({
                "concepto": raw,
                "importe": importe
            })

    resultado["totales"] = {
        "sistemaCompensacion": round(sum(x["importe"] for x in resultado["sistemaCompensacion"]), 2),
        "incentivos": round(sum(x["importe"] for x in resultado["incentivos"]), 2),
        "rappeles": round(sum(x["importe"] for x in resultado["rappeles"]), 2),
        "otrasContraprestaciones": round(sum(x["importe"] for x in resultado["otrasContraprestaciones"]), 2),
    }

    return resultado

def extraer_liquido_oficial(text: str) -> Optional[float]:
    lines = [
        re.sub(r"\s+", " ", l).strip()
        for l in text.splitlines()
        if l.strip()
    ]

    for i, raw in enumerate(lines):
        line = normalizar(raw)
        compact = re.sub(r"[^A-Z0-9]", "", line)

        if not ("IMPORTE" in compact and "LIQUID" in compact):
            continue

        # Cogemos solo la línea de IMPORTE LIQUIDO + la siguiente,
        # no líneas anteriores, para no pillar la BASE 4.866,97.
        bloque = " ".join(lines[i:i + 2])
        nums = re.findall(r"-?\d[\d\.]*,\d{2}", bloque)
        valores = [parse_importe(n) for n in nums]

        # En la línea real viene: 4.060,69 0,00
        valores_validos = [v for v in valores if v > 50]

        if valores_validos:
            return round(valores_validos[0], 2)

    return None

def extraer_base_oficial(text: str) -> Optional[float]:
    lines = text.splitlines()

    for i, raw in enumerate(lines):
        line = normalizar(raw)

        if "TOTAL COMISIONES DE SEGURO" in line:
            bloque = "\n".join(lines[i:i + 10])
            nums = re.findall(r"-?\d[\d\.]*,\d{2}", bloque)

            valores = [parse_importe(n) for n in nums if parse_importe(n) > 100]

            if valores:
                return round(max(valores), 2)

    return None

def es_inicio_poliza(line: str) -> bool:
    line = line.strip()
    if not line:
        return False

    primer_token = line.split()[0]

    # Debe tener mínimo 5 caracteres
    if len(primer_token) < 5:
        return False

    # Debe contener al menos un número
    if not re.search(r"\d", primer_token):
        return False

    # No permitir fechas como póliza
    if re.match(r"^\d{2}/\d{2}/\d{4}$", primer_token):
        return False

    # No permitir importes como póliza
    if re.match(r"^-?\d[\d\.]*,\d{2}$", primer_token):
        return False

    # Debe parecer identificador: números, letras, barras o guiones
    if not re.match(r"^[A-Z0-9/\-]+$", primer_token.upper()):
        return False

    return True

def parsear_linea_produccion(linea: str) -> Optional[Dict[str, Any]]:
    linea_original = linea
    linea = re.sub(r"\s+", " ", linea).strip()

    poliza_match = re.match(r"^(?P<poliza>[A-Z0-9/\-]{5,})\s+(?P<resto>.+)$", linea, re.IGNORECASE)
    if not poliza_match:
        return None

    poliza = poliza_match.group("poliza")
    resto = poliza_match.group("resto").strip()

    fecha_match = re.search(r"\b\d{2}\/\d{2}\/\d{4}\b", resto)
    if not fecha_match:
        return None

    fecha = fecha_match.group(0)

    antes_fecha = resto[:fecha_match.start()].strip()
    despues_fecha = resto[fecha_match.end():].strip()

    importes = re.findall(r"-?\d[\d\.]*,\d{2}", despues_fecha)
    if len(importes) < 4:
        return None

    total = importes[0]
    prima = importes[1]
    porcentaje = importes[2]
    comision = importes[3]

    partes_tomador = antes_fecha.split()
    tipo = ""
    tomador = antes_fecha

    if partes_tomador:
        ultimo = partes_tomador[-1].upper().replace(" ", "")

        if ultimo in ["N", "DN"]:
            tipo = "N"
            tomador = " ".join(partes_tomador[:-1]).strip()

        elif ultimo in ["C", "CC", "MC", "EL", "�"]:
            tipo = "C"
            tomador = " ".join(partes_tomador[:-1]).strip()

    # 🔥 Si el OCR pegó el tipo al final del tomador
    if not tipo:
        tomador_upper = tomador.upper().strip()

        if tomador_upper.endswith(" N"):
            tipo = "N"
            tomador = tomador[:-2].strip()

        elif tomador_upper.endswith(" C"):
            tipo = "C"
            tomador = tomador[:-2].strip()

        elif tomador_upper.endswith(" MC"):
            tipo = "C"
            tomador = tomador[:-3].strip()

        elif tomador_upper.endswith(" DN"):
            tipo = "N"
            tomador = tomador[:-3].strip()

    # 🔥 Último recurso: no perder la comisión
    if not tipo:
        tipo = "C"

    if tipo == "C" and tomador.endswith(" M"):
        tomador = tomador[:-2].strip()

    tomador = re.sub(r"[^\w\sÁÉÍÓÚÑ]", "", tomador).strip()

    if not poliza or not tomador:
        return None

    return {
        "poliza": poliza,
        "tomador": tomador,
        "tipoProduccion": tipo,
        "fechaVencimiento": fecha,
        "totalRecibo": parse_importe(total),
        "primaBase": parse_importe(prima),
        "porcentaje": parse_importe(porcentaje),
        "comision": parse_importe(comision),
        "concepto": linea_original,
    }


def extraer_rows(text: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []

    lines = [
        re.sub(r"\s+", " ", l).strip()
        for l in text.splitlines()
        if l.strip()
    ]

    lineas_no_parseadas = []
    filas_eliminadas = []

    # =====================================================
    # 1) PRIMER BARRIDO: línea por línea
    # Fuente principal. Permite duplicados reales.
    # =====================================================

    for line in lines:
        row = parsear_linea_produccion(line)

        if row:
            rows.append(row)
        else:
            tiene_poliza = es_inicio_poliza(line)
            tiene_fecha = re.search(r"\d{2}/\d{2}/\d{4}", line)
            importes = re.findall(r"-?\d[\d\.]*,\d{2}", line)

            if tiene_poliza and tiene_fecha and len(importes) >= 4:
                lineas_no_parseadas.append(line)

    filas_primer_barrido = len(rows)
    filas_segundo_barrido = 0
    filas_rescate = 0

    # =====================================================
    # 2) SEGUNDO BARRIDO: SOLO SI NO HAY FILAS
    # Evita duplicar las mismas líneas.
    # =====================================================

    if not rows:
        buffer = ""
        rows_buffer: List[Dict[str, Any]] = []

        for line in lines:
            empieza_por_poliza = es_inicio_poliza(line)

            if empieza_por_poliza:
                if buffer:
                    row = parsear_linea_produccion(buffer)
                    if row:
                        rows_buffer.append(row)

                buffer = line
            else:
                if buffer:
                    buffer += " " + line

        if buffer:
            row = parsear_linea_produccion(buffer)
            if row:
                rows_buffer.append(row)

        rows = rows_buffer
        filas_segundo_barrido = len(rows)

    # =====================================================
    # 3) RESCATE: SOLO SI SIGUE SIN HABER FILAS
    # Evita meter filas falsas o duplicadas.
    # =====================================================

    if not rows:
        texto_plano = "\n".join(lines)

        patron_rescate = re.compile(
            r"((?:[A-Z0-9/\-]{5,})\s+.*?\d{2}/\d{2}/\d{4}\s+"
            r"-?\d[\d\.]*,\d{2}\s+"
            r"-?\d[\d\.]*,\d{2}\s+"
            r"-?\d[\d\.]*,\d{2}\s+"
            r"-?\d[\d\.]*,\d{2})",
            re.IGNORECASE
        )

        rows_rescate: List[Dict[str, Any]] = []

        for match in patron_rescate.finditer(texto_plano):
            posible_fila = re.sub(r"\s+", " ", match.group(1)).strip()
            row = parsear_linea_produccion(posible_fila)
            if row:
                rows_rescate.append(row)

        rows = rows_rescate
        filas_rescate = len(rows)

    # =====================================================
    # 4) DEBUG EN MEMORIA / CONSOLA
    # No se guarda ningún archivo.
    # =====================================================

    suma_abonos = sum(
        float(r.get("comision", 0))
        for r in rows
        if float(r.get("comision", 0)) > 0
    )

    suma_extornos = sum(
        abs(float(r.get("comision", 0)))
        for r in rows
        if float(r.get("comision", 0)) < 0
    )

    print("===== DEBUG FINAL ROWS PYTHON =====", file=sys.stderr, flush=True)
    print(f"FILAS PRIMER BARRIDO: {filas_primer_barrido}", file=sys.stderr, flush=True)
    print(f"FILAS AÑADIDAS SEGUNDO BARRIDO: {filas_segundo_barrido}", file=sys.stderr, flush=True)
    print(f"FILAS AÑADIDAS RESCATE: {filas_rescate}", file=sys.stderr, flush=True)
    print(f"FILAS TOTALES: {len(rows)}", file=sys.stderr, flush=True)
    print(f"ABONOS: {suma_abonos:.2f}", file=sys.stderr, flush=True)
    print(f"EXTORNOS: {suma_extornos:.2f}", file=sys.stderr, flush=True)
    print(f"NETO: {(suma_abonos - suma_extornos):.2f}", file=sys.stderr, flush=True)

    if lineas_no_parseadas:
        print(
            f"LÍNEAS NO PARSEADAS DETECTADAS: {len(lineas_no_parseadas)}",
            file=sys.stderr,
            flush=True
        )

    if filas_eliminadas:
        print(
            f"FILAS ELIMINADAS DETECTADAS: {len(filas_eliminadas)}",
            file=sys.stderr,
            flush=True
        )

    print("===== FIN DEBUG FINAL ROWS PYTHON =====", file=sys.stderr, flush=True)

    return rows

def calcular(rows: List[Dict[str, Any]], text: str) -> Dict[str, Any]:
    abonos = 0.0
    extornos = 0.0
    total_n = 0.0
    total_c = 0.0
    debug_rows_sumadas = []

    for row in rows:
        comision = float(row.get("comision", 0))

        debug_rows_sumadas.append({
            "poliza": row.get("poliza"),
            "tomador": row.get("tomador"),
            "tipo": row.get("tipoProduccion"),
            "fecha": row.get("fechaVencimiento"),
            "comision": comision,
            "concepto": row.get("concepto")
        })

        if row.get("tipoProduccion") == "N":
            total_n += comision

        if row.get("tipoProduccion") == "C":
            total_c += comision

        if comision > 0:
            abonos += comision
        elif comision < 0:
            extornos += abs(comision)

    otros_gastos = extraer_concepto(text, "OTROS GASTOS TRIBUTABLES")
    traspaso = extraer_concepto(text, "TRASPASO")

    incentivos = (
        extraer_concepto(text, "INCENTIVOS FIJOS")
        or extraer_concepto(text, "INCENTIVO FIJO")
        or extraer_concepto(text, "INCENTIVOS")
        or extraer_concepto(text, "INCENTIVO")
    )

    rappeles = extraer_concepto(text, "RAPPEL")
    otras_contraprestaciones = extraer_concepto(text, "OTRAS CONTRAPRESTACIONES")

    comisiones_no_seguro = (
        extraer_concepto(text, "TOTAL COMISIONES DE NO SEGURO")
        or extraer_concepto(text, "COMISIONES", "NO SEGURO")
        or extraer_concepto(text, "NO SEGURO")
    )

    operaciones_bancarias = extraer_concepto(text, "TOTAL OPERACIONES BANCARIAS NO SEGURO")
    multimap = extraer_concepto(text, "COMISIONES MULTIMAP")
    securitas_direct = extraer_concepto(text, "COMISIONES SECURITAS DIRECT")
    otras_comisiones_sistema = extraer_concepto(text, "OTRAS COMISIONES", "COMPENSACION")
    lineas_delegadas = extraer_concepto(text, "OFICINAS", "DELEG")

    base_produccion = round(abonos - extornos, 2)

    base = round(
        base_produccion
        + otros_gastos
        + otras_comisiones_sistema
        + comisiones_no_seguro,
        2
    )

    irpf = round(base * 0.15, 2)

    iva_operaciones = round(operaciones_bancarias * 0.21, 2) if operaciones_bancarias else 0.0
    iva_no_seguro = round(comisiones_no_seguro * 0.21, 2) if comisiones_no_seguro else 0.0

    compensacion = abs(lineas_delegadas)

    liquido_calculado = round(
        base - irpf - compensacion + iva_operaciones + iva_no_seguro,
        2
    )

    liquido_oficial = extraer_liquido_oficial(text)
    base_oficial = extraer_base_oficial(text)

    diferencia_base = (
        round(base_oficial - base, 2)
        if base_oficial is not None
        else 0.0
    )

    liquido_final = liquido_calculado
    diferencia = 0.0
    usando_liquido_oficial = False

    if liquido_oficial is not None:
        diferencia = round(liquido_oficial - liquido_calculado, 2)

        if abs(diferencia) <= 0.02:
            liquido_final = liquido_oficial
            usando_liquido_oficial = True

    

    print("===== DEBUG CALCULO MAPFRE PYTHON =====", file=sys.stderr, flush=True)
    print(f"FILAS SUMADAS: {len(rows)}", file=sys.stderr, flush=True)
    print(f"ABONOS: {abonos:.2f}", file=sys.stderr, flush=True)
    print(f"EXTORNOS: {extornos:.2f}", file=sys.stderr, flush=True)
    print(f"BASE PRODUCCION: {base_produccion:.2f}", file=sys.stderr, flush=True)
    print(f"OTROS GASTOS: {otros_gastos:.2f}", file=sys.stderr, flush=True)
    print(f"OTRAS COMISIONES SISTEMA: {otras_comisiones_sistema:.2f}", file=sys.stderr, flush=True)
    print(f"COMISIONES NO SEGURO: {comisiones_no_seguro:.2f}", file=sys.stderr, flush=True)
    print(f"BASE CALCULADA PYTHON: {base:.2f}", file=sys.stderr, flush=True)

    if base_oficial is not None:
        print(f"BASE OFICIAL PDF: {base_oficial:.2f}", file=sys.stderr, flush=True)
        print(f"DIFERENCIA BASE: {diferencia_base:.2f}", file=sys.stderr, flush=True)
    else:
        print("BASE OFICIAL PDF: NO ENCONTRADA", file=sys.stderr, flush=True)

    print(f"IRPF: {irpf:.2f}", file=sys.stderr, flush=True)
    print(f"LINEAS DELEGADAS: {lineas_delegadas:.2f}", file=sys.stderr, flush=True)
    print(f"COMPENSACION: {compensacion:.2f}", file=sys.stderr, flush=True)
    print(f"IVA OPERACIONES: {iva_operaciones:.2f}", file=sys.stderr, flush=True)
    print(f"IVA NO SEGURO: {iva_no_seguro:.2f}", file=sys.stderr, flush=True)
    print(f"LIQUIDO CALCULADO: {liquido_calculado:.2f}", file=sys.stderr, flush=True)

    if liquido_oficial is not None:
        print(f"LIQUIDO OFICIAL PDF: {liquido_oficial:.2f}", file=sys.stderr, flush=True)
        print(f"DIFERENCIA LIQUIDO: {diferencia:.2f}", file=sys.stderr, flush=True)
    else:
        print("LIQUIDO OFICIAL PDF: NO ENCONTRADO", file=sys.stderr, flush=True)

    
    print("===== FIN DEBUG CALCULO MAPFRE PYTHON =====", file=sys.stderr, flush=True)
    

    return {
        "resumen": {
            
            "extornos": round(extornos, 2),
            "baseProduccion": round(base_produccion, 2),
            "base": round(base, 2),
            "baseOficial": base_oficial,
            "diferenciaBase": diferencia_base,
            "irpf": round(irpf, 2),
            "compensaciones": round(compensacion, 2),
            "otrosGastos": round(otros_gastos, 2),
            "liquido": round(liquido_final, 2),
            "incentivos": round(incentivos, 2),
            "rappeles": round(rappeles, 2),
            "otrasContraprestaciones": round(otras_contraprestaciones, 2),
            "traspaso": round(traspaso, 2),
            "liquidoCalculado": round(liquido_calculado, 2),
            "liquidoOficial": liquido_oficial,
            "diferencia": round(diferencia, 2),
            "usandoLiquidoOficial": usando_liquido_oficial,
        },
        "totalesProduccion": {
            "totalNuevaProduccion": round(total_n, 2),
            "totalRenovaciones": round(total_c, 2),
        },
        "desglose": {
            "comisionesNoSeguro": round(comisiones_no_seguro, 2),
            "operacionesBancarias": round(operaciones_bancarias, 2),
            "ivaOperaciones": round(iva_operaciones, 2),
            "ivaNoSeguro": round(iva_no_seguro, 2),
            "lineasDelegadas": round(lineas_delegadas, 2),
            "otrasComisionesSistema": round(otras_comisiones_sistema, 2),
            "multimap": round(multimap, 2),
            "securitasDirect": round(securitas_direct, 2),
        }
    }


def auditar_descuadre(rows: List[Dict[str, Any]], text: str, diferencia_base: float):
    

    lines = [
        re.sub(r"\s+", " ", l).strip()
        for l in text.splitlines()
        if l.strip()
    ]

    keys_rows = set()
    for r in rows:
        key = (
            f"{r.get('poliza')}|"
            f"{r.get('fechaVencimiento')}|"
            f"{r.get('totalRecibo')}|"
            f"{r.get('primaBase')}|"
            f"{r.get('porcentaje')}|"
            f"{r.get('comision')}"
        )
        keys_rows.add(key)

    candidatas_no_sumadas = []

    for line in lines:
        if not es_inicio_poliza(line):
            continue

        row = parsear_linea_produccion(line)

        if not row:
            importes = re.findall(r"-?\d[\d\.]*,\d{2}", line)

            candidatas_no_sumadas.append({
                "motivo": "NO_PARSEADA",
                "linea": line,
                "importes_detectados": importes
            })
            continue

        key = (
            f"{row.get('poliza')}|"
            f"{row.get('fechaVencimiento')}|"
            f"{row.get('totalRecibo')}|"
            f"{row.get('primaBase')}|"
            f"{row.get('porcentaje')}|"
            f"{row.get('comision')}"
        )

        if key not in keys_rows:
            candidatas_no_sumadas.append({
                "motivo": "PARSEADA_PERO_NO_SUMADA",
                "linea": line,
                "row": row,
                "comision": row.get("comision")
            })

    # Buscar líneas cuya comisión coincida o se acerque al descuadre
    objetivo = round(abs(diferencia_base), 2)

    candidatas_por_importe = []

    for item in candidatas_no_sumadas:
        row = item.get("row")
        if not row:
            continue

        comision = abs(float(row.get("comision", 0)))

        if abs(comision - objetivo) <= 0.05:
            candidatas_por_importe.append({
                "tipo": "COINCIDENCIA_EXACTA_O_CASI",
                "comision": comision,
                "linea": item["linea"],
                "row": row
            })

    # Buscar combinaciones simples de 2 o 3 comisiones
    rows_candidatas = [
        item["row"]
        for item in candidatas_no_sumadas
        if item.get("row") and abs(float(item["row"].get("comision", 0))) > 0
    ]

    combinaciones = []

    for i in range(len(rows_candidatas)):
        c1 = abs(float(rows_candidatas[i].get("comision", 0)))

        for j in range(i + 1, len(rows_candidatas)):
            c2 = abs(float(rows_candidatas[j].get("comision", 0)))
            suma2 = round(c1 + c2, 2)

            if abs(suma2 - objetivo) <= 0.05:
                combinaciones.append({
                    "tipo": "COMBINACION_2",
                    "suma": suma2,
                    "rows": [rows_candidatas[i], rows_candidatas[j]]
                })

            for k in range(j + 1, len(rows_candidatas)):
                c3 = abs(float(rows_candidatas[k].get("comision", 0)))
                suma3 = round(c1 + c2 + c3, 2)

                if abs(suma3 - objetivo) <= 0.05:
                    combinaciones.append({
                        "tipo": "COMBINACION_3",
                        "suma": suma3,
                        "rows": [
                            rows_candidatas[i],
                            rows_candidatas[j],
                            rows_candidatas[k]
                        ]
                    })

    auditoria = {
        "diferenciaBase": round(diferencia_base, 2),
        "objetivoBuscar": objetivo,
        "filasSumadas": len(rows),
        "candidatasNoSumadas": candidatas_no_sumadas,
        "candidatasPorImporte": candidatas_por_importe,
        "combinacionesEncontradas": combinaciones[:100],
    }

    

   

    print("===== AUDITORIA DESCUADRE =====", file=sys.stderr, flush=True)
    print(f"Diferencia base: {diferencia_base:.2f}", file=sys.stderr, flush=True)
    
    print(f"Candidatas no sumadas: {len(candidatas_no_sumadas)}", file=sys.stderr, flush=True)
    print(f"Coincidencias importe: {len(candidatas_por_importe)}", file=sys.stderr, flush=True)
    print(f"Combinaciones: {len(combinaciones)}", file=sys.stderr, flush=True)
    print("===== FIN AUDITORIA DESCUADRE =====", file=sys.stderr, flush=True)

   

def sumar_comisiones_visibles(text: str) -> Dict[str, Any]:
    total = 0.0
    lineas = []

    for raw in text.splitlines():
        line = re.sub(r"\s+", " ", raw).strip()

        if not es_inicio_poliza(line):
            continue

        importes = re.findall(r"-?\d[\d\.]*,\d{2}", line)

        if len(importes) < 4:
            continue

        comision = parse_importe(importes[-1])
        total += comision

        lineas.append({
            "linea": line,
            "importes": importes,
            "comisionDetectada": comision
        })

    return {
        "totalComisionesVisibles": round(total, 2),
        "lineasDetectadas": len(lineas),
        "lineas": lineas
    }

def main():
    logs = []

    try:
        modo_stdin = len(sys.argv) >= 2 and sys.argv[1] == "--stdin"

        if modo_stdin:
            pdf_bytes = sys.stdin.buffer.read()

            if not pdf_bytes:
                print(json.dumps({
                    "ok": False,
                    "error": "No se han recibido bytes por stdin",
                    "logs": ["No se han recibido bytes por stdin"]
                }, ensure_ascii=False))
                return

            logs.append("PDF recibido por stdin")
            logs.append(f"Tamaño PDF recibido: {len(pdf_bytes)} bytes")

            origen_pdfplumber = io.BytesIO(pdf_bytes)
            origen_ocr = pdf_bytes

        else:
            if len(sys.argv) < 2:
                print(json.dumps({
                    "ok": False,
                    "error": "No se ha recibido ruta de PDF",
                    "logs": ["No se ha recibido ruta de PDF"]
                }, ensure_ascii=False))
                return

            ruta = sys.argv[1]
            logs.append(f"Ruta recibida Python: {ruta}")
            logs.append(f"Existe archivo: {os.path.exists(ruta)}")

            if os.path.exists(ruta):
                logs.append(f"Tamaño archivo: {os.path.getsize(ruta)} bytes")

            origen_pdfplumber = ruta
            origen_ocr = ruta

        text = extraer_texto_pdf(origen_pdfplumber, logs)
        metodo = "pdfplumber"

        if len(text.strip()) < 80:
            logs.append("Texto pdfplumber insuficiente. Intentando OCR local Python...")

            text_ocr = extraer_texto_ocr_local(origen_ocr, logs)

            if len(text_ocr.strip()) > len(text.strip()):
                text = text_ocr
                metodo = "ocr_local_python"

        logs.append(f"Método usado Python: {metodo}")
        logs.append(f"Texto extraído Python: {len(text)} caracteres")

        datos_factura = extraer_datos_factura(text)
        rows = extraer_rows(text)
        logs.append(f"Filas válidas detectadas Python: {len(rows)}")

        calculos = calcular(rows, text)

        liquido_detectado = calculos["resumen"].get("liquidoOficial")

        if liquido_detectado is None:
            liquido_detectado = extraer_liquido_ultima_pagina(origen_ocr, logs)

            if liquido_detectado is not None:
                liquido_calculado = calculos["resumen"].get("liquidoCalculado", 0)

                calculos["resumen"]["liquidoOficial"] = liquido_detectado
                calculos["resumen"]["liquido"] = liquido_detectado
                calculos["resumen"]["diferencia"] = round(
                    liquido_detectado - liquido_calculado,
                    2
                )
                calculos["resumen"]["usandoLiquidoOficial"] = True

                logs.append(f"Líquido oficial detectado en última página: {liquido_detectado}")
            else:
                logs.append("No se pudo detectar líquido oficial en última página")

        diferencia_base_debug = calculos["resumen"].get("diferenciaBase", 0)

        debug = {
            "comisionesVisibles": None,
            "auditoriaDescudreGenerada": False
        }

        if abs(diferencia_base_debug) > 0.02:
            auditoria_visible = sumar_comisiones_visibles(text)

            debug["comisionesVisibles"] = {
                "totalComisionesVisibles": auditoria_visible["totalComisionesVisibles"],
                "lineasDetectadas": auditoria_visible["lineasDetectadas"],
                "lineas": auditoria_visible["lineas"]
            }

            logs.append(
                f"Total comisiones visibles: {auditoria_visible['totalComisionesVisibles']}"
            )

            auditar_descuadre(rows, text, diferencia_base_debug)
            debug["auditoriaDescudreGenerada"] = True

        base_oficial = calculos["resumen"].get("baseOficial")
        diferencia_base = calculos["resumen"].get("diferenciaBase", 0)

        if base_oficial is not None and abs(diferencia_base) > 0.02:
            logs.append(
                f"Descuadre base detectado: {diferencia_base}. "
                "Revisión realizada sobre el mismo texto ya extraído, sin repetir OCR."
            )

        resultado = {
            "ok": True,
            "metodo": metodo,
            "text": text,
            "datosFactura": datos_factura,
            "rows": rows,
            "resumen": calculos["resumen"],
            "totalesProduccion": calculos["totalesProduccion"],
            "desglose": calculos["desglose"],
            "debug": debug,
            "logs": logs,
        }

        print(json.dumps(resultado, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            "ok": False,
            "error": str(e),
            "logs": logs
        }, ensure_ascii=False))
if __name__ == "__main__":
    main()