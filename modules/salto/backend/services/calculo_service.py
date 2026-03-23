"""
SERVICE — Cálculos matemáticos puros para salto vertical y horizontal.

No accede a vídeo ni a red. Solo recibe datos numéricos y devuelve resultados.
"""

from dataclasses import dataclass
import numpy as np

from config import GRAVEDAD, UMBRAL_DERIVADA_Y
from models.video_processor import FramePies


@dataclass
class ResultadoSalto:
    """Resultado final del cálculo de un salto."""
    tipo_salto: str             # "vertical" | "horizontal"
    distancia: float            # En centímetros
    unidad: str = "cm"
    confianza: float = 0.0      # 0.0 a 1.0
    frame_despegue: int | None = None
    frame_aterrizaje: int | None = None
    tiempo_vuelo_s: float | None = None
    metodo: str | None = None   # "pixeles" | "cinematica" | "hibrido"
    dist_por_pixeles: float | None = None   # cm (solo vertical)
    dist_por_cinematica: float | None = None  # cm (solo vertical)


class CalculoService:
    """
    SERVICE — Implementa las fórmulas de cinemática para salto vertical
    y de proyección geométrica para salto horizontal.
    """

    def calcular_vertical(
        self,
        frames: list[FramePies],
        fps: float,
        altura_real_m: float,
    ) -> ResultadoSalto:
        """
        Salto vertical — combina dos métodos:

        1. Cinemática (tiempo de vuelo): h = (1/8) * g * t²
        2. Píxeles calibrados: h = (Y_suelo - Y_pico) * (Hr / Hp)

        Si ambos están disponibles, devuelve el promedio ponderado
        (60 % píxeles — más fiable con buena detección —, 40 % cinemática).
        Si solo uno está disponible, usa ese.
        """
        despegue, aterrizaje, confianza = self._detectar_vuelo(frames, "vertical")

        if despegue is None or aterrizaje is None:
            return ResultadoSalto(
                tipo_salto="vertical",
                distancia=0.0,
                confianza=0.0,
            )

        tiempo_vuelo = (aterrizaje - despegue) / fps

        # ── Método 1: Cinemática ──
        altura_cin_cm = (1 / 8) * GRAVEDAD * (tiempo_vuelo ** 2) * 100

        # ── Método 2: Píxeles calibrados ──
        altura_px_cm = None
        altura_px = frames[despegue].altura_persona_px
        if not altura_px or altura_px == 0:
            altura_px = self._buscar_altura_px(frames, despegue)

        if altura_px and altura_px > 0:
            factor_escala = altura_real_m / altura_px

            y_suelo = self._promedio_y_pies(frames[despegue])
            y_pico = None
            for i in range(despegue, aterrizaje + 1):
                y_frame = self._promedio_y_pies(frames[i])
                if y_frame is not None and (y_pico is None or y_frame < y_pico):
                    y_pico = y_frame

            if y_suelo is not None and y_pico is not None:
                desp = y_suelo - y_pico
                if desp > 0:
                    altura_px_cm = desp * factor_escala * 100

        # ── Combinación ──
        if altura_px_cm is not None and altura_cin_cm > 0:
            # Promedio ponderado: píxeles más peso por ser más directo
            distancia_final = 0.6 * altura_px_cm + 0.4 * altura_cin_cm
            metodo = "hibrido"
        elif altura_px_cm is not None:
            distancia_final = altura_px_cm
            metodo = "pixeles"
        else:
            distancia_final = altura_cin_cm
            metodo = "cinematica"

        return ResultadoSalto(
            tipo_salto="vertical",
            distancia=round(distancia_final, 2),
            confianza=round(confianza, 2),
            frame_despegue=despegue,
            frame_aterrizaje=aterrizaje,
            tiempo_vuelo_s=round(tiempo_vuelo, 4),
            metodo=metodo,
            dist_por_pixeles=round(altura_px_cm, 2) if altura_px_cm is not None else None,
            dist_por_cinematica=round(altura_cin_cm, 2),
        )

    def calcular_horizontal(
        self,
        frames: list[FramePies],
        fps: float,
        altura_real_m: float,
    ) -> ResultadoSalto:
        """
        Salto horizontal por proyección geométrica.
        Calibración: S = Hr / Hp
        Distancia:   D_real = Dp * S

        Usa la altura del usuario en metros (altura_real_m) y la altura
        medida en píxeles para calcular el factor de escala.
        """
        despegue, aterrizaje, confianza = self._detectar_vuelo(frames, "horizontal")

        if despegue is None or aterrizaje is None:
            return ResultadoSalto(
                tipo_salto="horizontal",
                distancia=0.0,
                confianza=0.0,
            )

        # Factor de escala: usar la altura en píxeles del frame de despegue
        altura_px = frames[despegue].altura_persona_px
        if not altura_px or altura_px == 0:
            # Buscar el frame más cercano que tenga medida de altura
            altura_px = self._buscar_altura_px(frames, despegue)

        if not altura_px or altura_px == 0:
            return ResultadoSalto(
                tipo_salto="horizontal",
                distancia=0.0,
                confianza=0.0,
            )

        # S = Hr / Hp  (metros por píxel)
        factor_escala = altura_real_m / altura_px

        # Desplazamiento horizontal en píxeles entre despegue y aterrizaje
        x_despegue = self._promedio_x_pies(frames[despegue])
        x_aterrizaje = self._promedio_x_pies(frames[aterrizaje])

        if x_despegue is None or x_aterrizaje is None:
            return ResultadoSalto(
                tipo_salto="horizontal",
                distancia=0.0,
                confianza=0.0,
            )

        desplazamiento_px = abs(x_aterrizaje - x_despegue)

        # D_real = Dp * S  →  en metros, convertir a cm
        distancia_m = desplazamiento_px * factor_escala
        distancia_cm = distancia_m * 100

        tiempo_vuelo = (aterrizaje - despegue) / fps

        return ResultadoSalto(
            tipo_salto="horizontal",
            distancia=round(distancia_cm, 2),
            confianza=round(confianza, 2),
            frame_despegue=despegue,
            frame_aterrizaje=aterrizaje,
            tiempo_vuelo_s=round(tiempo_vuelo, 4),
        )

    def _detectar_vuelo(self, frames: list[FramePies], tipo_salto: str) -> tuple[int | None, int | None, float]:
        """
        Detecta los frames de despegue y aterrizaje usando la derivada
        de la coordenada Y, aplicando suavizado de señal (media móvil)
        para tolerar ruido e imprecisiones de MediaPipe.
        """
        y_talones = []
        for f in frames:
            if f.talon_izq_y is not None and f.talon_der_y is not None:
                y_talones.append((f.talon_izq_y + f.talon_der_y) / 2)
            elif f.talon_izq_y is not None:
                y_talones.append(f.talon_izq_y)
            elif f.talon_der_y is not None:
                y_talones.append(f.talon_der_y)
            else:
                y_talones.append(None)

        y_array = self._interpolar_nones(y_talones)
        if y_array is None or len(y_array) < 3:
            return None, None, 0.0

        # 1. Filtro de suavizado (Media móvil de 3 fotogramas)
        # Elimina las micro-vibraciones antes de buscar el despegue
        kernel = np.ones(3) / 3
        y_suave = np.convolve(y_array, kernel, mode='same')

        # 2. Cálculo de la derivada sobre la señal limpia
        derivada = np.diff(y_suave)
        umbral = UMBRAL_DERIVADA_Y if tipo_salto == "vertical" else UMBRAL_DERIVADA_Y * 0.3

        despegue = None
        aterrizaje = None
        
        # Margen ciego: Un salto humano tiene una fase de ascenso ininterrumpida.
        # Se ignoran los falsos aterrizajes durante los primeros 5 frames tras el despegue.
        MIN_FRAMES = 5 

        # 3. Búsqueda robusta
        for i in range(len(derivada)):
            if derivada[i] < -umbral:
                # Se ha encontrado un despegue. 
                # Buscar el aterrizaje empezando 'MIN_FRAMES' después del despegue.
                for j in range(i + MIN_FRAMES, len(derivada)):
                    if derivada[j] > umbral:
                        despegue = i
                        aterrizaje = j + 1
                        break
                
                # Si se encuentra un ciclo completo válido, detener la búsqueda global
                if despegue is not None and aterrizaje is not None:
                    break

        if despegue is None or aterrizaje is None:
            return None, None, 0.0

        frames_vuelo = frames[despegue:aterrizaje + 1]
        detectados = sum(1 for f in frames_vuelo if f.talon_izq_y is not None)
        confianza = detectados / len(frames_vuelo) if frames_vuelo else 0.0

        return despegue, aterrizaje, confianza

    def _interpolar_nones(self, valores: list[float | None]) -> np.ndarray | None:
        """Reemplaza Nones con interpolación lineal. Devuelve None si todo es None."""
        if all(v is None for v in valores):
            return None

        arr = np.array([v if v is not None else np.nan for v in valores], dtype=float)
        nans = np.isnan(arr)
        if nans.all():
            return None

        # Interpolación lineal
        indices = np.arange(len(arr))
        arr[nans] = np.interp(indices[nans], indices[~nans], arr[~nans])
        return arr

    @staticmethod
    def _promedio_x_pies(frame: FramePies) -> float | None:
        """Promedio de X de talones y puntas (lo que esté disponible)."""
        xs = [v for v in [frame.talon_izq_x, frame.talon_der_x,
                          frame.punta_izq_x, frame.punta_der_x] if v is not None]
        return sum(xs) / len(xs) if xs else None

    @staticmethod
    def _promedio_y_pies(frame: FramePies) -> float | None:
        """Promedio de Y de talones (lo que esté disponible)."""
        ys = [v for v in [frame.talon_izq_y, frame.talon_der_y] if v is not None]
        return sum(ys) / len(ys) if ys else None

    @staticmethod
    def _buscar_altura_px(frames: list[FramePies], centro: int) -> float | None:
        """Busca la altura en píxeles más cercana al frame dado."""
        for offset in range(len(frames)):
            for idx in [centro - offset, centro + offset]:
                if 0 <= idx < len(frames) and frames[idx].altura_persona_px:
                    return frames[idx].altura_persona_px
        return None
