"""
Controlador principal del modulo futbol.

Orquesta el pipeline de análisis biomecánico de un golpeo:
  - Extracción de poses por frame (VideoProcessor)
  - Métricas básicas (ángulos puntuales y estabilidad de tronco)
  - Detección de impacto y velocidad del pie
  - Análisis cinemático (curvas y fases)
  - Estabilidad del apoyo y asimetría
  - Alertas, clasificación y observaciones
"""

from __future__ import annotations

from models.video_processor import VideoProcessor
from services.calculo_service import CalculoService, calcular_score_compuesto
from services.impacto_service import (
    detectar_pierna_golpeo_apoyo,
    calcular_velocidad_pie,
)
from services.cinematico_service import (
    calcular_curvas_angulares,
    detectar_fases,
    calcular_velocidades_articulares,
)
from services.apoyo_service import (
    estabilidad_tronco_temporal,
    estabilidad_pierna_apoyo,
    asimetria_postura,
)
from services.interpretacion_service import (
    generar_alertas_golpeo,
    clasificar_golpeo,
    generar_observaciones,
)


class FutbolController:
    def __init__(self) -> None:
        self.processor = VideoProcessor()
        self.calculo = CalculoService()

    def procesar_golpeo(self, ruta_video: str, incluir_landmarks: bool = False) -> dict:
        frames, info = self.processor.procesar(ruta_video)
        if not frames or info is None:
            return _respuesta_vacia("No se detectaron landmarks en el video.")

        # 1) Detección de pierna y frame de impacto PRIMERO — para que calcular_metricas
        #    use el frame correcto (el del impacto) en lugar del último frame.
        pierna_g, pierna_a, idx_impacto, _vel_pico = detectar_pierna_golpeo_apoyo(frames)

        # 2) Métricas puntuales (ángulos en el frame de impacto detectado)
        metricas_basicas = self.calculo.calcular_metricas(frames, info, idx_impacto=idx_impacto)
        if metricas_basicas.get("confianza", 0) == 0:
            return metricas_basicas

        # Sobreescribir pierna con el resultado cinemático (más fiable que el heurístico por ángulo).
        # Si la detección por velocidad falló, mantener la heurística de ángulo de rodilla.
        if pierna_g != "desconocida":
            metricas_basicas["pierna_golpeo"] = pierna_g
            metricas_basicas["pierna_apoyo"] = pierna_a
        else:
            pierna_g = metricas_basicas.get("pierna_golpeo", "derecha")
            pierna_a = metricas_basicas.get("pierna_apoyo", "izquierda")

        # 3) Velocidad del pie en el impacto
        vel_info = calcular_velocidad_pie(frames, idx_impacto, pierna_g, info.fps)

        # 4) Curvas angulares + fases + velocidades articulares
        curvas = calcular_curvas_angulares(frames, pierna_g)
        fases = detectar_fases(curvas, idx_impacto)
        velocidades = calcular_velocidades_articulares(curvas, info.fps)

        # 5) Estabilidad temporal y asimetría
        estab_tronco_t = estabilidad_tronco_temporal(frames, info.ancho)
        estab_apoyo = estabilidad_pierna_apoyo(frames, pierna_a, idx_impacto)
        asim_pct = asimetria_postura(frames)

        # 6) Recolectar landmarks de cada frame (para guardado/visor)
        landmarks_frames = [
            {
                "frame_idx": f.frame_idx,
                "timestamp_s": f.timestamp_s,
                "landmarks": f.landmarks,
            }
            for f in frames
            if f.landmarks
        ]

        # 7) Construir respuesta consolidada
        respuesta = dict(metricas_basicas)
        respuesta.pop("landmarks_frames", None)

        respuesta.update({
            "frame_impacto": idx_impacto,
            "velocidad_pie_ms": vel_info.get("ms"),
            "velocidad_pie_px_s": vel_info.get("px_s"),
            "altura_jugador_px": vel_info.get("altura_jugador_px"),
            "fps": round(info.fps, 2),
            "ancho": info.ancho,
            "alto": info.alto,
            "total_frames": info.total_frames,
            "curvas": curvas,
            "fases": fases,
            "velocidades_articulares": velocidades,
            "apoyo": estab_apoyo,
            "tronco_temporal": estab_tronco_t,
            "asimetria_postura_pct": asim_pct,
        })

        # 8) Alertas + clasificación + observaciones
        alertas = generar_alertas_golpeo(respuesta)
        clasif = clasificar_golpeo(respuesta, alertas, fatiga_significativa=False)
        observ = generar_observaciones(respuesta, alertas)

        respuesta["alertas"] = alertas
        respuesta["clasificacion"] = clasif
        respuesta["observaciones"] = observ
        respuesta["score_compuesto"] = calcular_score_compuesto(respuesta)

        if incluir_landmarks:
            respuesta["landmarks_frames"] = landmarks_frames
        # Adjuntar en clave privada para persistencia (no enviar al frontend si no se pide)
        respuesta["_landmarks_frames"] = landmarks_frames

        return respuesta


def _respuesta_vacia(mensaje: str) -> dict:
    return {
        "mensaje": mensaje,
        "confianza": 0,
        "angulo_cadera_deg": None,
        "angulo_rodilla_deg": None,
        "angulo_tobillo_deg": None,
        "estabilidad_tronco": None,
        "pierna_golpeo": "desconocida",
        "pierna_apoyo": "desconocida",
        "frame_impacto": None,
        "velocidad_pie_ms": None,
        "curvas": None,
        "fases": [],
        "alertas": [],
        "clasificacion": None,
        "observaciones": [],
    }
