"""Script de diagnóstico: procesa un vídeo y muestra valores internos del pipeline."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "modules", "salto", "backend"))

import numpy as np
from models.video_processor import VideoProcessor
from services.calculo_service import CalculoService
from config import GRAVEDAD, UMBRAL_DERIVADA_Y

VIDEO = r"C:\Users\danie\Downloads\Horizontal prueba.mp4"
ALTURA_REAL_M = 1.78  # Ajustar si es diferente
TIPO = "horizontal"

print(f"=== Procesando: {VIDEO} ===")
proc = VideoProcessor()
frames, info = proc.procesar(VIDEO)

if not frames or not info:
    print("ERROR: No se pudieron extraer frames")
    sys.exit(1)

print(f"\n--- Info del vídeo ---")
print(f"FPS del contenedor: {info.fps}")
print(f"Total frames: {info.total_frames}")
print(f"Resolución: {info.ancho}x{info.alto}")
print(f"Duración aparente: {info.total_frames / info.fps:.2f} s")

# Mostrar Y de talones para ver la señal
print(f"\n--- Señal Y de talones (primeros 20 frames) ---")
for i, f in enumerate(frames[:20]):
    y_izq = f.talon_izq_y
    y_der = f.talon_der_y
    y_avg = None
    if y_izq is not None and y_der is not None:
        y_avg = (y_izq + y_der) / 2
    print(f"  Frame {i:3d}: Y_izq={y_izq}, Y_der={y_der}, Y_avg={y_avg}, cadera_y={f.cadera_y}")

# Calcular manualmente
calc = CalculoService()

# 1. Detectar vuelo
despegue, aterrizaje, confianza = calc._detectar_vuelo(frames, TIPO, info.fps)
print(f"\n--- Detección de vuelo ---")
print(f"Despegue: frame {despegue}")
print(f"Aterrizaje: frame {aterrizaje}")
print(f"Confianza: {confianza:.3f}")
if despegue is not None and aterrizaje is not None:
    t_vuelo_aparente = (aterrizaje - despegue) / info.fps
    print(f"Frames de vuelo: {aterrizaje - despegue}")
    print(f"Tiempo vuelo aparente: {t_vuelo_aparente:.3f} s")

    # 2. Detectar slow-motion
    factor = calc._detectar_factor_slowmo(frames, despegue, aterrizaje, info.fps, ALTURA_REAL_M)
    fps_real = info.fps * factor
    t_vuelo_real = (aterrizaje - despegue) / fps_real
    print(f"\n--- Slow-motion ---")
    print(f"Factor detectado: {factor:.3f}")
    print(f"FPS video: {info.fps:.1f}")
    print(f"FPS real (corregido): {fps_real:.1f}")
    print(f"Tiempo vuelo real: {t_vuelo_real:.3f} s")

    # 3. Factor de escala
    altura_px = calc._altura_referencia_px(frames)
    if altura_px:
        factor_escala = ALTURA_REAL_M / altura_px
        print(f"\n--- Calibración ---")
        print(f"Altura en px (mediana): {altura_px:.1f}")
        print(f"Factor escala: {factor_escala:.6f} m/px")

    # 4. Desplazamiento horizontal
    desp_px = calc._desplazamiento_horizontal_robusto(frames, despegue, aterrizaje)
    print(f"\n--- Desplazamiento horizontal ---")
    print(f"Desplazamiento en px: {desp_px}")
    if desp_px and altura_px:
        dist_m = desp_px * factor_escala
        dist_cm = dist_m * 100
        print(f"Distancia calculada: {dist_cm:.1f} cm")

    # 5. Mostrar X representativo en frames clave
    print(f"\n--- X representativo en frames clave ---")
    for idx in [0, despegue, (despegue+aterrizaje)//2, aterrizaje, len(frames)-1]:
        if 0 <= idx < len(frames):
            x = calc._x_representativo(frames[idx])
            print(f"  Frame {idx:3d}: X_repr = {x}")

    # 6. Mostrar Y de cadera durante vuelo (para ver la parábola)
    print(f"\n--- Y cadera durante vuelo (parábola) ---")
    for i in range(despegue, min(aterrizaje+1, despegue+30)):
        f = frames[i]
        y = f.cadera_y
        print(f"  Frame {i:3d}: cadera_y = {y}")

else:
    print("No se detectó vuelo!")

# 7. Resultado final completo
print(f"\n--- Resultado final del pipeline ---")
resultado = calc.calcular_horizontal(frames, info.fps, ALTURA_REAL_M)
print(f"Distancia: {resultado.distancia} cm")
print(f"Confianza: {resultado.confianza}")
print(f"Frame despegue: {resultado.frame_despegue}")
print(f"Frame aterrizaje: {resultado.frame_aterrizaje}")
print(f"Tiempo vuelo: {resultado.tiempo_vuelo_s} s")
print(f"Factor slow-mo: {resultado.factor_slowmo}")
print(f"Potencia: {resultado.potencia_w}")
