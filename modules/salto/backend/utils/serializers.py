"""
Utilidades compartidas de serialización para respuestas JSON.
"""


def serializar_row(row: dict) -> dict:
    """Convierte Decimal/datetime a tipos serializables JSON."""
    out = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        elif hasattr(v, "__float__"):
            out[k] = float(v)
        else:
            out[k] = v
    return out


def float_optional(data: dict, key: str) -> float | None:
    """Extrae un campo numérico opcional. Lanza ValueError(key) si no es numérico."""
    value = data.get(key)
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        raise ValueError(key)


CAMPOS_FLOAT_SALTO = (
    "tiempo_vuelo_s",
    "confianza_ia",
    "potencia_w",
    "asimetria_pct",
    "angulo_rodilla_deg",
    "angulo_cadera_deg",
    "estabilidad_aterrizaje",
)


def extraer_campos_float_salto(data: dict) -> dict[str, float | None]:
    """
    Extrae los campos float opcionales de un salto.

    Returns:
        Diccionario con los valores. Lanza ValueError si un campo no es numérico.
    """
    return {campo: float_optional(data, campo) for campo in CAMPOS_FLOAT_SALTO}
