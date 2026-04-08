"""
SERVICIO — Lógica de negocio para progreso y comparativa de saltos.

Regla de negocio: mínimo 4 saltos verticales y 4 horizontales
para poder acceder a la comparativa.
"""

MINIMO_SALTOS_POR_TIPO = 4


def calcular_progreso(conteo: dict[str, int], alias: str, id_usuario: int) -> dict:
    """
    Devuelve el estado de progreso del usuario respecto al mínimo exigido.

    Args:
        conteo: {"vertical": N, "horizontal": M}
        alias: Alias del usuario.
        id_usuario: ID del usuario.
    """
    v = conteo.get("vertical", 0)
    h = conteo.get("horizontal", 0)
    completo = v >= MINIMO_SALTOS_POR_TIPO and h >= MINIMO_SALTOS_POR_TIPO

    return {
        "id_usuario": id_usuario,
        "alias": alias,
        "saltos_verticales": v,
        "saltos_horizontales": h,
        "minimo_requerido": MINIMO_SALTOS_POR_TIPO,
        "completo": completo,
        "faltan": {
            "vertical": max(0, MINIMO_SALTOS_POR_TIPO - v),
            "horizontal": max(0, MINIMO_SALTOS_POR_TIPO - h),
        },
    }


def _estadisticas_tipo(saltos: list[dict]) -> dict:
    """
    Calcula estadísticas para una lista de saltos del mismo tipo.

    Args:
        saltos: Rows de la tabla `saltos` ordenados por fecha ASC.
    """
    distancias = [s["distancia_cm"] for s in saltos]
    n = len(distancias)

    return {
        "total_saltos": n,
        "mejor_cm": max(distancias),
        "peor_cm": min(distancias),
        "media_cm": round(sum(distancias) / n, 2),
        "ultimo_cm": distancias[-1],
        "evolucion_cm": distancias,
    }


def calcular_comparativa(
    saltos_v: list[dict],
    saltos_h: list[dict],
) -> dict | None:
    """
    Calcula la comparativa intra-usuario (verticales entre sí,
    horizontales entre sí). Devuelve None si no se cumple el mínimo.

    Args:
        saltos_v: Saltos verticales del usuario (ordenados por fecha ASC).
        saltos_h: Saltos horizontales del usuario (ordenados por fecha ASC).
    """
    if len(saltos_v) < MINIMO_SALTOS_POR_TIPO or len(saltos_h) < MINIMO_SALTOS_POR_TIPO:
        return None

    stats_v = _estadisticas_tipo(saltos_v)
    stats_h = _estadisticas_tipo(saltos_h)

    return {
        "vertical": stats_v,
        "horizontal": stats_h,
        "resumen": (
            f"Mejor salto vertical: {stats_v['mejor_cm']} cm | "
            f"Mejor salto horizontal: {stats_h['mejor_cm']} cm"
        ),
    }
