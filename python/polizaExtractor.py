import re
from typing import Any, Dict, Optional

import pymupdf


# ============================================================
# TEXTO PDF
# ============================================================

def limpiar_texto(texto: str) -> str:
    texto = texto.replace("\r", "\n")
    texto = texto.replace("\x00", " ")

    texto = re.sub(r"[ \t]+", " ", texto)
    texto = re.sub(r"\n[ \t]+", "\n", texto)
    texto = re.sub(r"\n{3,}", "\n\n", texto)

    return texto.strip()


def extraer_texto_pdf(contenido: bytes) -> str:
    paginas = []

    with pymupdf.open(stream=contenido, filetype="pdf") as documento:
        for pagina in documento:
            paginas.append(pagina.get_text("text"))

    return limpiar_texto("\n".join(paginas))


# ============================================================
# UTILIDADES
# ============================================================

def normalizar_espacios(valor: Optional[str]) -> Optional[str]:
    if not valor:
        return None

    valor = re.sub(r"\s+", " ", valor)
    valor = valor.strip()

    return valor or None


def normalizar_fecha(fecha: str) -> Optional[str]:
    fecha = fecha.strip()

    match = re.fullmatch(
        r"(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})",
        fecha,
    )

    if not match:
        return None

    dia, mes, anio = match.groups()

    dia = int(dia)
    mes = int(mes)

    if not 1 <= dia <= 31:
        return None

    if not 1 <= mes <= 12:
        return None

    return f"{anio}-{mes:02d}-{dia:02d}"


def normalizar_importe(valor: str) -> Optional[float]:
    valor = valor.strip()

    valor = re.sub(r"[^\d,.\-]", "", valor)

    if not valor:
        return None

    # 1.234,56
    if "," in valor and "." in valor:
        if valor.rfind(",") > valor.rfind("."):
            valor = valor.replace(".", "")
            valor = valor.replace(",", ".")
        else:
            valor = valor.replace(",", "")

    # 123,45
    elif "," in valor:
        valor = valor.replace(".", "")
        valor = valor.replace(",", ".")

    try:
        return float(valor)
    except ValueError:
        return None


# ============================================================
# ASEGURADORA
# ============================================================

def detectar_aseguradora(texto: str) -> Optional[str]:
    texto_upper = texto.upper()

    # MAPFRE tiene prioridad.
    if "MAPFRE ESPAÑA" in texto_upper or "MAPFRE" in texto_upper:
        return "Mapfre"

    if "VERTI" in texto_upper:
        return "Verti"

    return None


# ============================================================
# MAPFRE
# ============================================================

def clasificar_ramo_mapfre(
    texto: str,
    numero_poliza: Optional[str],
    prima_neta: Optional[float],
) -> Optional[str]:
    texto_upper = texto.upper()

    # ============================================================
    # 1. CLASIFICACIÓN POR PREFIJO DE PÓLIZA
    # ============================================================

    if numero_poliza:
        if numero_poliza.startswith("200"):
            return "Autos"

        if numero_poliza.startswith("073"):
            return "Hogar"

        if numero_poliza.startswith("048"):
            return "Salud"

        if (
            numero_poliza.startswith("074")
            or numero_poliza.startswith("078")
        ):
            return "Multirriesgo (074 o 078)"

    # ============================================================
    # 2. CLASIFICACIÓN POR PRODUCTO
    # ============================================================

    if (
        "AUTOMÓVIL" in texto_upper
        or "AUTOMOVIL" in texto_upper
        or "AUTOMÓVILES" in texto_upper
        or "AUTOMOVILES" in texto_upper
    ):
        return "Autos"

    if "HOGAR" in texto_upper:
        return "Hogar"

    if "SALUD" in texto_upper:
        return "Salud"

    # ============================================================
    # 3. DECESOS
    # ============================================================

    if "DECESOS" in texto_upper:
        if prima_neta is not None and prima_neta > 4000:
            return "Decesos Prima única"

        return "Decesos Prima Periodica"

    # ============================================================
    # 4. SIN CLASIFICAR
    # ============================================================

    return None


def extraer_mapfre(texto: str) -> Dict[str, Any]:

    resultado = {
        "fechaEfecto": None,
        "documentoFiscal": None,
        "tomador": None,
        "numeroPoliza": None,
        "aseguradora": "Mapfre",
        "ramo": None,
        "primaNeta": None,
        "formaPago": None,
    }

   

    # --------------------------------------------------------
    # NÚMERO DE PÓLIZA
    #
    # Póliza/Spto 2002500327726 / 001
    # --------------------------------------------------------

    match = re.search(
        r"Póliza/Spto\s+([0-9]{8,20})\s*/\s*[0-9]+",
        texto,
        re.IGNORECASE,
    )

    if match:
        resultado["numeroPoliza"] = match.group(1)

    # --------------------------------------------------------
    # FECHA DE EFECTO
    #
    # Fecha de efecto 09/06/2026 20:36:00
    # --------------------------------------------------------

    match = re.search(
        r"Fecha\s+de\s+efecto\s+"
        r"(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})"
        r"(?:\s+\d{1,2}:\d{2}:\d{2})?",
        texto,
        re.IGNORECASE,
    )

    if match:
        resultado["fechaEfecto"] = normalizar_fecha(
            match.group(1)
        )

    # --------------------------------------------------------
    # TOMADOR + DOCUMENTO
    #
    # Nombre MANUEL MUÑOZ GARCIA Documento ID 24151598B
    #
    # Lo hacemos en una sola expresión para evitar coger
    # nombres de otras partes del documento.
    # --------------------------------------------------------

    match = re.search(
        r"Nombre\s+(.+?)\s+Documento\s+ID\s+([A-Z0-9]{6,15})",
        texto,
        re.IGNORECASE,
    )

    if match:
        resultado["tomador"] = normalizar_espacios(
            match.group(1)
        )

        resultado["documentoFiscal"] = (
            match.group(2)
            .replace(" ", "")
            .upper()
        )

    # --------------------------------------------------------
    # PRIMA NETA
    #
    # En MAPFRE:
    #
    # PRIMA DEL SEGURO
    # ...
    # 145,27 € 0,00 € ...
    #
    # La primera cifra después de la cabecera es la prima neta.
    # --------------------------------------------------------

    posicion_prima = re.search(
        r"PRIMA\s+DEL\s+SEGURO",
        texto,
        re.IGNORECASE,
    )

    if posicion_prima:
        bloque_prima = texto[posicion_prima.end():]

        # Limitar la búsqueda para no saltar a otra sección.
        bloque_prima = bloque_prima[:1000]

        # Primera cantidad monetaria real del bloque.
        match = re.search(
            r"(?<![\d])(\d{1,3}(?:\.\d{3})*,\d{2})\s*[¤€]",
            bloque_prima,
        )

        if match:
            resultado["primaNeta"] = normalizar_importe(
                match.group(1)
            )

    # --------------------------------------------------------
    # FORMA DE PAGO
    #
    # Forma de pago ANUAL Medio de pago Domiciliación bancaria
    # --------------------------------------------------------

    match = re.search(
        r"Forma\s+de\s+pago\s+"
        r"(ANUAL|SEMESTRAL|TRIMESTRAL|MENSUAL)",
        texto,
        re.IGNORECASE,
    )

    if match:
        resultado["formaPago"] = (
            match.group(1).capitalize()
        )

    resultado["ramo"] = clasificar_ramo_mapfre(
    texto=texto,
    numero_poliza=resultado["numeroPoliza"],
    prima_neta=resultado["primaNeta"],
    )

    return resultado


# ============================================================
# VERTI
# ============================================================

def extraer_verti(texto: str) -> Dict[str, Any]:

    resultado = {
        "fechaEfecto": None,
        "documentoFiscal": None,
        "tomador": None,
        "numeroPoliza": None,
        "aseguradora": "Verti",
        "ramo": None,
        "primaNeta": None,
        "formaPago": None,
    }

    # --------------------------------------------------------
    # NÚMERO DE PÓLIZA
    # --------------------------------------------------------

    patrones_poliza = [
        r"Número\s+de\s+póliza\s*[:\-]?\s*([0-9]{7,20})",
        r"Nº\s*de\s*póliza\s*[:\-]?\s*([0-9]{7,20})",
        r"Póliza\s*[:\-]?\s*([0-9]{7,20})",
    ]

    for patron in patrones_poliza:
        match = re.search(
            patron,
            texto,
            re.IGNORECASE,
        )

        if match:
            resultado["numeroPoliza"] = match.group(1)
            break

    # --------------------------------------------------------
    # FECHA DE EFECTO
    # --------------------------------------------------------

    patrones_fecha = [
        r"Fecha\s+de\s+efecto\s*[:\-]?\s*"
        r"(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})",

        r"Fecha\s+efecto\s*[:\-]?\s*"
        r"(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})",

        r"Efecto\s*[:\-]?\s*"
        r"(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})",
    ]

    for patron in patrones_fecha:
        match = re.search(
            patron,
            texto,
            re.IGNORECASE,
        )

        if match:
            resultado["fechaEfecto"] = normalizar_fecha(
                match.group(1)
            )
            break

    # --------------------------------------------------------
    # DOCUMENTO FISCAL
    # --------------------------------------------------------

    patrones_documento = [
        r"\bNIF\s*[:\-]?\s*([A-Z0-9]{6,15})",
        r"\bCIF\s*[:\-]?\s*([A-Z0-9]{6,15})",
        r"\bNIE\s*[:\-]?\s*([A-Z0-9]{6,15})",
        r"\bDNI\s*[:\-]?\s*([A-Z0-9]{6,15})",
    ]

    for patron in patrones_documento:
        match = re.search(
            patron,
            texto,
            re.IGNORECASE,
        )

        if match:
            resultado["documentoFiscal"] = (
                match.group(1)
                .replace(" ", "")
                .upper()
            )
            break

    # --------------------------------------------------------
    # TOMADOR
    # --------------------------------------------------------

    patrones_tomador = [
        r"Tomador\s*[:\-]?\s*([^\n]+)",
        r"Tomador\s+de\s+la\s+póliza\s*[:\-]?\s*([^\n]+)",
    ]

    for patron in patrones_tomador:
        match = re.search(
            patron,
            texto,
            re.IGNORECASE,
        )

        if match:
            valor = normalizar_espacios(
                match.group(1)
            )

            if valor:
                resultado["tomador"] = valor
                break

    # --------------------------------------------------------
    # RAMO
    # --------------------------------------------------------

    patrones_ramo = [
        r"Producto\s*[:\-]?\s*([^\n]+)",
        r"Modalidad\s*[:\-]?\s*([^\n]+)",
        r"Tipo\s+de\s+seguro\s*[:\-]?\s*([^\n]+)",
    ]

    for patron in patrones_ramo:
        match = re.search(
            patron,
            texto,
            re.IGNORECASE,
        )

        if match:
            valor = normalizar_espacios(
                match.group(1)
            )

            if valor:
                resultado["ramo"] = valor
                break

    # --------------------------------------------------------
    # PRIMA NETA
    # --------------------------------------------------------

    patrones_prima = [
        r"Prima\s+neta\s*[:\-]?\s*"
        r"([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})",

        r"Prima\s+Neta\s+"
        r"([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})",
    ]

    for patron in patrones_prima:
        match = re.search(
            patron,
            texto,
            re.IGNORECASE,
        )

        if match:
            resultado["primaNeta"] = normalizar_importe(
                match.group(1)
            )
            break

    # --------------------------------------------------------
    # FORMA DE PAGO
    # --------------------------------------------------------

    match = re.search(
        r"(?:Forma\s+de\s+pago|Fraccionamiento|Periodicidad)"
        r"\s*[:\-]?\s*"
        r"(ANUAL|SEMESTRAL|TRIMESTRAL|MENSUAL)",
        texto,
        re.IGNORECASE,
    )

    if match:
        resultado["formaPago"] = (
            match.group(1).capitalize()
        )

    return resultado


# ============================================================
# FUNCIÓN PRINCIPAL
# ============================================================

def analizar_poliza(
    contenido: bytes,
    mime_type: str,
) -> Dict[str, Any]:

    if mime_type != "application/pdf":
        raise ValueError(
            "De momento el extractor admite PDF."
        )

    texto = extraer_texto_pdf(contenido)

    if not texto:
        raise ValueError(
            "No se ha podido extraer texto de la póliza."
        )

    aseguradora = detectar_aseguradora(texto)

    if aseguradora == "Mapfre":
        return extraer_mapfre(texto)

    if aseguradora == "Verti":
        return extraer_verti(texto)

    raise ValueError(
        "No se ha podido identificar la aseguradora. "
        "Solo se admiten pólizas MAPFRE y VERTI."
    )