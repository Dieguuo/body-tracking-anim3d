"""
Utilidades compartidas para agrupacion de sesiones y conversion de fechas.
"""

from __future__ import annotations

from datetime import datetime, timedelta

VENTANA_SESION_HORAS = 2


def to_datetime(value) -> datetime | None:
    """Convierte diferentes representaciones de fecha a datetime."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def agrupar_sesiones(
    items_ordenados: list[dict],
    campo_fecha: str = "fecha_golpeo",
) -> list[list[dict]]:
    """
    Agrupa items por sesion usando una separacion maxima de 2 horas
    entre registros consecutivos.

    Args:
        items_ordenados: Registros ordenados por fecha ASC.
        campo_fecha: Nombre de la clave que contiene la fecha.
    """
    if not items_ordenados:
        return []

    sesiones: list[list[dict]] = []
    actual: list[dict] = []
    ultimo_dt: datetime | None = None
    margen = timedelta(hours=VENTANA_SESION_HORAS)

    for item in items_ordenados:
        dt = to_datetime(item.get(campo_fecha))
        if dt is None:
            continue

        if not actual:
            actual = [item]
            ultimo_dt = dt
            continue

        if ultimo_dt is not None and (dt - ultimo_dt) <= margen:
            actual.append(item)
        else:
            sesiones.append(actual)
            actual = [item]

        ultimo_dt = dt

    if actual:
        sesiones.append(actual)

    return sesiones
