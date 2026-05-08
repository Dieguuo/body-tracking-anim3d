"""
Utilidades de serializacion.
"""

from decimal import Decimal


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


# Convierte valores a float seguro para JSON/DB.
def normalizar_float(valor):
    if valor is None:
        return None
    if isinstance(valor, Decimal):
        return float(valor)
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None
