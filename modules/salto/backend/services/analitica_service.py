"""
SERVICIO — Analítica avanzada de rendimiento del salto.

Incluye:
- Detección de fatiga intra-sesión (ventana de 2 horas)
- Curva de tendencia histórica con regresión lineal
"""

from __future__ import annotations

from datetime import datetime, timedelta
import math

import numpy as np

TIPOS_SALTO_VALIDOS = {"vertical", "horizontal"}
VENTANA_SESION_HORAS = 2
CAIDA_SIGNIFICATIVA_PCT = 10.0
UMBRAL_ESTANCADO_CM_SEMANA = 0.5


def _to_datetime(value) -> datetime | None:
    """Convierte diferentes representaciones de fecha a datetime."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _regresion_lineal(xs: list[float], ys: list[float]) -> tuple[float, float, float]:
    """
    Regresión lineal simple: y = m*x + b.

    Returns:
        (pendiente, intercepto, r2)
    """
    n = len(xs)
    if n == 0:
        return 0.0, 0.0, 0.0

    if n == 1:
        return 0.0, float(ys[0]), 1.0

    x = np.array(xs, dtype=float)
    y = np.array(ys, dtype=float)

    if np.allclose(x, x[0]):
        pendiente = 0.0
        intercepto = float(np.mean(y))
    else:
        pendiente, intercepto = np.polyfit(x, y, 1)
        pendiente = float(pendiente)
        intercepto = float(intercepto)

    y_pred = pendiente * x + intercepto
    ss_res = float(np.sum((y - y_pred) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))

    if math.isclose(ss_tot, 0.0, abs_tol=1e-12):
        r2 = 1.0 if math.isclose(ss_res, 0.0, abs_tol=1e-12) else 0.0
    else:
        r2 = 1.0 - (ss_res / ss_tot)

    r2 = max(0.0, min(1.0, r2))
    return pendiente, intercepto, r2


def _agrupar_sesiones(saltos_ordenados: list[dict]) -> list[list[dict]]:
    """
    Agrupa saltos por sesión usando una separación máxima de 2 horas
    entre saltos consecutivos.
    """
    if not saltos_ordenados:
        return []

    sesiones: list[list[dict]] = []
    actual: list[dict] = []
    ultimo_dt: datetime | None = None
    margen = timedelta(hours=VENTANA_SESION_HORAS)

    for salto in saltos_ordenados:
        dt = _to_datetime(salto.get("fecha_salto"))
        if dt is None:
            continue

        if not actual:
            actual = [salto]
            ultimo_dt = dt
            continue

        if ultimo_dt is not None and (dt - ultimo_dt) <= margen:
            actual.append(salto)
        else:
            sesiones.append(actual)
            actual = [salto]

        ultimo_dt = dt

    if actual:
        sesiones.append(actual)

    return sesiones


def calcular_fatiga_intra_sesion(saltos_ordenados: list[dict]) -> dict:
    """
    Analiza la sesión más reciente para detectar tendencia de fatiga.

    La pendiente se calcula en cm/salto (x = índice del salto dentro de la sesión).
    """
    if not saltos_ordenados:
        return {
            "pendiente": 0.0,
            "numero_saltos": 0,
            "caida_porcentual": 0.0,
            "fatiga_significativa": False,
            "sesion": None,
        }

    sesiones = _agrupar_sesiones(saltos_ordenados)
    if not sesiones:
        return {
            "pendiente": 0.0,
            "numero_saltos": 0,
            "caida_porcentual": 0.0,
            "fatiga_significativa": False,
            "sesion": None,
        }

    sesion = sesiones[-1]
    distancias = [float(s.get("distancia_cm", 0) or 0) for s in sesion]
    xs = [float(i) for i in range(len(distancias))]

    pendiente, _, _ = _regresion_lineal(xs, distancias)

    primero = distancias[0] if distancias else 0.0
    ultimo = distancias[-1] if distancias else 0.0
    if primero > 0:
        caida_pct = ((primero - ultimo) / primero) * 100.0
    else:
        caida_pct = 0.0

    fatiga_significativa = bool(pendiente < 0 and caida_pct > CAIDA_SIGNIFICATIVA_PCT)

    inicio = _to_datetime(sesion[0].get("fecha_salto"))
    fin = _to_datetime(sesion[-1].get("fecha_salto"))

    return {
        "pendiente": round(float(pendiente), 4),
        "numero_saltos": len(distancias),
        "caida_porcentual": round(float(caida_pct), 2),
        "fatiga_significativa": fatiga_significativa,
        "sesion": {
            "inicio": inicio.isoformat() if inicio else None,
            "fin": fin.isoformat() if fin else None,
        },
    }


def _clasificar_estado(pendiente_cm_semana: float) -> str:
    if pendiente_cm_semana > UMBRAL_ESTANCADO_CM_SEMANA:
        return "mejorando"
    if pendiente_cm_semana < -UMBRAL_ESTANCADO_CM_SEMANA:
        return "empeorando"
    return "estancado"


def calcular_tendencia_historial(saltos_ordenados: list[dict], semanas_prediccion: float = 4.0) -> dict:
    """
    Regresión lineal de todo el historial para una modalidad de salto.

    La pendiente se devuelve en cm/semana.
    """
    if not saltos_ordenados:
        return {
            "pendiente": 0.0,
            "pendiente_cm_semana": 0.0,
            "r2": 0.0,
            "prediccion_4_semanas": 0.0,
            "estado": "estancado",
            "numero_saltos": 0,
            "historial": [],
        }

    puntos = []
    for salto in saltos_ordenados:
        dt = _to_datetime(salto.get("fecha_salto"))
        if dt is None:
            continue
        puntos.append((dt, float(salto.get("distancia_cm", 0) or 0)))

    if not puntos:
        return {
            "pendiente": 0.0,
            "pendiente_cm_semana": 0.0,
            "r2": 0.0,
            "prediccion_4_semanas": 0.0,
            "estado": "estancado",
            "numero_saltos": 0,
            "historial": [],
        }

    origen = puntos[0][0]
    xs = [max(0.0, (dt - origen).total_seconds() / 604800.0) for dt, _ in puntos]
    ys = [valor for _, valor in puntos]

    pendiente, intercepto, r2 = _regresion_lineal(xs, ys)

    ultimo_x = xs[-1]
    pred_x = ultimo_x + semanas_prediccion
    pred_4 = pendiente * pred_x + intercepto

    historial = []
    for dt, valor in puntos:
        x = max(0.0, (dt - origen).total_seconds() / 604800.0)
        historial.append({
            "fecha": dt.isoformat(),
            "distancia_cm": round(valor, 2),
            "tendencia_cm": round((pendiente * x) + intercepto, 2),
        })

    estado = _clasificar_estado(float(pendiente))

    return {
        "pendiente": round(float(pendiente), 4),
        "pendiente_cm_semana": round(float(pendiente), 4),
        "r2": round(float(r2), 4),
        "prediccion_4_semanas": round(float(pred_4), 2),
        "estado": estado,
        "numero_saltos": len(historial),
        "historial": historial,
    }
