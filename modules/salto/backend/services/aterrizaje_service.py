"""
SERVICIO — Biomecánica del aterrizaje (Fase 6).

Analiza la estabilidad post-aterrizaje, la amortiguación de rodilla
y la simetría en la recepción.
"""

import numpy as np
from models.video_processor import FramePies
from services.biomecanica_service import BiomecanicaService


class AterrizajeService:
    """Funciones puras para analizar la fase de recepción de un salto."""

    # Ventana máxima de frames post-aterrizaje a analizar
    VENTANA_POST_ATERRIZAJE = 30

    # Umbral de derivada Y (px/frame) para considerar que el CM se ha estabilizado
    UMBRAL_ESTABILIZADO = 0.5

    @classmethod
    def analizar_estabilidad(
        cls,
        frames: list[FramePies],
        idx_aterrizaje: int,
        fps: float,
    ) -> dict | None:
        """
        6.1 — Estabilidad de aterrizaje.

        Mide la oscilación del centro de masa (promedio de caderas Y)
        en los N frames tras aterrizar y el tiempo hasta estabilización.

        Retorna:
            {
                "oscilacion_px": float,
                "tiempo_estabilizacion_s": float,
                "estable": bool
            }
        """
        if idx_aterrizaje is None or idx_aterrizaje < 0 or idx_aterrizaje >= len(frames):
            return None

        fin = min(idx_aterrizaje + cls.VENTANA_POST_ATERRIZAJE, len(frames))
        rango = frames[idx_aterrizaje:fin]

        if len(rango) < 3:
            return None

        # Centro de masa aproximado = promedio Y de caderas
        y_cm = []
        for f in rango:
            if f.cadera_y is not None:
                y_cm.append(f.cadera_y)
            else:
                y_cm.append(None)

        # Interpolar Nones
        validos = [v for v in y_cm if v is not None]
        if len(validos) < 3:
            return None

        arr = np.array([v if v is not None else np.nan for v in y_cm], dtype=float)
        nans = np.isnan(arr)
        if nans.any() and not nans.all():
            indices = np.arange(len(arr))
            arr[nans] = np.interp(indices[nans], indices[~nans], arr[~nans])

        # Oscilación = desviación estándar de Y en la ventana
        oscilacion_px = float(np.std(arr))

        # Tiempo hasta estabilización: primer frame donde derivada ~0 se mantiene
        derivada = np.abs(np.diff(arr))
        idx_estable = None
        for i in range(len(derivada)):
            if derivada[i] < cls.UMBRAL_ESTABILIZADO:
                # Verificar que se mantiene estable (2 frames consecutivos)
                if i + 1 < len(derivada) and derivada[i + 1] < cls.UMBRAL_ESTABILIZADO:
                    idx_estable = i
                    break
                elif i + 1 >= len(derivada):
                    idx_estable = i
                    break

        if idx_estable is not None:
            tiempo_estab = idx_estable / fps if fps > 0 else 0.0
            estable = True
        else:
            tiempo_estab = len(rango) / fps if fps > 0 else 0.0
            estable = False

        return {
            "oscilacion_px": round(oscilacion_px, 2),
            "tiempo_estabilizacion_s": round(tiempo_estab, 3),
            "estable": estable,
        }

    @classmethod
    def analizar_amortiguacion(
        cls,
        frames: list[FramePies],
        idx_aterrizaje: int,
    ) -> dict | None:
        """
        6.2 — Análisis de amortiguación.

        Calcula el ángulo de rodilla al aterrizar, la flexión máxima
        post-aterrizaje y el rango de amortiguación.

        Retorna:
            {
                "angulo_rodilla_aterrizaje_deg": float,
                "flexion_maxima_deg": float,
                "rango_amortiguacion_deg": float,
                "alerta_rigidez": bool
            }
        """
        if idx_aterrizaje is None or idx_aterrizaje < 0 or idx_aterrizaje >= len(frames):
            return None

        def angulo_rodilla_en(f: FramePies) -> float | None:
            if any(v is None for v in [f.cadera_x, f.cadera_y, f.rodilla_x, f.rodilla_y, f.tobillo_x, f.tobillo_y]):
                return None
            return BiomecanicaService.angulo_articulacion_deg(
                p_origen_v1=(f.cadera_x, f.cadera_y),
                p_articulacion=(f.rodilla_x, f.rodilla_y),
                p_origen_v2=(f.tobillo_x, f.tobillo_y),
            )

        # Ángulo al aterrizar (con fallback a frames cercanos)
        angulo_aterrizaje = None
        for offset in range(min(5, len(frames))):
            for idx in [idx_aterrizaje + offset, idx_aterrizaje - offset]:
                if 0 <= idx < len(frames):
                    a = angulo_rodilla_en(frames[idx])
                    if a is not None:
                        angulo_aterrizaje = a
                        break
            if angulo_aterrizaje is not None:
                break

        if angulo_aterrizaje is None:
            return None

        # Flexión máxima post-aterrizaje (ángulo mínimo = máxima flexión)
        fin = min(idx_aterrizaje + cls.VENTANA_POST_ATERRIZAJE, len(frames))
        flexion_maxima = angulo_aterrizaje
        for i in range(idx_aterrizaje, fin):
            a = angulo_rodilla_en(frames[i])
            if a is not None and a < flexion_maxima:
                flexion_maxima = a

        rango = angulo_aterrizaje - flexion_maxima

        return {
            "angulo_rodilla_aterrizaje_deg": round(angulo_aterrizaje, 2),
            "flexion_maxima_deg": round(flexion_maxima, 2),
            "rango_amortiguacion_deg": round(rango, 2),
            "alerta_rigidez": rango < 20,
        }

    @classmethod
    def analizar_simetria_recepcion(
        cls,
        frames: list[FramePies],
        idx_aterrizaje: int,
    ) -> float | None:
        """
        6.3 — Simetría en la recepción.

        Compara desplazamiento Y de talón izquierdo vs derecho en el aterrizaje.
        Retorna ASI (%) igual que la asimetría de despegue.
        """
        if idx_aterrizaje is None or idx_aterrizaje < 0 or idx_aterrizaje >= len(frames):
            return None

        f = frames[idx_aterrizaje]
        if f.talon_izq_y is None or f.talon_der_y is None:
            return None

        ref = frames[0] if frames else f
        if ref.talon_izq_y is None or ref.talon_der_y is None:
            izq = abs(f.talon_izq_y)
            der = abs(f.talon_der_y)
        else:
            izq = abs(ref.talon_izq_y - f.talon_izq_y)
            der = abs(ref.talon_der_y - f.talon_der_y)

        maximo = max(izq, der)
        if maximo == 0:
            return 0.0

        asi = (abs(izq - der) / maximo) * 100
        return round(asi, 1)

    @classmethod
    def idx_estabilizacion(
        cls,
        frames: list[FramePies],
        idx_aterrizaje: int,
        fps: float,
    ) -> int | None:
        """
        Devuelve el índice de frame donde se alcanza la estabilización.
        Útil para delimitar la fase de recepción en el análisis cinemático.
        """
        resultado = cls.analizar_estabilidad(frames, idx_aterrizaje, fps)
        if resultado is None:
            return None

        if resultado["estable"]:
            n_frames = int(resultado["tiempo_estabilizacion_s"] * fps) if fps > 0 else 0
            return min(idx_aterrizaje + n_frames, len(frames) - 1)

        return min(idx_aterrizaje + cls.VENTANA_POST_ATERRIZAJE, len(frames) - 1)
