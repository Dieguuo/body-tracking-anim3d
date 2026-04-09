"""
SERVICIO — Análisis cinemático temporal del gesto (Fase 7).

Genera curvas angulares frame a frame, detecta fases del salto,
calcula velocidades articulares y métricas resumen del gesto.
"""

import numpy as np
from models.video_processor import FramePies
from services.biomecanica_service import BiomecanicaService


# Margen de frames antes del despegue y después del aterrizaje para las curvas
MARGEN_FRAMES = 15


class CinematicoService:
    """Análisis cinemático completo del gesto de salto."""

    # ──────────────────────────────────────────────
    # 7.1  Curvas angulares completas
    # ──────────────────────────────────────────────

    @staticmethod
    def curvas_angulares(
        frames: list[FramePies],
        idx_despegue: int,
        idx_aterrizaje: int,
    ) -> dict:
        """
        Calcula ángulo de rodilla y cadera en cada frame del rango de interés
        (MARGEN_FRAMES antes del despegue → MARGEN_FRAMES después del aterrizaje).

        Retorna:
            {
                "frame_inicio": int,
                "frame_fin": int,
                "indices": [int, ...],
                "timestamps_s": [float, ...],
                "rodilla_deg": [float|None, ...],
                "cadera_deg": [float|None, ...]
            }
        """
        inicio = max(0, idx_despegue - MARGEN_FRAMES)
        fin = min(len(frames), idx_aterrizaje + MARGEN_FRAMES + 1)

        indices = []
        timestamps = []
        rodilla = []
        cadera = []

        for i in range(inicio, fin):
            f = frames[i]
            indices.append(f.frame_idx)
            timestamps.append(round(f.timestamp_s, 4))

            a_rod = _angulo_rodilla(f)
            a_cad = _angulo_cadera(f)
            rodilla.append(round(a_rod, 2) if a_rod is not None else None)
            cadera.append(round(a_cad, 2) if a_cad is not None else None)

        # Suavizado con media móvil de 3 frames
        rodilla = _suavizar(rodilla, ventana=3)
        cadera = _suavizar(cadera, ventana=3)

        return {
            "frame_inicio": inicio,
            "frame_fin": fin - 1,
            "indices": indices,
            "timestamps_s": timestamps,
            "rodilla_deg": rodilla,
            "cadera_deg": cadera,
        }

    # ──────────────────────────────────────────────
    # 7.2  Detección automática de fases del salto
    # ──────────────────────────────────────────────

    @staticmethod
    def detectar_fases(
        curvas: dict,
        idx_despegue: int,
        idx_aterrizaje: int,
        idx_estabilizacion: int | None,
    ) -> list[dict]:
        """
        Detecta las 4 fases del salto:
          1. Preparatoria (excéntrica): inicio → mínimo de flexión de rodilla antes del despegue
          2. Impulsión (concéntrica): mínimo de flexión → despegue
          3. Vuelo: despegue → aterrizaje
          4. Recepción: aterrizaje → estabilización

        Retorna lista de dicts: [{"fase", "frame_inicio", "frame_fin"}, ...]
        """
        frame_inicio = curvas["frame_inicio"]
        frame_fin = curvas["frame_fin"]
        rodilla = curvas["rodilla_deg"]
        indices = curvas["indices"]

        fases = []

        # Buscar mínimo de ángulo de rodilla (máxima flexión) antes del despegue
        idx_min_flexion = None
        min_valor = None

        for i, idx_global in enumerate(indices):
            if idx_global >= idx_despegue:
                break
            val = rodilla[i]
            if val is not None and (min_valor is None or val < min_valor):
                min_valor = val
                idx_min_flexion = idx_global

        if idx_min_flexion is None:
            idx_min_flexion = frame_inicio

        # Fase 1: Preparatoria
        fases.append({
            "fase": "preparatoria",
            "frame_inicio": frame_inicio,
            "frame_fin": idx_min_flexion,
        })

        # Fase 2: Impulsión
        fases.append({
            "fase": "impulsion",
            "frame_inicio": idx_min_flexion,
            "frame_fin": idx_despegue,
        })

        # Fase 3: Vuelo
        fases.append({
            "fase": "vuelo",
            "frame_inicio": idx_despegue,
            "frame_fin": idx_aterrizaje,
        })

        # Fase 4: Recepción
        fin_recepcion = idx_estabilizacion if idx_estabilizacion is not None else frame_fin
        fases.append({
            "fase": "recepcion",
            "frame_inicio": idx_aterrizaje,
            "frame_fin": fin_recepcion,
        })

        return fases

    # ──────────────────────────────────────────────
    # 7.3  Velocidades articulares
    # ──────────────────────────────────────────────

    @staticmethod
    def velocidades_articulares(curvas: dict, fps: float) -> dict:
        """
        Calcula la velocidad angular (°/s) de rodilla y cadera.

        Velocidad = Δángulo / Δt  =  (ang[i+1] - ang[i]) × fps

        También detecta el pico de velocidad de extensión (momento de máxima potencia).

        Retorna:
            {
                "vel_rodilla_deg_s": [float|None, ...],
                "vel_cadera_deg_s": [float|None, ...],
                "pico_vel_rodilla": {"valor_deg_s": float, "frame_idx": int} | None,
                "pico_vel_cadera": {"valor_deg_s": float, "frame_idx": int} | None
            }
        """
        rodilla = curvas["rodilla_deg"]
        cadera_arr = curvas["cadera_deg"]
        indices = curvas["indices"]

        vel_rod = _derivada_angular(rodilla, fps)
        vel_cad = _derivada_angular(cadera_arr, fps)

        # Suavizar velocidades
        vel_rod = _suavizar(vel_rod, ventana=3)
        vel_cad = _suavizar(vel_cad, ventana=3)

        # Picos de velocidad de extensión (valores positivos = extensión)
        pico_rod = _buscar_pico(vel_rod, indices)
        pico_cad = _buscar_pico(vel_cad, indices)

        return {
            "vel_rodilla_deg_s": vel_rod,
            "vel_cadera_deg_s": vel_cad,
            "pico_vel_rodilla": pico_rod,
            "pico_vel_cadera": pico_cad,
        }

    # ──────────────────────────────────────────────
    # 7.4  Métricas resumen del gesto
    # ──────────────────────────────────────────────

    @staticmethod
    def resumen_gesto(
        curvas: dict,
        fases: list[dict],
        fps: float,
    ) -> dict:
        """
        Genera métricas resumen del gesto completo.

        Retorna:
            {
                "pico_flexion_rodilla": {"valor_deg": float, "frame_idx": int},
                "pico_extension_rodilla": {"valor_deg": float, "frame_idx": int},
                "rom_rodilla_deg": float,
                "rom_cadera_deg": float,
                "ratio_excentrico_concentrico": float | None
            }
        """
        rodilla = curvas["rodilla_deg"]
        cadera_arr = curvas["cadera_deg"]
        indices = curvas["indices"]

        # Picos de rodilla
        pico_flex_rod = _buscar_minimo(rodilla, indices)
        pico_ext_rod = _buscar_maximo(rodilla, indices)

        # ROM = max - min
        rod_vals = [v for v in rodilla if v is not None]
        cad_vals = [v for v in cadera_arr if v is not None]
        rom_rod = (max(rod_vals) - min(rod_vals)) if rod_vals else 0.0
        rom_cad = (max(cad_vals) - min(cad_vals)) if cad_vals else 0.0

        # Ratio excéntrico / concéntrico
        ratio_ec = None
        fase_prep = next((f for f in fases if f["fase"] == "preparatoria"), None)
        fase_imp = next((f for f in fases if f["fase"] == "impulsion"), None)
        if fase_prep and fase_imp and fps > 0:
            dur_exc = (fase_prep["frame_fin"] - fase_prep["frame_inicio"]) / fps
            dur_con = (fase_imp["frame_fin"] - fase_imp["frame_inicio"]) / fps
            if dur_con > 0:
                ratio_ec = round(dur_exc / dur_con, 2)

        return {
            "pico_flexion_rodilla": pico_flex_rod,
            "pico_extension_rodilla": pico_ext_rod,
            "rom_rodilla_deg": round(rom_rod, 2),
            "rom_cadera_deg": round(rom_cad, 2),
            "ratio_excentrico_concentrico": ratio_ec,
        }


# ── Funciones auxiliares privadas ──

def _angulo_rodilla(f: FramePies) -> float | None:
    if any(v is None for v in [f.cadera_x, f.cadera_y, f.rodilla_x, f.rodilla_y, f.tobillo_x, f.tobillo_y]):
        return None
    return BiomecanicaService.angulo_articulacion_deg(
        p_origen_v1=(f.cadera_x, f.cadera_y),
        p_articulacion=(f.rodilla_x, f.rodilla_y),
        p_origen_v2=(f.tobillo_x, f.tobillo_y),
    )


def _angulo_cadera(f: FramePies) -> float | None:
    if any(v is None for v in [f.hombro_x, f.hombro_y, f.cadera_x, f.cadera_y, f.rodilla_x, f.rodilla_y]):
        return None
    return BiomecanicaService.angulo_articulacion_deg(
        p_origen_v1=(f.hombro_x, f.hombro_y),
        p_articulacion=(f.cadera_x, f.cadera_y),
        p_origen_v2=(f.rodilla_x, f.rodilla_y),
    )


def _suavizar(valores: list[float | None], ventana: int = 3) -> list[float | None]:
    """Media móvil que respeta Nones."""
    if len(valores) < ventana:
        return valores

    resultado = []
    mitad = ventana // 2

    for i in range(len(valores)):
        inicio = max(0, i - mitad)
        fin = min(len(valores), i + mitad + 1)
        vecinos = [v for v in valores[inicio:fin] if v is not None]
        if vecinos:
            resultado.append(round(sum(vecinos) / len(vecinos), 2))
        else:
            resultado.append(None)
    return resultado


def _derivada_angular(angulos: list[float | None], fps: float) -> list[float | None]:
    """Calcula la derivada (°/s) entre frames consecutivos."""
    if not angulos or fps <= 0:
        return [None] * len(angulos)

    velocidades: list[float | None] = [None]  # primer valor sin derivada
    for i in range(1, len(angulos)):
        if angulos[i] is not None and angulos[i - 1] is not None:
            vel = (angulos[i] - angulos[i - 1]) * fps
            velocidades.append(round(vel, 2))
        else:
            velocidades.append(None)
    return velocidades


def _buscar_pico(valores: list[float | None], indices: list[int]) -> dict | None:
    """Busca el valor máximo positivo (pico de extensión)."""
    mejor_val = None
    mejor_idx = None
    for i, v in enumerate(valores):
        if v is not None and (mejor_val is None or v > mejor_val):
            mejor_val = v
            mejor_idx = indices[i] if i < len(indices) else i
    if mejor_val is None:
        return None
    return {"valor_deg_s": round(mejor_val, 2), "frame_idx": mejor_idx}


def _buscar_minimo(valores: list[float | None], indices: list[int]) -> dict | None:
    """Busca el valor mínimo (pico de flexión)."""
    mejor_val = None
    mejor_idx = None
    for i, v in enumerate(valores):
        if v is not None and (mejor_val is None or v < mejor_val):
            mejor_val = v
            mejor_idx = indices[i] if i < len(indices) else i
    if mejor_val is None:
        return None
    return {"valor_deg": round(mejor_val, 2), "frame_idx": mejor_idx}


def _buscar_maximo(valores: list[float | None], indices: list[int]) -> dict | None:
    """Busca el valor máximo (pico de extensión)."""
    mejor_val = None
    mejor_idx = None
    for i, v in enumerate(valores):
        if v is not None and (mejor_val is None or v > mejor_val):
            mejor_val = v
            mejor_idx = indices[i] if i < len(indices) else i
    if mejor_val is None:
        return None
    return {"valor_deg": round(mejor_val, 2), "frame_idx": mejor_idx}
