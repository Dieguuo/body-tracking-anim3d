"""
SERVICIO — Generación de vídeo anotado con overlay (Fase 8.3).

Dibuja landmarks, ángulos articulares y marcadores de eventos clave
sobre los fotogramas del vídeo original usando OpenCV.
"""

import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    PoseLandmarker,
    PoseLandmarkerOptions,
    RunningMode,
)

from config import (
    LANDMARK_HOMBRO_IZQ, LANDMARK_HOMBRO_DER,
    LANDMARK_CADERA_IZQ, LANDMARK_CADERA_DER,
    LANDMARK_RODILLA_IZQ, LANDMARK_RODILLA_DER,
    LANDMARK_TOBILLO_IZQ, LANDMARK_TOBILLO_DER,
    LANDMARK_TALON_IZQ, LANDMARK_TALON_DER,
    LANDMARK_PUNTA_IZQ, LANDMARK_PUNTA_DER,
    MIN_DETECTION_CONFIDENCE,
    MIN_TRACKING_CONFIDENCE,
)
from services.biomecanica_service import BiomecanicaService


_MODEL_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "pose_landmarker_lite.task")
)

# Colores BGR
COLOR_ESQUELETO = (0, 255, 0)
COLOR_PUNTO = (0, 0, 255)
COLOR_TEXTO = (255, 255, 255)
COLOR_DESPEGUE = (0, 255, 255)   # Amarillo
COLOR_ATERRIZAJE = (255, 100, 0)  # Naranja
COLOR_PICO = (255, 0, 255)       # Magenta
COLOR_TRAYECTORIA = (100, 200, 255)

# Conexiones básicas del cuerpo para dibujar segmentos
CONEXIONES_CUERPO = [
    (11, 12), (11, 23), (12, 24), (23, 24),  # Torso
    (11, 13), (13, 15),  # Brazo izq
    (12, 14), (14, 16),  # Brazo der
    (23, 25), (25, 27), (27, 29), (27, 31),  # Pierna izq
    (24, 26), (26, 28), (28, 30), (28, 32),  # Pierna der
]


def generar_video_anotado(
    ruta_video_entrada: str,
    ruta_video_salida: str,
    frame_despegue: int | None = None,
    frame_aterrizaje: int | None = None,
    frame_pico: int | None = None,
) -> bool:
    """
    Genera un vídeo con overlay de landmarks, ángulos y eventos.

    Args:
        ruta_video_entrada: Ruta al vídeo original.
        ruta_video_salida: Ruta donde se guardará el vídeo anotado.
        frame_despegue: Índice del frame de despegue.
        frame_aterrizaje: Índice del frame de aterrizaje.
        frame_pico: Índice del frame de máxima altura (opcional).

    Returns:
        True si se generó correctamente.
    """
    cap = cv2.VideoCapture(ruta_video_entrada)
    if not cap.isOpened():
        return False

    fps = cap.get(cv2.CAP_PROP_FPS)
    ancho = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    alto = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if fps <= 0 or ancho <= 0 or alto <= 0:
        cap.release()
        return False

    fourcc = cv2.VideoWriter.fourcc(*"mp4v")
    writer = cv2.VideoWriter(ruta_video_salida, fourcc, fps, (ancho, alto))

    # Crear PoseLandmarker
    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=_MODEL_PATH),
        running_mode=RunningMode.VIDEO,
        num_poses=2,
        min_pose_detection_confidence=MIN_DETECTION_CONFIDENCE,
        min_tracking_confidence=MIN_TRACKING_CONFIDENCE,
    )
    landmarker = PoseLandmarker.create_from_options(options)

    trayectoria_cm = []  # Lista de (x, y) del centro de masa
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

            # Dibujar landmarks y esqueleto
            if resultado.pose_landmarks and len(resultado.pose_landmarks) > 0:
                lm = _seleccionar_persona(resultado.pose_landmarks, alto)
                if lm is not None:
                    _dibujar_esqueleto(frame, lm, ancho, alto)
                    _dibujar_angulos(frame, lm, ancho, alto)

                    # Trayectoria del centro de masa (promedio caderas)
                    cx = int((lm[LANDMARK_CADERA_IZQ].x + lm[LANDMARK_CADERA_DER].x) / 2 * ancho)
                    cy = int((lm[LANDMARK_CADERA_IZQ].y + lm[LANDMARK_CADERA_DER].y) / 2 * alto)
                    trayectoria_cm.append((cx, cy))

            # Dibujar trayectoria acumulada del centro de masa
            for i in range(1, len(trayectoria_cm)):
                cv2.line(frame, trayectoria_cm[i - 1], trayectoria_cm[i], COLOR_TRAYECTORIA, 2)

            # Marcadores de eventos
            _dibujar_evento(frame, idx, frame_despegue, "DESPEGUE", COLOR_DESPEGUE, ancho, alto)
            _dibujar_evento(frame, idx, frame_aterrizaje, "ATERRIZAJE", COLOR_ATERRIZAJE, ancho, alto)
            _dibujar_evento(frame, idx, frame_pico, "PICO", COLOR_PICO, ancho, alto)

            # Info del frame
            cv2.putText(frame, f"Frame {idx}", (10, alto - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_TEXTO, 1)

            writer.write(frame)
            idx += 1

    finally:
        landmarker.close()
        cap.release()
        writer.release()

    return os.path.exists(ruta_video_salida)


def _seleccionar_persona(poses, alto: int):
    """Selecciona la silueta más grande (la persona real)."""
    mejor = None
    max_alt = 0
    for pose in poses:
        cabeza_y = pose[0].y * alto
        pie_y = max(pose[LANDMARK_TALON_IZQ].y, pose[LANDMARK_TALON_DER].y,
                     pose[LANDMARK_PUNTA_IZQ].y, pose[LANDMARK_PUNTA_DER].y) * alto
        alt = abs(pie_y - cabeza_y)
        if alt > max_alt:
            max_alt = alt
            mejor = pose
    return mejor


def _dibujar_esqueleto(frame, lm, ancho: int, alto: int):
    """Dibuja puntos y conexiones del esqueleto."""
    for i in range(min(33, len(lm))):
        x = int(lm[i].x * ancho)
        y = int(lm[i].y * alto)
        cv2.circle(frame, (x, y), 3, COLOR_PUNTO, -1)

    for i_a, i_b in CONEXIONES_CUERPO:
        if i_a < len(lm) and i_b < len(lm):
            pa = (int(lm[i_a].x * ancho), int(lm[i_a].y * alto))
            pb = (int(lm[i_b].x * ancho), int(lm[i_b].y * alto))
            cv2.line(frame, pa, pb, COLOR_ESQUELETO, 2)


def _dibujar_angulos(frame, lm, ancho: int, alto: int):
    """Dibuja ángulos de rodilla y cadera sobre la imagen."""
    def punto(i):
        return (lm[i].x * ancho, lm[i].y * alto)

    # Rodilla (promedio izq/der)
    for lado, idx_cad, idx_rod, idx_tob in [
        ("I", LANDMARK_CADERA_IZQ, LANDMARK_RODILLA_IZQ, LANDMARK_TOBILLO_IZQ),
        ("D", LANDMARK_CADERA_DER, LANDMARK_RODILLA_DER, LANDMARK_TOBILLO_DER),
    ]:
        p_cad = punto(idx_cad)
        p_rod = punto(idx_rod)
        p_tob = punto(idx_tob)
        angulo = BiomecanicaService.angulo_articulacion_deg(p_cad, p_rod, p_tob)
        if angulo is not None:
            pos = (int(p_rod[0]) + 10, int(p_rod[1]) - 10)
            cv2.putText(frame, f"R{lado}:{angulo:.0f}", pos,
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, COLOR_TEXTO, 1)


def _dibujar_evento(frame, idx_actual: int, idx_evento: int | None,
                     texto: str, color: tuple, ancho: int, alto: int):
    """Dibuja un banner de evento si el frame actual coincide."""
    if idx_evento is None or idx_actual != idx_evento:
        return

    # Banner semitransparente en la parte superior
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (ancho, 40), color, -1)
    cv2.addWeighted(overlay, 0.5, frame, 0.5, 0, frame)
    cv2.putText(frame, texto, (ancho // 2 - 60, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
