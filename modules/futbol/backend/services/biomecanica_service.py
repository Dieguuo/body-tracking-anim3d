"""
Funciones geometricas basicas para biomecanica.
"""

import math


# Calcula el angulo en grados entre tres puntos.
def angulo_3p(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> float | None:
    if not a or not b or not c:
        return None

    ba = (a[0] - b[0], a[1] - b[1])
    bc = (c[0] - b[0], c[1] - b[1])
    norm_ba = math.hypot(ba[0], ba[1])
    norm_bc = math.hypot(bc[0], bc[1])
    if norm_ba == 0 or norm_bc == 0:
        return None

    cos_ang = (ba[0] * bc[0] + ba[1] * bc[1]) / (norm_ba * norm_bc)
    cos_ang = max(-1.0, min(1.0, cos_ang))
    return math.degrees(math.acos(cos_ang))


# Devuelve el punto medio entre dos coordenadas.
def mid_point(a: tuple[float, float] | None, b: tuple[float, float] | None) -> tuple[float, float] | None:
    if not a or not b:
        return None
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
