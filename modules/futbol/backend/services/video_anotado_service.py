"""
SERVICIO — Generación de vídeo anotado del golpeo.

Overlay con OpenCV: esqueleto, ángulos articulares, marca de frame de impacto
y trayectoria del tobillo de la pierna de golpeo.
"""

from __future__ import annotations

import os

import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    PoseLandmarker,
    PoseLandmarkerOptions,
    RunningMode,
)

from config import MIN_DETECTION_CONFIDENCE, MIN_TRACKING_CONFIDENCE, MODEL_PATH
from services.biomecanica_service import angulo_3p


COLOR_ESQUELETO = (0, 255, 0)
COLOR_PUNTO = (0, 0, 255)
COLOR_TEXTO = (255, 255, 255)
COLOR_IMPACTO = (0, 255, 255)        # amarillo
COLOR_TRAYECTORIA = (255, 100, 0)    # naranja

CONEXIONES_CUERPO = [
    (11, 12), (11, 23), (12, 24), (23, 24),
    (11, 13), (13, 15),
    (12, 14), (14, 16),
    (23, 25), (25, 27), (27, 29), (27, 31),
    (24, 26), (26, 28), (28, 30), (28, 32),
]


def generar_video_anotado(
    ruta_video_entrada: str,
    ruta_video_salida: str,
    frame_impacto: int | None = None,
    pierna_golpeo: str | None = None,
) -> bool:
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

    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=MIN_DETECTION_CONFIDENCE,
        min_tracking_confidence=MIN_TRACKING_CONFIDENCE,
    )
    landmarker = PoseLandmarker.create_from_options(options)

    # Índice de tobillo según pierna de golpeo
    idx_tob_golpeo = 27 if pierna_golpeo == "izquierda" else 28
    trayectoria: list[tuple[int, int]] = []

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

            if resultado.pose_landmarks and len(resultado.pose_landmarks) > 0:
                lm = resultado.pose_landmarks[0]
                _dibujar_esqueleto(frame, lm, ancho, alto)
                _dibujar_angulos(frame, lm, ancho, alto, pierna_golpeo)

                if 0 <= idx_tob_golpeo < len(lm):
                    px = int(lm[idx_tob_golpeo].x * ancho)
                    py = int(lm[idx_tob_golpeo].y * alto)
                    trayectoria.append((px, py))

            for i in range(1, len(trayectoria)):
                cv2.line(frame, trayectoria[i - 1], trayectoria[i], COLOR_TRAYECTORIA, 2)

            if frame_impacto is not None and idx == frame_impacto:
                _dibujar_banner(frame, ancho, "IMPACTO", COLOR_IMPACTO)

            cv2.putText(frame, f"Frame {idx}", (10, alto - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_TEXTO, 1)

            writer.write(frame)
            idx += 1
    finally:
        landmarker.close()
        cap.release()
        writer.release()

    return os.path.exists(ruta_video_salida)


def _dibujar_esqueleto(frame, lm, ancho: int, alto: int) -> None:
    for i in range(min(33, len(lm))):
        x = int(lm[i].x * ancho)
        y = int(lm[i].y * alto)
        cv2.circle(frame, (x, y), 3, COLOR_PUNTO, -1)
    for i_a, i_b in CONEXIONES_CUERPO:
        if i_a < len(lm) and i_b < len(lm):
            pa = (int(lm[i_a].x * ancho), int(lm[i_a].y * alto))
            pb = (int(lm[i_b].x * ancho), int(lm[i_b].y * alto))
            cv2.line(frame, pa, pb, COLOR_ESQUELETO, 2)


def _dibujar_angulos(frame, lm, ancho: int, alto: int, pierna_golpeo: str | None) -> None:
    def punto(i: int) -> tuple[float, float]:
        return (lm[i].x * ancho, lm[i].y * alto)

    triadas = [
        ("RI", 23, 25, 27),
        ("RD", 24, 26, 28),
        ("CI", 11, 23, 25),
        ("CD", 12, 24, 26),
    ]
    for etiqueta, i_a, i_b, i_c in triadas:
        if i_c >= len(lm):
            continue
        a = angulo_3p(punto(i_a), punto(i_b), punto(i_c))
        if a is None:
            continue
        pos = (int(lm[i_b].x * ancho) + 8, int(lm[i_b].y * alto) - 8)
        cv2.putText(frame, f"{etiqueta}:{a:.0f}", pos,
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, COLOR_TEXTO, 1)


def _dibujar_banner(frame, ancho: int, texto: str, color: tuple) -> None:
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (ancho, 40), color, -1)
    cv2.addWeighted(overlay, 0.5, frame, 0.5, 0, frame)
    cv2.putText(frame, texto, (ancho // 2 - 60, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
