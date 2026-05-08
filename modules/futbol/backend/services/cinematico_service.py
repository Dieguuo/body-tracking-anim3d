"""
SERVICIO — Análisis cinemático temporal del golpeo.

Genera curvas angulares frame-a-frame de cadera, rodilla y tobillo de la
pierna de golpeo, detecta las 4 fases del gesto (aproximación, armado,
impacto, follow-through) y calcula velocidades articulares.
"""

from __future__ import annotations

from services.biomecanica_service import angulo_3p


# Ventana alrededor del impacto considerada como "fase de impacto"
VENTANA_IMPACTO_FRAMES = 2


def _suavizar(valores: list[float | None], ventana: int = 3) -> list[float | None]:
    if len(valores) < ventana:
        return list(valores)
    salida: list[float | None] = []
    mitad = ventana // 2
    for i in range(len(valores)):
        ini = max(0, i - mitad)
        fin = min(len(valores), i + mitad + 1)
        vecinos = [v for v in valores[ini:fin] if v is not None]
        if vecinos:
            salida.append(round(sum(vecinos) / len(vecinos), 2))
        else:
            salida.append(None)
    return salida


def _derivada(valores: list[float | None], fps: float) -> list[float | None]:
    if not valores or fps <= 0:
        return [None] * len(valores)
    salida: list[float | None] = [None]
    for i in range(1, len(valores)):
        a = valores[i - 1]
        b = valores[i]
        if a is None or b is None:
            salida.append(None)
            continue
        salida.append(round((b - a) * fps, 2))
    return salida


def calcular_curvas_angulares(frames, pierna_golpeo: str) -> dict:
    """
    Devuelve curvas frame-a-frame de cadera, rodilla, tobillo de la pierna
    de golpeo más estabilidad puntual del tronco.

    Estructura:
        {
          "indices": [int],
          "timestamps_s": [float],
          "cadera_deg": [float|None],
          "rodilla_deg": [float|None],
          "tobillo_deg": [float|None],
        }
    """
    if pierna_golpeo == "izquierda":
        h, c, r, t, p = "hombro_izq", "cadera_izq", "rodilla_izq", "tobillo_izq", "punta_izq"
    else:
        h, c, r, t, p = "hombro_der", "cadera_der", "rodilla_der", "tobillo_der", "punta_der"

    indices: list[int] = []
    timestamps: list[float] = []
    caderas: list[float | None] = []
    rodillas: list[float | None] = []
    tobillos: list[float | None] = []

    for f in frames:
        indices.append(f.frame_idx)
        timestamps.append(round(f.timestamp_s, 4))
        caderas.append(_red(angulo_3p(getattr(f, h), getattr(f, c), getattr(f, r))))
        rodillas.append(_red(angulo_3p(getattr(f, c), getattr(f, r), getattr(f, t))))
        tobillos.append(_red(angulo_3p(getattr(f, r), getattr(f, t), getattr(f, p))))

    return {
        "indices": indices,
        "timestamps_s": timestamps,
        "cadera_deg": _suavizar(caderas, ventana=3),
        "rodilla_deg": _suavizar(rodillas, ventana=3),
        "tobillo_deg": _suavizar(tobillos, ventana=3),
    }


def detectar_fases(curvas: dict, idx_impacto: int | None) -> list[dict]:
    """
    4 fases:
      1. aproximacion: inicio → mínimo de flexión cadera (preparación)
      2. armado: mínimo flexión cadera → impacto
      3. impacto: ventana ±VENTANA_IMPACTO_FRAMES alrededor del impacto
      4. follow_through: tras impacto hasta el final
    """
    indices = curvas.get("indices") or []
    cadera = curvas.get("cadera_deg") or []
    if not indices:
        return []

    frame_inicio = indices[0]
    frame_fin = indices[-1]

    if idx_impacto is None or idx_impacto < frame_inicio or idx_impacto > frame_fin:
        # Fallback: una sola fase de gesto completa
        return [{"fase": "gesto", "frame_inicio": frame_inicio, "frame_fin": frame_fin}]

    # Buscar el mínimo de cadera ANTES del impacto (máxima flexión = armado)
    idx_min_cadera = frame_inicio
    val_min = None
    for i, idx_global in enumerate(indices):
        if idx_global >= idx_impacto:
            break
        v = cadera[i]
        if v is not None and (val_min is None or v < val_min):
            val_min = v
            idx_min_cadera = idx_global

    impacto_ini = max(frame_inicio, idx_impacto - VENTANA_IMPACTO_FRAMES)
    impacto_fin = min(frame_fin, idx_impacto + VENTANA_IMPACTO_FRAMES)

    return [
        {"fase": "aproximacion", "frame_inicio": frame_inicio, "frame_fin": idx_min_cadera},
        {"fase": "armado", "frame_inicio": idx_min_cadera, "frame_fin": impacto_ini},
        {"fase": "impacto", "frame_inicio": impacto_ini, "frame_fin": impacto_fin},
        {"fase": "follow_through", "frame_inicio": impacto_fin, "frame_fin": frame_fin},
    ]


def calcular_velocidades_articulares(curvas: dict, fps: float) -> dict:
    """
    Velocidad angular (°/s) de cada articulación + pico de extensión.
    """
    rodilla = curvas.get("rodilla_deg") or []
    cadera = curvas.get("cadera_deg") or []
    tobillo = curvas.get("tobillo_deg") or []
    indices = curvas.get("indices") or []

    vel_rod = _suavizar(_derivada(rodilla, fps), ventana=3)
    vel_cad = _suavizar(_derivada(cadera, fps), ventana=3)
    vel_tob = _suavizar(_derivada(tobillo, fps), ventana=3)

    return {
        "vel_rodilla_deg_s": vel_rod,
        "vel_cadera_deg_s": vel_cad,
        "vel_tobillo_deg_s": vel_tob,
        "pico_vel_rodilla": _pico(vel_rod, indices),
        "pico_vel_cadera": _pico(vel_cad, indices),
        "pico_vel_tobillo": _pico(vel_tob, indices),
    }


# ── helpers ──

def _red(valor):
    if valor is None:
        return None
    return round(float(valor), 2)


def _pico(valores: list[float | None], indices: list[int]) -> dict | None:
    if not valores or not indices:
        return None
    idx_max = None
    val_max = None
    for i, v in enumerate(valores):
        if v is None:
            continue
        if val_max is None or v > val_max:
            val_max = v
            idx_max = i
    if idx_max is None:
        return None
    return {"valor_deg_s": round(val_max, 2), "frame_idx": indices[idx_max]}
