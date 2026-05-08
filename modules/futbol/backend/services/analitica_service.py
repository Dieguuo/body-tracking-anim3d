"""
SERVICIO — Analítica avanzada del rendimiento de golpeo.

Funciones base:
- Detección de fatiga intra-sesión (ventana de 2h) basada en velocidad del pie.
- Tendencia histórica con regresión lineal.
- Comparativa de últimas N patadas.

Funciones avanzadas (paridad con módulo salto):
- Alertas de tendencia entre sesiones.
- Comparativa entre sesiones.
- Correlaciones entre métricas.
- Detección de estancamiento/mejora.
- Ranking de mejores sesiones.
- Predicción lineal a N semanas.
- Bloque analítico avanzado agregado.
"""

from __future__ import annotations

import math
from collections import defaultdict

import numpy as np

from utils.session_utils import to_datetime, agrupar_sesiones


CAIDA_SIGNIFICATIVA_PCT = 10.0
UMBRAL_ESTANCADO_MS_SEMANA = 0.05  # m/s/semana


def _regresion_lineal(xs: list[float], ys: list[float]) -> tuple[float, float, float]:
    n = len(xs)
    if n == 0:
        return 0.0, 0.0, 0.0
    if n == 1:
        return 0.0, float(ys[0]), 1.0

    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    den = sum((x - mean_x) ** 2 for x in xs)

    if den == 0:
        pendiente = 0.0
        intercepto = mean_y
    else:
        pendiente = num / den
        intercepto = mean_y - pendiente * mean_x

    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    ss_res = sum((y - (pendiente * x + intercepto)) ** 2 for x, y in zip(xs, ys))
    if ss_tot == 0:
        r2 = 1.0 if ss_res == 0 else 0.0
    else:
        r2 = max(0.0, min(1.0, 1.0 - ss_res / ss_tot))

    return float(pendiente), float(intercepto), float(r2)


def _valor_metrica(g: dict, metrica: str) -> float | None:
    if metrica == "velocidad_pie_ms":
        v = g.get("velocidad_pie_ms")
    else:
        v = g.get(metrica)
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(v):
        return None
    return v


def calcular_fatiga_intra_sesion(
    golpeos_ordenados: list[dict],
    metrica: str = "velocidad_pie_ms",
) -> dict:
    """
    Analiza la sesión más reciente (separación máx 2h entre golpeos).
    Calcula pendiente y caída porcentual de la métrica seleccionada.
    """
    base = {
        "pendiente": 0.0,
        "numero_golpeos": 0,
        "caida_porcentual": 0.0,
        "fatiga_significativa": False,
        "metrica": metrica,
        "sesion": None,
    }

    if not golpeos_ordenados:
        return base

    sesiones = agrupar_sesiones(golpeos_ordenados, campo_fecha="fecha_golpeo")
    if not sesiones:
        return base

    sesion = sesiones[-1]
    valores: list[float] = []
    for g in sesion:
        v = _valor_metrica(g, metrica)
        if v is not None:
            valores.append(v)

    if len(valores) < 2:
        return {**base, "numero_golpeos": len(valores)}

    xs = [float(i) for i in range(len(valores))]
    pendiente, _, _ = _regresion_lineal(xs, valores)

    primero = valores[0]
    ultimo = valores[-1]
    caida_pct = ((primero - ultimo) / primero) * 100.0 if primero > 0 else 0.0
    fatiga_sig = bool(pendiente < 0 and caida_pct > CAIDA_SIGNIFICATIVA_PCT)

    inicio = to_datetime(sesion[0].get("fecha_golpeo"))
    fin = to_datetime(sesion[-1].get("fecha_golpeo"))

    return {
        "pendiente": round(pendiente, 4),
        "numero_golpeos": len(valores),
        "caida_porcentual": round(caida_pct, 2),
        "fatiga_significativa": fatiga_sig,
        "metrica": metrica,
        "sesion": {
            "inicio": inicio.isoformat() if inicio else None,
            "fin": fin.isoformat() if fin else None,
        },
    }


def calcular_tendencia(
    golpeos_ordenados: list[dict],
    semanas_prediccion: float = 4.0,
    metrica: str = "velocidad_pie_ms",
) -> dict:
    """
    Regresión lineal de la métrica vs tiempo (semanas).
    """
    if not golpeos_ordenados:
        return _tendencia_vacia(metrica)

    puntos: list[tuple] = []  # (datetime, valor)
    for g in golpeos_ordenados:
        dt = to_datetime(g.get("fecha_golpeo"))
        if dt is None:
            continue
        v = _valor_metrica(g, metrica)
        if v is None:
            continue
        puntos.append((dt, v))

    if not puntos:
        return _tendencia_vacia(metrica)

    origen = puntos[0][0]
    xs = [max(0.0, (dt - origen).total_seconds() / 604800.0) for dt, _ in puntos]
    ys = [v for _, v in puntos]

    pendiente, intercepto, r2 = _regresion_lineal(xs, ys)
    pred_x = xs[-1] + semanas_prediccion
    pred = pendiente * pred_x + intercepto

    if pendiente > UMBRAL_ESTANCADO_MS_SEMANA:
        estado = "mejorando"
    elif pendiente < -UMBRAL_ESTANCADO_MS_SEMANA:
        estado = "empeorando"
    else:
        estado = "estancado"

    historial = []
    for (dt, v), x in zip(puntos, xs):
        historial.append({
            "fecha": dt.isoformat(),
            "valor": round(v, 3),
            "tendencia_valor": round(pendiente * x + intercepto, 3),
        })

    return {
        "pendiente": round(pendiente, 4),
        "r2": round(r2, 4),
        "prediccion_4_semanas": round(pred, 3),
        "estado": estado,
        "numero_golpeos": len(puntos),
        "historial": historial,
        "metrica": metrica,
        "unidad": "m/s" if metrica == "velocidad_pie_ms" else "",
    }


def calcular_comparativa(golpeos_recientes: list[dict], n: int = 4) -> dict:
    """
    Compara las últimas N patadas en métricas clave.
    """
    seleccion = golpeos_recientes[:n]

    items = []
    for g in seleccion:
        items.append({
            "id_golpeo": g.get("id_golpeo"),
            "fecha": _safe_iso(g.get("fecha_golpeo")),
            "velocidad_pie_ms": _safe_float(g.get("velocidad_pie_ms")),
            "angulo_cadera_deg": _safe_float(g.get("angulo_cadera_deg")),
            "angulo_rodilla_deg": _safe_float(g.get("angulo_rodilla_deg")),
            "angulo_tobillo_deg": _safe_float(g.get("angulo_tobillo_deg")),
            "estabilidad_tronco": _safe_float(g.get("estabilidad_tronco")),
            "clasificacion": g.get("clasificacion"),
        })

    return {"n": len(items), "golpeos": items}


def _tendencia_vacia(metrica: str) -> dict:
    return {
        "pendiente": 0.0,
        "r2": 0.0,
        "prediccion_4_semanas": 0.0,
        "estado": "sin_datos",
        "numero_golpeos": 0,
        "historial": [],
        "metrica": metrica,
        "unidad": "m/s" if metrica == "velocidad_pie_ms" else "",
    }


def _safe_float(v):
    if v is None:
        return None
    try:
        return round(float(v), 3)
    except (TypeError, ValueError):
        return None


def _safe_iso(v):
    dt = to_datetime(v)
    return dt.isoformat() if dt else (str(v) if v is not None else None)


# ─────────────────────────────────────────────────────────────
# Analítica avanzada (paridad con módulo salto)
# ─────────────────────────────────────────────────────────────

UMBRAL_CAIDA_FATIGA_PCT = 10.0
UMBRAL_ESTANCADO_MS_SEMANA_ABS = 0.02  # m/s/semana para estancamiento absoluto


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 2:
        return None
    x = np.array(xs, dtype=float)
    y = np.array(ys, dtype=float)
    if np.allclose(x, x[0]) or np.allclose(y, y[0]):
        return None
    corr = float(np.corrcoef(x, y)[0, 1])
    return None if math.isnan(corr) else round(corr, 4)


def _caida_pct_sesion_golpeos(sesion: list[dict], metrica: str = "velocidad_pie_ms") -> float:
    valores = [_valor_metrica(g, metrica) for g in sesion]
    valores = [v for v in valores if v is not None]
    if len(valores) < 2 or valores[0] <= 0:
        return 0.0
    return ((valores[0] - valores[-1]) / valores[0]) * 100.0


def calcular_alertas_tendencia(golpeos_ordenados: list[dict]) -> list[dict]:
    """
    Alertas heurísticas entre sesiones para golpeos:
    - Fatiga repetida en sesiones consecutivas.
    - Estabilidad de tronco degradándose progresivamente.
    - Velocidad del pie en caída sostenida.
    """
    alertas: list[dict] = []
    sesiones = agrupar_sesiones(golpeos_ordenados, campo_fecha="fecha_golpeo")
    if not sesiones:
        return alertas

    # Alerta: patrón de fatiga repetido (>=2 sesiones consecutivas con caída >10%).
    caidas = [
        _caida_pct_sesion_golpeos(s)
        for s in sesiones
        if len(s) >= 2
    ]
    consecutivas = max_consecutivas = 0
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
                f"con caída de velocidad del pie > {UMBRAL_CAIDA_FATIGA_PCT:.0f}%."
            ),
            "severidad": "alta",
        })

    # Alerta: estabilidad de tronco empeora en últimas 3 sesiones.
    if len(sesiones) >= 3:
        medias_estab = []
        for sesion in sesiones[-3:]:
            vals = [_safe_float(g.get("estabilidad_tronco")) for g in sesion]
            vals = [v for v in vals if v is not None]
            if vals:
                medias_estab.append(float(np.mean(vals)))
        if len(medias_estab) == 3 and medias_estab[0] > medias_estab[1] > medias_estab[2]:
            alertas.append({
                "codigo": "estabilidad_tronco_empeora",
                "mensaje": "La estabilidad de tronco media empeora progresivamente en las últimas 3 sesiones.",
                "severidad": "media",
            })

    # Alerta: velocidad del pie en caída sostenida (últimas 5 sesiones).
    if len(sesiones) >= 5:
        medias_vel = []
        for sesion in sesiones[-5:]:
            vals = [_valor_metrica(g, "velocidad_pie_ms") for g in sesion]
            vals = [v for v in vals if v is not None]
            if vals:
                medias_vel.append(float(np.mean(vals)))
        if len(medias_vel) >= 3:
            xs = list(range(len(medias_vel)))
            pendiente, _, _ = _regresion_lineal(xs, medias_vel)
            if pendiente < -0.05:
                alertas.append({
                    "codigo": "velocidad_pie_cae_sostenida",
                    "mensaje": "La velocidad del pie muestra tendencia descendente sostenida en las últimas sesiones.",
                    "severidad": "media",
                })

    return alertas


def calcular_comparativa_sesiones(
    golpeos_ordenados: list[dict],
    metrica: str = "velocidad_pie_ms",
    max_sesiones: int = 2,
) -> dict:
    """Compara las últimas N sesiones en la métrica indicada."""
    sesiones = agrupar_sesiones(golpeos_ordenados, campo_fecha="fecha_golpeo")
    if not sesiones:
        return {"sesiones": [], "metrica": metrica, "unidad": "m/s"}

    unidad = {
        "velocidad_pie_ms": "m/s",
        "angulo_cadera_deg": "°",
        "angulo_rodilla_deg": "°",
        "angulo_tobillo_deg": "°",
        "estabilidad_tronco": "u",
        "confianza": "",
    }.get(metrica, "u")

    seleccionadas = sesiones[-max_sesiones:]
    payload = []
    for idx, sesion in enumerate(seleccionadas, start=1):
        inicio = to_datetime(sesion[0].get("fecha_golpeo"))
        fin = to_datetime(sesion[-1].get("fecha_golpeo"))
        serie = []
        valores = []
        for i, g in enumerate(sesion, start=1):
            v = _valor_metrica(g, metrica)
            if v is None:
                continue
            valores.append(v)
            serie.append({"indice": i, "valor": round(v, 3)})
        payload.append({
            "nombre": f"Sesion {idx}",
            "inicio": inicio.isoformat() if inicio else None,
            "fin": fin.isoformat() if fin else None,
            "n_golpeos": len(serie),
            "media": round(float(np.mean(valores)), 3) if valores else 0.0,
            "serie": serie,
        })

    return {"sesiones": payload, "metrica": metrica, "unidad": unidad}


def calcular_correlaciones(historial_global: list[dict]) -> dict:
    """
    Correlaciones entre métricas clave de golpeo:
    - Velocidad del pie vs estabilidad de tronco.
    - Ángulo de cadera vs confianza de detección.
    - Ángulo de rodilla vs velocidad del pie.
    """
    xs_vel, ys_estab = [], []
    xs_cadera, ys_conf = [], []
    xs_rodilla, ys_vel2 = [], []
    puntos_vel_estab, puntos_cadera_conf = [], []

    for row in historial_global:
        vel = _safe_float(row.get("velocidad_pie_ms"))
        estab = _safe_float(row.get("estabilidad_tronco"))
        cadera = _safe_float(row.get("angulo_cadera_deg"))
        conf = _safe_float(row.get("confianza"))
        rodilla = _safe_float(row.get("angulo_rodilla_deg"))

        if vel is not None and estab is not None:
            xs_vel.append(vel)
            ys_estab.append(estab)
            if len(puntos_vel_estab) < 200:
                puntos_vel_estab.append({
                    "velocidad_pie_ms": vel,
                    "estabilidad_tronco": estab,
                    "alias": row.get("alias"),
                })
        if cadera is not None and conf is not None:
            xs_cadera.append(cadera)
            ys_conf.append(conf)
            if len(puntos_cadera_conf) < 200:
                puntos_cadera_conf.append({
                    "angulo_cadera_deg": cadera,
                    "confianza": conf,
                    "alias": row.get("alias"),
                })
        if rodilla is not None and vel is not None:
            xs_rodilla.append(rodilla)
            ys_vel2.append(vel)

    return {
        "velocidad_estabilidad": {
            "corr": _pearson(xs_vel, ys_estab),
            "muestras": len(xs_vel),
            "puntos": puntos_vel_estab,
        },
        "cadera_confianza": {
            "corr": _pearson(xs_cadera, ys_conf),
            "muestras": len(xs_cadera),
            "puntos": puntos_cadera_conf,
        },
        "rodilla_velocidad": {
            "corr": _pearson(xs_rodilla, ys_vel2),
            "muestras": len(xs_rodilla),
        },
    }


def detectar_estancamiento_mejora(
    golpeos_ordenados: list[dict],
    metrica: str = "velocidad_pie_ms",
) -> dict:
    """
    Detecta si el atleta está estancado, mejorando o empeorando
    comparando la ventana reciente con la ventana anterior.
    Requiere al menos 8 golpeos.
    """
    serie = [_valor_metrica(g, metrica) for g in golpeos_ordenados]
    serie = [v for v in serie if v is not None]

    if len(serie) < 8:
        return {
            "suficientes_datos": False,
            "mensaje": "Se requieren al menos 8 golpeos para evaluar estancamiento y mejora.",
            "metrica": metrica,
        }

    ventana = min(6, max(3, len(serie) // 2))
    recientes = np.array(serie[-ventana:], dtype=float)
    anteriores = np.array(serie[-(ventana * 2):-ventana], dtype=float)

    media_rec = float(np.mean(recientes))
    media_ant = float(np.mean(anteriores))
    var_rec = float(np.var(recientes))
    delta = media_rec - media_ant
    delta_pct = (delta / media_ant) * 100.0 if not math.isclose(media_ant, 0.0, abs_tol=1e-9) else 0.0

    umbral_abs = {"velocidad_pie_ms": 0.05, "estabilidad_tronco": 0.03}.get(metrica, 0.02)
    umbral_var = {"velocidad_pie_ms": 0.08, "estabilidad_tronco": 0.05}.get(metrica, 0.05)

    var_ant = float(np.var(anteriores))
    pooled = math.sqrt((var_rec / max(len(recientes), 1)) + (var_ant / max(len(anteriores), 1)))
    z_score = delta / pooled if pooled > 0 else 0.0

    mejora_significativa = bool(delta > umbral_abs and z_score > 1.96)
    empeora_significativa = bool(delta < -umbral_abs and z_score < -1.96)
    estancado = bool(abs(delta) < umbral_abs and var_rec < umbral_var)

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
        "estancado": estancado,
        "mejora_significativa": mejora_significativa,
        "empeora_significativa": empeora_significativa,
    }


def ranking_mejores_sesiones(
    historial_global: list[dict],
    top_n: int = 5,
) -> list[dict]:
    """
    Ranking de sesiones por velocidad media del pie.
    Agrupa por (id_usuario) y luego por sesión temporal.
    """
    grupos: dict[int, list[dict]] = defaultdict(list)
    for row in historial_global:
        id_u = row.get("id_usuario")
        if id_u is not None:
            grupos[int(id_u)].append(row)

    sesiones_payload: list[dict] = []
    for id_usuario, golpeos in grupos.items():
        sesiones = agrupar_sesiones(golpeos, campo_fecha="fecha_golpeo")
        for sesion in sesiones:
            vels = [_valor_metrica(g, "velocidad_pie_ms") for g in sesion]
            vels = [v for v in vels if v is not None]
            if not vels:
                continue
            inicio = to_datetime(sesion[0].get("fecha_golpeo"))
            sesiones_payload.append({
                "id_usuario": id_usuario,
                "alias": sesion[0].get("alias"),
                "inicio": inicio.isoformat() if inicio else None,
                "golpeos": len(vels),
                "media_velocidad_pie_ms": round(float(np.mean(vels)), 3),
                "max_velocidad_pie_ms": round(float(np.max(vels)), 3),
            })

    sesiones_payload.sort(key=lambda x: x["media_velocidad_pie_ms"], reverse=True)
    top = sesiones_payload[:top_n]
    for i, row in enumerate(top, start=1):
        row["posicion"] = i
    return top


def calcular_analitica_avanzada(
    golpeos_ordenados: list[dict],
    historial_global: list[dict] | None = None,
    metrica: str = "velocidad_pie_ms",
) -> dict:
    """
    Bloque analítico agregado: combina alertas, estancamiento,
    comparativa de sesiones y (opcionalmente) correlaciones globales.
    Equivalente a analitica_avanzada del módulo salto.
    """
    alertas = calcular_alertas_tendencia(golpeos_ordenados)
    estancamiento = detectar_estancamiento_mejora(golpeos_ordenados, metrica=metrica)
    comparativa = calcular_comparativa_sesiones(golpeos_ordenados, metrica=metrica, max_sesiones=3)
    correlaciones = calcular_correlaciones(historial_global) if historial_global else None

    tendencia = calcular_tendencia(golpeos_ordenados, metrica=metrica)

    return {
        "metrica": metrica,
        "estado_general": tendencia.get("estado", "sin_datos"),
        "alertas": alertas,
        "estancamiento": estancamiento,
        "comparativa_sesiones": comparativa,
        "correlaciones": correlaciones,
        "resumen_tendencia": {
            "pendiente": tendencia.get("pendiente"),
            "r2": tendencia.get("r2"),
            "prediccion_4_semanas": tendencia.get("prediccion_4_semanas"),
            "numero_golpeos": tendencia.get("numero_golpeos"),
        },
    }
