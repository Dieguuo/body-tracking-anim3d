"""
Procesador de video con MediaPipe PoseLandmarker.
"""

from dataclasses import dataclass

import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import PoseLandmarker, PoseLandmarkerOptions, RunningMode

from config import MIN_DETECTION_CONFIDENCE, MIN_TRACKING_CONFIDENCE, MODEL_PATH


@dataclass
class FramePose:
    frame_idx: int
    timestamp_s: float
    hombro_izq: tuple[float, float] | None
    hombro_der: tuple[float, float] | None
    cadera_izq: tuple[float, float] | None
    cadera_der: tuple[float, float] | None
    rodilla_izq: tuple[float, float] | None
    rodilla_der: tuple[float, float] | None
    tobillo_izq: tuple[float, float] | None
    tobillo_der: tuple[float, float] | None
    punta_izq: tuple[float, float] | None
    punta_der: tuple[float, float] | None
    landmarks: list[dict] | None


@dataclass
class InfoVideo:
    fps: float
    total_frames: int
    ancho: int
    alto: int


class VideoProcessor:
    @staticmethod
    # Construye el landmarker de MediaPipe con la configuracion actual.
    def _crear_landmarker():
        options = PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=MIN_DETECTION_CONFIDENCE,
            min_tracking_confidence=MIN_TRACKING_CONFIDENCE,
        )
        return PoseLandmarker.create_from_options(options)

    # Recorre el video y extrae poses por frame.
    def procesar(self, ruta_video: str) -> tuple[list[FramePose], InfoVideo | None]:
        cap = cv2.VideoCapture(ruta_video)
        if not cap.isOpened():
            return [], None

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps is None or fps <= 0:
            fps = 30.0

        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        ancho = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        alto = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        info = InfoVideo(fps=fps, total_frames=total, ancho=ancho, alto=alto)

        landmarker = self._crear_landmarker()
        frames: list[FramePose] = []
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

                frames.append(self._extraer_pose(resultado, idx, fps, ancho, alto))
                idx += 1
        finally:
            landmarker.close()
            cap.release()

        return frames, info

    @staticmethod
    # Convierte la salida del landmarker en un FramePose con coordenadas absolutas.
    def _extraer_pose(resultado, idx: int, fps: float, ancho: int, alto: int) -> FramePose:
        if not resultado.pose_landmarks:
            return FramePose(
                frame_idx=idx,
                timestamp_s=idx / fps if fps > 0 else 0,
                hombro_izq=None,
                hombro_der=None,
                cadera_izq=None,
                cadera_der=None,
                rodilla_izq=None,
                rodilla_der=None,
                tobillo_izq=None,
                tobillo_der=None,
                punta_izq=None,
                punta_der=None,
                landmarks=None,
            )

        lm = resultado.pose_landmarks[0]

        # Convierte un landmark en coordenadas absolutas.
        def punto(i: int) -> tuple[float, float]:
            return (lm[i].x * ancho, lm[i].y * alto)

        # Normaliza landmarks a un formato serializable.
        def normalizar_landmarks():
            salida = []
            for l in lm:
                salida.append({
                    "x": l.x,
                    "y": l.y,
                    "z": l.z,
                    "visibility": l.visibility,
                })
            return salida

        return FramePose(
            frame_idx=idx,
            timestamp_s=idx / fps if fps > 0 else 0,
            hombro_izq=punto(11),
            hombro_der=punto(12),
            cadera_izq=punto(23),
            cadera_der=punto(24),
            rodilla_izq=punto(25),
            rodilla_der=punto(26),
            tobillo_izq=punto(27),
            tobillo_der=punto(28),
            punta_izq=punto(31),
            punta_der=punto(32),
            landmarks=normalizar_landmarks(),
        )
