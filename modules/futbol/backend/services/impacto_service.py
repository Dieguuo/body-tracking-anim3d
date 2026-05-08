"""
SERVICIO — Detección del frame de impacto y velocidad del pie de golpeo.

Estrategia (sin tracking del balón):
  - Calcular velocidad horizontal absoluta del tobillo de cada pierna por frame.
  - La pierna con mayor pico de velocidad es la pierna de golpeo.
  - El frame del pico es el frame de impacto.
  - Velocidad del pie en m/s: se aproxima usando la altura del jugador en píxeles
    (de cabeza a tobillo) y la altura real (1.70 m por defecto si no se sabe).
"""

from __future__ import annotations

import math


def _vel_horizontal(frames, attr: str) -> list[float | None]:
    """Magnitud 2D del desplazamiento (px/frame) del landmark indicado.

    Se usa magnitud 2D (hypot) en lugar de sólo el eje X para detectar
    correctamente golpeos con componente vertical dominante (volée, etc.).
    """
    velocidades: list[float | None] = [None]
    for i in range(1, len(frames)):
        a = getattr(frames[i - 1], attr)
        b = getattr(frames[i], attr)
        if a is None or b is None:
            velocidades.append(None)
            continue
        velocidades.append(math.hypot(b[0] - a[0], b[1] - a[1]))
    return velocidades


def _pico(velocidades: list[float | None]) -> tuple[int | None, float | None]:
    idx_max = None
    val_max = None
    for i, v in enumerate(velocidades):
        if v is None:
            continue
        if val_max is None or v > val_max:
            val_max = v
            idx_max = i
    return idx_max, val_max


def detectar_pierna_golpeo_apoyo(frames) -> tuple[str, str, int | None, float | None]:
    """
    Devuelve (pierna_golpeo, pierna_apoyo, idx_impacto, vel_pico_px_frame).

    Si no se puede decidir, vuelve a heurística por menor ángulo de rodilla
    (gestionado por el caller).
    """
    if not frames:
        return ("desconocida", "desconocida", None, None)

    vel_izq = _vel_horizontal(frames, "tobillo_izq")
    vel_der = _vel_horizontal(frames, "tobillo_der")

    idx_izq, max_izq = _pico(vel_izq)
    idx_der, max_der = _pico(vel_der)

    if max_izq is None and max_der is None:
        return ("desconocida", "desconocida", None, None)

    if max_izq is not None and (max_der is None or max_izq >= max_der):
        return ("izquierda", "derecha", idx_izq, max_izq)
    return ("derecha", "izquierda", idx_der, max_der)


def calcular_altura_jugador_px(frames) -> float | None:
    """
    Estima la altura visible del jugador en píxeles (cabeza → tobillo).
    Usa la mediana sobre todos los frames con landmarks completos.
    """
    alturas: list[float] = []
    for f in frames:
        if not f.landmarks:
            continue
        cabeza = f.landmarks[0]  # nose
        tob_izq = f.tobillo_izq
        tob_der = f.tobillo_der
        if tob_izq is None and tob_der is None:
            continue
        # cabeza está en coords normalizadas; convertir si tiene .x .y
        # En este proyecto landmarks llevan x,y normalizadas, mientras
        # tobillo_izq son ya absolutos. Reusamos solo tobillos absolutos
        # y la nariz convertida (idx 0).
        # Como no guardamos ancho/alto en el frame, evitamos mezclar:
        # estimamos altura como diferencia entre hombro y tobillo (absolutos).
        tob_y = max(t[1] for t in (tob_izq, tob_der) if t is not None)
        hombro_y = None
        if f.hombro_izq is not None and f.hombro_der is not None:
            hombro_y = (f.hombro_izq[1] + f.hombro_der[1]) / 2
        elif f.hombro_izq is not None:
            hombro_y = f.hombro_izq[1]
        elif f.hombro_der is not None:
            hombro_y = f.hombro_der[1]
        if hombro_y is None:
            continue
        # altura tronco+piernas; aproximación: altura_total ≈ 1.45 × (tobillo - hombro)
        alturas.append(abs(tob_y - hombro_y) * 1.45)

    if not alturas:
        return None
    alturas.sort()
    return alturas[len(alturas) // 2]


def calcular_velocidad_pie(
    frames,
    idx_impacto: int | None,
    pierna_golpeo: str,
    fps: float,
    altura_real_m: float = 1.70,
) -> dict:
    """
    Calcula velocidad del pie en m/s en torno al frame de impacto.

    Toma el pico de magnitud (px/frame) en una ventana de ±2 frames.
    """
    if idx_impacto is None or fps <= 0 or not frames:
        return {"px_s": None, "ms": None, "altura_jugador_px": None}

    attr = "tobillo_izq" if pierna_golpeo == "izquierda" else "tobillo_der"

    inicio = max(1, idx_impacto - 2)
    fin = min(len(frames), idx_impacto + 3)
    velocidades_px_frame: list[float] = []

    for i in range(inicio, fin):
        a = getattr(frames[i - 1], attr)
        b = getattr(frames[i], attr)
        if a is None or b is None:
            continue
        dx = b[0] - a[0]
        dy = b[1] - a[1]
        velocidades_px_frame.append(math.hypot(dx, dy))

    if not velocidades_px_frame:
        return {"px_s": None, "ms": None, "altura_jugador_px": None}

    pico_px_frame = max(velocidades_px_frame)
    px_s = pico_px_frame * fps

    altura_px = calcular_altura_jugador_px(frames)
    ms: float | None = None
    if altura_px and altura_px > 0 and altura_real_m > 0:
        m_por_px = altura_real_m / altura_px
        ms = round(px_s * m_por_px, 2)

    return {
        "px_s": round(px_s, 2),
        "ms": ms,
        "altura_jugador_px": round(altura_px, 2) if altura_px else None,
    }
