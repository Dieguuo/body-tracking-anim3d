"""
SERVICIO — Analítica avanzada de rendimiento del salto.

Incluye:
- Detección de fatiga intra-sesión (ventana de 2 horas)
- Curva de tendencia histórica con regresión lineal
"""

from __future__ import annotations

from datetime import datetime, timedelta
import math
from collections import defaultdict

import numpy as np

from services.biomecanica_service import BiomecanicaService
from utils.session_utils import to_datetime as _to_datetime, agrupar_sesiones, VENTANA_SESION_HORAS

TIPOS_SALTO_VALIDOS = {"vertical", "horizontal"}
CAIDA_SIGNIFICATIVA_PCT = 10.0
UMBRAL_ESTANCADO_CM_SEMANA = 0.5
UMBRAL_CAIDA_FATIGA_PCT = 10.0


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
    return agrupar_sesiones(saltos_ordenados, campo_fecha="fecha_salto")


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


def _extraer_valor_metrica(
    salto: dict,
    metrica: str,
    peso_kg: float | None,
) -> float | None:
    distancia = float(salto.get("distancia_cm", 0) or 0)
    if metrica == "potencia_estimada":
        potencia_guardada = _safe_float(salto.get("potencia_w"))
        if potencia_guardada is not None:
            return float(potencia_guardada)

        tipo = str(salto.get("tipo_salto") or "").strip().lower()
        tiempo_vuelo_s = _safe_float(salto.get("tiempo_vuelo_s"))
        if tipo == "horizontal":
            return _potencia_horizontal_estimada(distancia, tiempo_vuelo_s, peso_kg)

        if peso_kg is None or peso_kg <= 0:
            return None
        return float(BiomecanicaService.potencia_sayers(distancia, peso_kg))
    return distancia


def _potencia_horizontal_estimada(
    distancia_cm: float,
    tiempo_vuelo_s: float | None,
    peso_kg: float | None,
) -> float | None:
    if peso_kg is None or peso_kg <= 0:
        return None
    if tiempo_vuelo_s is None or tiempo_vuelo_s <= 0:
        return None
    if distancia_cm <= 0:
        return None

    distancia_m = float(distancia_cm) / 100.0
    t = float(tiempo_vuelo_s)
    vx = distancia_m / t
    vy = 9.81 * t / 2.0
    energia_j = 0.5 * float(peso_kg) * ((vx * vx) + (vy * vy))

    t_impulso = min(0.35, max(0.18, 0.45 * t))
    if t_impulso <= 0:
        return None
    potencia_w = energia_j / t_impulso
    if not np.isfinite(potencia_w) or potencia_w <= 0:
        return None
    return float(potencia_w)


def calcular_tendencia_historial(
    saltos_ordenados: list[dict],
    semanas_prediccion: float = 4.0,
    metrica: str = "distancia",
    peso_kg: float | None = None,
) -> dict:
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
            "metrica": metrica,
            "unidad": "W" if metrica == "potencia_estimada" else "cm",
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
            "metrica": metrica,
            "unidad": "W" if metrica == "potencia_estimada" else "cm",
        }

    origen = puntos[0][0]
    puntos_metrica = []
    for salto in saltos_ordenados:
        dt = _to_datetime(salto.get("fecha_salto"))
        if dt is None:
            continue
        valor = _extraer_valor_metrica(salto, metrica, peso_kg)
        if valor is None:
            continue
        puntos_metrica.append((dt, float(valor)))

    if not puntos_metrica:
        return {
            "pendiente": 0.0,
            "pendiente_cm_semana": 0.0,
            "r2": 0.0,
            "prediccion_4_semanas": 0.0,
            "estado": "sin_datos",
            "numero_saltos": 0,
            "historial": [],
            "metrica": metrica,
            "unidad": "W" if metrica == "potencia_estimada" else "cm",
            "mensaje": "No hay datos suficientes para calcular la métrica seleccionada.",
        }

    xs = [max(0.0, (dt - origen).total_seconds() / 604800.0) for dt, _ in puntos_metrica]
    ys = [valor for _, valor in puntos_metrica]

    pendiente, intercepto, r2 = _regresion_lineal(xs, ys)

    ultimo_x = xs[-1]
    pred_x = ultimo_x + semanas_prediccion
    pred_4 = pendiente * pred_x + intercepto

    historial = []
    for dt, valor in puntos_metrica:
        x = max(0.0, (dt - origen).total_seconds() / 604800.0)
        historial.append({
            "fecha": dt.isoformat(),
            "valor": round(valor, 2),
            "tendencia_valor": round((pendiente * x) + intercepto, 2),
            # Compatibilidad con frontend previo
            "distancia_cm": round(valor, 2),
            "tendencia_cm": round((pendiente * x) + intercepto, 2),
        })

    estado = _clasificar_estado(float(pendiente))

    unidad = "W" if metrica == "potencia_estimada" else "cm"
    return {
        "pendiente": round(float(pendiente), 4),
        "pendiente_cm_semana": round(float(pendiente), 4),
        "r2": round(float(r2), 4),
        "prediccion_4_semanas": round(float(pred_4), 2),
        "estado": estado,
        "numero_saltos": len(historial),
        "historial": historial,
        "metrica": metrica,
        "unidad": unidad,
    }


def _caida_pct_sesion(sesion: list[dict]) -> float:
    if not sesion:
        return 0.0
    distancias = [float(s.get("distancia_cm", 0) or 0) for s in sesion]
    if not distancias:
        return 0.0
    primero = distancias[0]
    ultimo = distancias[-1]
    if primero <= 0:
        return 0.0
    return ((primero - ultimo) / primero) * 100.0


def calcular_alertas_tendencia(saltos_ordenados: list[dict], peso_kg: float | None = None) -> list[dict]:
    """
    Alertas heurísticas entre sesiones.

    Implementa en esta iteración:
    - Potencia cae de forma sostenida (estimada con Sayers si hay peso)
    - Patrón de fatiga repetido en sesiones consecutivas
    """
    alertas: list[dict] = []
    sesiones = _agrupar_sesiones(saltos_ordenados)
    if not sesiones:
        return alertas

    # Alerta: patrón de fatiga repetido (>=2 sesiones consecutivas con caída >10%).
    caidas = [
        _caida_pct_sesion(sesion)
        for sesion in sesiones
        if len(sesion) >= 2
    ]

    consecutivas = 0
    max_consecutivas = 0
    for c in caidas:
        if c > UMBRAL_CAIDA_FATIGA_PCT:
            consecutivas += 1
            max_consecutivas = max(max_consecutivas, consecutivas)
        else:
            consecutivas = 0

    if max_consecutivas >= 2:
        alertas.append({
            "codigo": "fatiga_repetida",
            "mensaje": (
                f"Patrón de fatiga repetido: {max_consecutivas} sesiones consecutivas "
                f"con caída > {UMBRAL_CAIDA_FATIGA_PCT:.0f}%."
            ),
            "severidad": "alta",
        })

    # Alerta: asimetría empeora en últimas 3 sesiones.
    if len(sesiones) >= 3:
        medias_asimetria = []
        for sesion in sesiones[-3:]:
            valores = [
                _safe_float(s.get("asimetria_pct"))
                for s in sesion
                if _safe_float(s.get("asimetria_pct")) is not None
            ]
            if valores:
                medias_asimetria.append(float(np.mean(valores)))

        if len(medias_asimetria) == 3 and medias_asimetria[0] < medias_asimetria[1] < medias_asimetria[2]:
            alertas.append({
                "codigo": "asimetria_empeora",
                "mensaje": "La asimetría media empeora de forma progresiva en las últimas 3 sesiones.",
                "severidad": "media",
            })

    # Alerta: caída sostenida de potencia (estimada) en las últimas 5 sesiones.
    if peso_kg is not None and peso_kg > 0 and len(sesiones) >= 5:
        ultimas = sesiones[-5:]
        potencias_media = []
        for sesion in ultimas:
            distancias = [float(s.get("distancia_cm", 0) or 0) for s in sesion]
            if not distancias:
                continue
            potencias = [BiomecanicaService.potencia_sayers(d, peso_kg) for d in distancias]
            potencias_media.append(float(np.mean(potencias)))

        if len(potencias_media) >= 3:
            xs = [float(i) for i in range(len(potencias_media))]
            pendiente, _, _ = _regresion_lineal(xs, potencias_media)
            if pendiente < -5.0:
                alertas.append({
                    "codigo": "potencia_cae_sostenida",
                    "mensaje": "La potencia estimada muestra tendencia descendente sostenida en las últimas sesiones.",
                    "severidad": "media",
                })

    return alertas


def _safe_float(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 2 or len(ys) < 2:
        return None
    x = np.array(xs, dtype=float)
    y = np.array(ys, dtype=float)
    if np.allclose(x, x[0]) or np.allclose(y, y[0]):
        return None
    corr = float(np.corrcoef(x, y)[0, 1])
    if math.isnan(corr):
        return None
    return round(corr, 4)


def _valor_metrica_avanzada(
    salto: dict,
    metrica: str,
    peso_kg: float | None,
) -> float | None:
    if metrica == "asimetria":
        return _safe_float(salto.get("asimetria_pct"))
    if metrica == "estabilidad":
        return _safe_float(salto.get("estabilidad_aterrizaje"))
    if metrica == "potencia_estimada":
        potencia = _safe_float(salto.get("potencia_w"))
        if potencia is not None:
            return potencia
        if peso_kg and peso_kg > 0:
            distancia = _safe_float(salto.get("distancia_cm")) or 0.0
            return float(BiomecanicaService.potencia_sayers(distancia, peso_kg))
        return None
    return _safe_float(salto.get("distancia_cm"))


def calcular_evolucion_asimetria(saltos_ordenados: list[dict]) -> dict:
    puntos: list[tuple[datetime, float]] = []
    for salto in saltos_ordenados:
        dt = _to_datetime(salto.get("fecha_salto"))
        asimetria = _safe_float(salto.get("asimetria_pct"))
        if dt is None or asimetria is None:
            continue
        puntos.append((dt, asimetria))

    if not puntos:
        return {
            "numero_saltos": 0,
            "pendiente_pct_semana": 0.0,
            "r2": 0.0,
            "estado": "sin_datos",
            "historial": [],
        }

    origen = puntos[0][0]
    xs = [max(0.0, (dt - origen).total_seconds() / 604800.0) for dt, _ in puntos]
    ys = [v for _, v in puntos]
    pendiente, intercepto, r2 = _regresion_lineal(xs, ys)

    if pendiente > 0.35:
        estado = "empeorando"
    elif pendiente < -0.35:
        estado = "mejorando"
    else:
        estado = "estable"

    historial = []
    for dt, valor in puntos:
        x = max(0.0, (dt - origen).total_seconds() / 604800.0)
        historial.append({
            "fecha": dt.isoformat(),
            "asimetria_pct": round(valor, 2),
            "tendencia_asimetria_pct": round((pendiente * x) + intercepto, 2),
        })

    return {
        "numero_saltos": len(historial),
        "pendiente_pct_semana": round(float(pendiente), 4),
        "r2": round(float(r2), 4),
        "estado": estado,
        "historial": historial,
    }


def calcular_comparativa_sesiones(
    saltos_ordenados: list[dict],
    metrica: str = "distancia",
    peso_kg: float | None = None,
    max_sesiones: int = 2,
) -> dict:
    sesiones = _agrupar_sesiones(saltos_ordenados)
    if not sesiones:
        return {"sesiones": [], "metrica": metrica, "unidad": "cm"}

    unidad = {
        "distancia": "cm",
        "potencia_estimada": "W",
        "asimetria": "%",
        "estabilidad": "u",
    }.get(metrica, "u")

    seleccionadas = sesiones[-max_sesiones:]
    payload_sesiones = []
    for idx, sesion in enumerate(seleccionadas, start=1):
        inicio = _to_datetime(sesion[0].get("fecha_salto"))
        fin = _to_datetime(sesion[-1].get("fecha_salto"))

        serie = []
        valores = []
        for i, salto in enumerate(sesion, start=1):
            valor = _valor_metrica_avanzada(salto, metrica, peso_kg)
            if valor is None:
                continue
            valores.append(valor)
            serie.append({"indice": i, "valor": round(valor, 2)})

        payload_sesiones.append({
            "nombre": f"Sesion {idx}",
            "inicio": inicio.isoformat() if inicio else None,
            "fin": fin.isoformat() if fin else None,
            "n_saltos": len(serie),
            "media": round(float(np.mean(valores)), 2) if valores else 0.0,
            "serie": serie,
        })

    return {
        "sesiones": payload_sesiones,
        "metrica": metrica,
        "unidad": unidad,
    }


def calcular_correlaciones(historial_global: list[dict]) -> dict:
    xs_peso: list[float] = []
    ys_potencia: list[float] = []
    ys_distancia: list[float] = []
    puntos_peso_potencia_distancia: list[dict] = []

    xs_asimetria: list[float] = []
    ys_estabilidad: list[float] = []
    puntos_asimetria_estabilidad: list[dict] = []

    for row in historial_global:
        peso = _safe_float(row.get("peso_kg"))
        distancia = _safe_float(row.get("distancia_cm"))
        potencia = _safe_float(row.get("potencia_w"))
        if potencia is None and peso and peso > 0 and distancia is not None:
            potencia = float(BiomecanicaService.potencia_sayers(distancia, peso))

        if peso is not None and potencia is not None and distancia is not None:
            xs_peso.append(peso)
            ys_potencia.append(potencia)
            ys_distancia.append(distancia)
            if len(puntos_peso_potencia_distancia) < 160:
                puntos_peso_potencia_distancia.append({
                    "peso_kg": round(peso, 2),
                    "potencia_w": round(potencia, 2),
                    "distancia_cm": round(distancia, 2),
                    "alias": row.get("alias"),
                })

        asimetria = _safe_float(row.get("asimetria_pct"))
        estabilidad = _safe_float(row.get("estabilidad_aterrizaje"))
        if asimetria is not None and estabilidad is not None:
            xs_asimetria.append(asimetria)
            ys_estabilidad.append(estabilidad)
            if len(puntos_asimetria_estabilidad) < 160:
                puntos_asimetria_estabilidad.append({
                    "asimetria_pct": round(asimetria, 2),
                    "estabilidad_aterrizaje": round(estabilidad, 2),
                    "alias": row.get("alias"),
                })

    return {
        "peso_potencia_distancia": {
            "corr_peso_potencia": _pearson(xs_peso, ys_potencia),
            "corr_peso_distancia": _pearson(xs_peso, ys_distancia),
            "corr_potencia_distancia": _pearson(ys_potencia, ys_distancia),
            "muestras": len(xs_peso),
            "puntos": puntos_peso_potencia_distancia,
        },
        "asimetria_estabilidad": {
            "corr_asimetria_estabilidad": _pearson(xs_asimetria, ys_estabilidad),
            "muestras": len(xs_asimetria),
            "puntos": puntos_asimetria_estabilidad,
        },
    }


def detectar_estancamiento_mejora(
    saltos_ordenados: list[dict],
    metrica: str = "distancia",
    peso_kg: float | None = None,
) -> dict:
    serie = []
    for salto in saltos_ordenados:
        dt = _to_datetime(salto.get("fecha_salto"))
        valor = _valor_metrica_avanzada(salto, metrica, peso_kg)
        if dt is None or valor is None:
            continue
        serie.append(valor)

    if len(serie) < 8:
        return {
            "suficientes_datos": False,
            "mensaje": "Se requieren al menos 8 saltos para evaluar estancamiento y mejora.",
            "metrica": metrica,
        }

    ventana = min(6, max(3, len(serie) // 2))
    recientes = np.array(serie[-ventana:], dtype=float)
    anteriores = np.array(serie[-(ventana * 2):-ventana], dtype=float)

    media_rec = float(np.mean(recientes))
    media_ant = float(np.mean(anteriores))
    var_rec = float(np.var(recientes))
    var_ant = float(np.var(anteriores))
    delta = media_rec - media_ant

    if math.isclose(media_ant, 0.0, abs_tol=1e-9):
        delta_pct = 0.0
    else:
        delta_pct = (delta / media_ant) * 100.0

    umbral_abs = {
        "distancia": 1.2,
        "potencia_estimada": 30.0,
        "asimetria": 1.8,
        "estabilidad": 0.08,
    }.get(metrica, 1.0)
    umbral_var = {
        "distancia": 2.0,
        "potencia_estimada": 350.0,
        "asimetria": 5.0,
        "estabilidad": 0.03,
    }.get(metrica, 2.0)

    pooled = math.sqrt((var_rec / max(len(recientes), 1)) + (var_ant / max(len(anteriores), 1)))
    z_score = delta / pooled if pooled > 0 else 0.0

    if metrica == "asimetria":
        mejora_significativa = delta < -umbral_abs and z_score < -1.96
        empeora_significativa = delta > umbral_abs and z_score > 1.96
        estancado = abs(delta) < umbral_abs and var_rec < umbral_var
    else:
        mejora_significativa = delta > umbral_abs and z_score > 1.96
        empeora_significativa = delta < -umbral_abs and z_score < -1.96
        estancado = abs(delta) < umbral_abs and var_rec < umbral_var

    return {
        "suficientes_datos": True,
        "metrica": metrica,
        "ventana": ventana,
        "media_anteriores": round(media_ant, 3),
        "media_recientes": round(media_rec, 3),
        "delta": round(delta, 3),
        "delta_pct": round(delta_pct, 2),
        "z_score": round(float(z_score), 3),
        "varianza_reciente": round(var_rec, 4),
        "estancado": bool(estancado),
        "mejora_significativa": bool(mejora_significativa),
        "empeora_significativa": bool(empeora_significativa),
    }


def ranking_mejores_sesiones(
    historial_global: list[dict],
    tipo_salto: str | None = None,
    top_n: int = 5,
) -> list[dict]:
    grupos_por_usuario_tipo: dict[tuple[int, str], list[dict]] = defaultdict(list)
    for row in historial_global:
        tipo = str(row.get("tipo_salto") or "").lower()
        if tipo_salto and tipo != tipo_salto:
            continue
        id_usuario = row.get("id_usuario")
        if id_usuario is None:
            continue
        grupos_por_usuario_tipo[(int(id_usuario), tipo)].append(row)

    sesiones_payload: list[dict] = []
    for (id_usuario, tipo), rows in grupos_por_usuario_tipo.items():
        sesiones = _agrupar_sesiones(rows)
        for sesion in sesiones:
            distancias = [
                _safe_float(s.get("distancia_cm"))
                for s in sesion
                if _safe_float(s.get("distancia_cm")) is not None
            ]
            if not distancias:
                continue
            inicio = _to_datetime(sesion[0].get("fecha_salto"))
            sesiones_payload.append({
                "id_usuario": id_usuario,
                "alias": sesion[0].get("alias"),
                "tipo_salto": tipo,
                "inicio": inicio.isoformat() if inicio else None,
                "saltos": len(distancias),
                "media_distancia_cm": round(float(np.mean(distancias)), 2),
                "max_distancia_cm": round(float(np.max(distancias)), 2),
            })

    sesiones_payload.sort(key=lambda x: x["media_distancia_cm"], reverse=True)
    top = sesiones_payload[:top_n]
    for i, row in enumerate(top, start=1):
        row["posicion"] = i
    return top


def comparar_tipos_usuario(
    saltos_vertical: list[dict],
    saltos_horizontal: list[dict],
    peso_kg: float | None,
) -> dict:
    def _resumen(saltos: list[dict], tipo: str) -> dict:
        dist = [
            _safe_float(s.get("distancia_cm"))
            for s in saltos
            if _safe_float(s.get("distancia_cm")) is not None
        ]
        pot = [
            _valor_metrica_avanzada(s, "potencia_estimada", peso_kg)
            for s in saltos
            if _valor_metrica_avanzada(s, "potencia_estimada", peso_kg) is not None
        ]
        asi = [
            _safe_float(s.get("asimetria_pct"))
            for s in saltos
            if _safe_float(s.get("asimetria_pct")) is not None
        ]
        return {
            "tipo_salto": tipo,
            "numero_saltos": len(dist),
            "distancia_media_cm": round(float(np.mean(dist)), 2) if dist else None,
            "potencia_media_w": round(float(np.mean(pot)), 2) if pot else None,
            "asimetria_media_pct": round(float(np.mean(asi)), 2) if asi else None,
        }

    vertical = _resumen(saltos_vertical, "vertical")
    horizontal = _resumen(saltos_horizontal, "horizontal")

    recomendacion = "Datos insuficientes para comparar tipos de salto."
    if vertical["distancia_media_cm"] is not None and horizontal["distancia_media_cm"] is not None:
        if vertical["distancia_media_cm"] > horizontal["distancia_media_cm"]:
            recomendacion = "Mayor rendimiento medio en salto vertical."
        elif vertical["distancia_media_cm"] < horizontal["distancia_media_cm"]:
            recomendacion = "Mayor rendimiento medio en salto horizontal."
        else:
            recomendacion = "Rendimiento medio similar entre vertical y horizontal."

    return {
        "vertical": vertical,
        "horizontal": horizontal,
        "recomendacion": recomendacion,
    }


def prediccion_multivariable_usuario(
    saltos_ordenados: list[dict],
    peso_kg: float | None,
    semanas_prediccion: float = 4.0,
) -> dict:
    puntos = []
    for salto in saltos_ordenados:
        dt = _to_datetime(salto.get("fecha_salto"))
        distancia = _safe_float(salto.get("distancia_cm"))
        potencia = _valor_metrica_avanzada(salto, "potencia_estimada", peso_kg)
        asimetria = _safe_float(salto.get("asimetria_pct"))
        if dt is None or distancia is None or potencia is None or asimetria is None:
            continue
        puntos.append((dt, distancia, potencia, asimetria))

    if len(puntos) < 6:
        return {
            "suficientes_datos": False,
            "mensaje": "Se requieren al menos 6 saltos con potencia y asimetría para predicción multivariable.",
        }

    origen = puntos[0][0]
    x_rows = []
    y = []
    for dt, distancia, potencia, asimetria in puntos:
        semanas = max(0.0, (dt - origen).total_seconds() / 604800.0)
        x_rows.append([1.0, semanas, potencia, asimetria])
        y.append(distancia)

    x = np.array(x_rows, dtype=float)
    y_arr = np.array(y, dtype=float)
    coefs, _, _, _ = np.linalg.lstsq(x, y_arr, rcond=None)
    y_pred = x @ coefs

    ss_res = float(np.sum((y_arr - y_pred) ** 2))
    ss_tot = float(np.sum((y_arr - np.mean(y_arr)) ** 2))
    r2 = 1.0 - (ss_res / ss_tot) if not math.isclose(ss_tot, 0.0, abs_tol=1e-12) else 1.0
    r2 = max(0.0, min(1.0, r2))

    ult_semana = max(0.0, (puntos[-1][0] - origen).total_seconds() / 604800.0)
    pot_media = float(np.mean([p[2] for p in puntos[-4:]]))
    asi_media = float(np.mean([p[3] for p in puntos[-4:]]))
    x_future = np.array([1.0, ult_semana + semanas_prediccion, pot_media, asi_media], dtype=float)
    pred = float(x_future @ coefs)

    return {
        "suficientes_datos": True,
        "prediccion_4_semanas": round(pred, 2),
        "r2": round(float(r2), 4),
        "muestras": len(puntos),
        "coeficientes": {
            "intercepto": round(float(coefs[0]), 5),
            "semanas": round(float(coefs[1]), 5),
            "potencia_w": round(float(coefs[2]), 5),
            "asimetria_pct": round(float(coefs[3]), 5),
        },
    }
