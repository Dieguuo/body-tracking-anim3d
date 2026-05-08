"""
SERVICIO — Estabilidad temporal del tronco y de la pierna de apoyo.

Va más allá del valor puntual de estabilidad_tronco devolviendo
oscilación temporal y estabilidad específica del apoyo durante el impacto.
"""

from __future__ import annotations

import statistics

from services.biomecanica_service import angulo_3p, mid_point


def estabilidad_tronco_temporal(frames, ancho: int) -> dict:
    """
    Curva de oscilación lateral del tronco (centro hombros) a lo largo del gesto.

    Devuelve:
      {
        "oscilacion_pct": float,    # desv estándar / ancho * 100
        "score": float,             # 0-100, 100 = perfecto
        "centros_x_norm": [float],  # serie temporal normalizada al ancho
      }
    """
    if not frames or ancho <= 0:
        return {"oscilacion_pct": None, "score": None, "centros_x_norm": []}

    centros: list[float] = []
    for f in frames:
        c = mid_point(f.hombro_izq, f.hombro_der)
        if c is not None:
            centros.append(c[0])

    if len(centros) < 2:
        return {"oscilacion_pct": None, "score": None, "centros_x_norm": []}

    desvio = statistics.pstdev(centros)
    osc_pct = (desvio / ancho) * 100.0
    score = max(0.0, 100.0 - (osc_pct * 2.5))

    centros_norm = [round(x / ancho, 4) for x in centros]
    return {
        "oscilacion_pct": round(osc_pct, 2),
        "score": round(score, 2),
        "centros_x_norm": centros_norm,
    }


def estabilidad_pierna_apoyo(frames, pierna_apoyo: str, idx_impacto: int | None) -> dict:
    """
    Variación angular de la rodilla de apoyo en una ventana ±10 frames
    alrededor del impacto. Menos variación = apoyo más sólido.
    """
    if pierna_apoyo not in {"izquierda", "derecha"} or not frames:
        return {"variacion_deg": None, "score": None}

    if pierna_apoyo == "izquierda":
        c, r, t = "cadera_izq", "rodilla_izq", "tobillo_izq"
    else:
        c, r, t = "cadera_der", "rodilla_der", "tobillo_der"

    if idx_impacto is None:
        ini, fin = 0, len(frames)
    else:
        ini = max(0, idx_impacto - 10)
        fin = min(len(frames), idx_impacto + 11)

    angulos: list[float] = []
    for f in frames[ini:fin]:
        a = angulo_3p(getattr(f, c), getattr(f, r), getattr(f, t))
        if a is not None:
            angulos.append(a)

    if len(angulos) < 2:
        return {"variacion_deg": None, "score": None}

    variacion = max(angulos) - min(angulos)
    # Score: 100 si variación ≤ 5°, 0 si ≥ 30°
    score = max(0.0, min(100.0, 100.0 - ((variacion - 5) * (100.0 / 25.0))))
    return {
        "variacion_deg": round(variacion, 2),
        "score": round(score, 2),
    }


def asimetria_postura(frames) -> float | None:
    """
    Diferencia media (%) entre alturas de hombro y altura de cadera izq vs der.
    Valor alto = postura asimétrica.
    """
    if not frames:
        return None

    diffs: list[float] = []
    for f in frames:
        if f.hombro_izq and f.hombro_der:
            diffs.append(abs(f.hombro_izq[1] - f.hombro_der[1]))
        if f.cadera_izq and f.cadera_der:
            diffs.append(abs(f.cadera_izq[1] - f.cadera_der[1]))

    if not diffs:
        return None

    media = sum(diffs) / len(diffs)
    # Normalizar respecto al rango altura aprox del jugador
    referencia: list[float] = []
    for f in frames:
        if f.hombro_izq and f.cadera_izq:
            referencia.append(abs(f.cadera_izq[1] - f.hombro_izq[1]))
        if f.hombro_der and f.cadera_der:
            referencia.append(abs(f.cadera_der[1] - f.hombro_der[1]))
    if not referencia or len(referencia) == 0:
        return None

    ref_media = sum(referencia) / len(referencia)
    if ref_media <= 0:
        return None

    return round((media / ref_media) * 100.0, 2)
