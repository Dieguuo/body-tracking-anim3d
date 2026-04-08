"""
MODELO — Procesador de vídeo con MediaPipe PoseLandmarker (Tasks API).

Lee un vídeo fotograma a fotograma, detecta los landmarks anatómicos
y devuelve las coordenadas de los pies en cada frame.
"""

import os
from dataclasses import dataclass

import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    PoseLandmarker,
    PoseLandmarkerOptions,
    RunningMode,
)

from config import (
    LANDMARK_HOMBRO_IZQ,
    LANDMARK_HOMBRO_DER,
    LANDMARK_CADERA_IZQ,
    LANDMARK_CADERA_DER,
    LANDMARK_RODILLA_IZQ,
    LANDMARK_RODILLA_DER,
    LANDMARK_TOBILLO_IZQ,
    LANDMARK_TOBILLO_DER,
    LANDMARK_TALON_IZQ,
    LANDMARK_TALON_DER,
    LANDMARK_PUNTA_IZQ,
    LANDMARK_PUNTA_DER,
    MIN_DETECTION_CONFIDENCE,
    MIN_TRACKING_CONFIDENCE,
)

# Ruta al modelo descargado (junto a este archivo)
_MODEL_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "pose_landmarker_lite.task")
)


@dataclass
class FramePies:
    """Coordenadas de los pies en un frame concreto."""
    frame_idx: int
    timestamp_s: float          # Segundos desde el inicio del vídeo
    talon_izq_y: float | None   # Coordenada Y en píxeles (None si no detectado)
    talon_der_y: float | None
    punta_izq_y: float | None
    punta_der_y: float | None
    # Coordenadas X (necesarias para salto horizontal)
    talon_izq_x: float | None
    talon_der_x: float | None
    punta_izq_x: float | None
    punta_der_x: float | None
    # Altura completa de la persona en píxeles (para calibración)
    altura_persona_px: float | None
    # Puntos articulares promedio (izq/der) para biomecánica de despegue
    hombro_x: float | None
    hombro_y: float | None
    cadera_x: float | None
    cadera_y: float | None
    rodilla_x: float | None
    rodilla_y: float | None
    tobillo_x: float | None
    tobillo_y: float | None


@dataclass
class InfoVideo:
    """Metadatos del vídeo procesado."""
    fps: float
    total_frames: int
    ancho: int
    alto: int


class VideoProcessor:
    """
    MODELO — Procesa un archivo de vídeo y extrae las coordenadas de los pies
    fotograma a fotograma mediante MediaPipe PoseLandmarker.

    Se crea un nuevo PoseLandmarker por cada llamada a procesar() para
    garantizar timestamps monotónicos y evitar problemas de concurrencia.
    """

    @staticmethod
    def _crear_landmarker():
        """Crea una instancia fresca de PoseLandmarker."""
        options = PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=_MODEL_PATH),
            running_mode=RunningMode.VIDEO,
            num_poses=2,
            min_pose_detection_confidence=MIN_DETECTION_CONFIDENCE,
            min_tracking_confidence=MIN_TRACKING_CONFIDENCE,
        )
        return PoseLandmarker.create_from_options(options)

    def procesar(self, ruta_video: str) -> tuple[list[FramePies], InfoVideo | None]:
        """
        Procesa el vídeo completo y devuelve:
          - Lista de FramePies con las coordenadas de pies por frame.
          - InfoVideo con metadatos.

        Crea un PoseLandmarker nuevo por cada vídeo para garantizar
        timestamps monotónicos y thread safety.
        """
        cap = cv2.VideoCapture(ruta_video)
        if not cap.isOpened():
            return [], None

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0:
            cap.release()
            return [], None

        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        ancho = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        alto = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        info = InfoVideo(fps=fps, total_frames=total, ancho=ancho, alto=alto)

        landmarker = self._crear_landmarker()
        frames: list[FramePies] = []
        idx = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
                timestamp_ms = int((idx / fps) * 1000)
                resultado = landmarker.detect_for_video(mp_image, timestamp_ms)

                fp = self._extraer_pies(resultado, idx, fps, alto, ancho)
                frames.append(fp)
                idx += 1
        finally:
            landmarker.close()
            cap.release()

        return frames, info

    def _extraer_pies(self, resultado, idx: int, fps: float, alto: int, ancho: int) -> FramePies:
        """Extrae las coordenadas de la persona más grande detectada en pantalla, filtrando reflejos."""
        if not resultado.pose_landmarks or len(resultado.pose_landmarks) == 0:
            return FramePies(
                frame_idx=idx, timestamp_s=idx / fps if fps > 0 else 0,
                talon_izq_y=None, talon_der_y=None, punta_izq_y=None, punta_der_y=None,
                talon_izq_x=None, talon_der_x=None, punta_izq_x=None, punta_der_x=None,
                altura_persona_px=None,
                hombro_x=None, hombro_y=None,
                cadera_x=None, cadera_y=None,
                rodilla_x=None, rodilla_y=None,
                tobillo_x=None, tobillo_y=None,
            )

        # Buscar la silueta más grande (la persona real frente a la cámara)
        mejor_lm = None
        max_altura = 0

        for pose in resultado.pose_landmarks:
            def temp_y(i): return pose[i].y * alto
            cabeza_y = temp_y(0)
            pie_bajo_y = max(temp_y(LANDMARK_TALON_IZQ), temp_y(LANDMARK_TALON_DER),
                             temp_y(LANDMARK_PUNTA_IZQ), temp_y(LANDMARK_PUNTA_DER))
            altura_actual = abs(pie_bajo_y - cabeza_y)

            if altura_actual > max_altura:
                max_altura = altura_actual
                mejor_lm = pose

        if mejor_lm is None:
            return FramePies(
                frame_idx=idx, timestamp_s=idx / fps if fps > 0 else 0,
                talon_izq_y=None, talon_der_y=None, punta_izq_y=None, punta_der_y=None,
                talon_izq_x=None, talon_der_x=None, punta_izq_x=None, punta_der_x=None,
                altura_persona_px=None,
                hombro_x=None, hombro_y=None,
                cadera_x=None, cadera_y=None,
                rodilla_x=None, rodilla_y=None,
                tobillo_x=None, tobillo_y=None,
            )

        lm = mejor_lm
        altura_px = max_altura

        def px_y(i: int) -> float:
            return lm[i].y * alto

        def px_x(i: int) -> float:
            return lm[i].x * ancho

        def promedio_par(i_izq: int, i_der: int) -> tuple[float | None, float | None]:
            x_izq, y_izq = px_x(i_izq), px_y(i_izq)
            x_der, y_der = px_x(i_der), px_y(i_der)
            return ((x_izq + x_der) / 2.0, (y_izq + y_der) / 2.0)

        hombro_x, hombro_y = promedio_par(LANDMARK_HOMBRO_IZQ, LANDMARK_HOMBRO_DER)
        cadera_x, cadera_y = promedio_par(LANDMARK_CADERA_IZQ, LANDMARK_CADERA_DER)
        rodilla_x, rodilla_y = promedio_par(LANDMARK_RODILLA_IZQ, LANDMARK_RODILLA_DER)
        tobillo_x, tobillo_y = promedio_par(LANDMARK_TOBILLO_IZQ, LANDMARK_TOBILLO_DER)

        return FramePies(
            frame_idx=idx,
            timestamp_s=idx / fps if fps > 0 else 0,
            talon_izq_y=px_y(LANDMARK_TALON_IZQ),
            talon_der_y=px_y(LANDMARK_TALON_DER),
            punta_izq_y=px_y(LANDMARK_PUNTA_IZQ),
            punta_der_y=px_y(LANDMARK_PUNTA_DER),
            talon_izq_x=px_x(LANDMARK_TALON_IZQ),
            talon_der_x=px_x(LANDMARK_TALON_DER),
            punta_izq_x=px_x(LANDMARK_PUNTA_IZQ),
            punta_der_x=px_x(LANDMARK_PUNTA_DER),
            altura_persona_px=altura_px if altura_px > 0 else None,
            hombro_x=hombro_x,
            hombro_y=hombro_y,
            cadera_x=cadera_x,
            cadera_y=cadera_y,
            rodilla_x=rodilla_x,
            rodilla_y=rodilla_y,
            tobillo_x=tobillo_x,
            tobillo_y=tobillo_y,
        )


