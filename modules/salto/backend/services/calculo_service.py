"""
SERVICIO — Cálculos matemáticos puros para salto vertical y horizontal.

No accede a vídeo ni a red. Solo recibe datos numéricos y devuelve resultados.
"""

from dataclasses import dataclass
import numpy as np

from config import GRAVEDAD, UMBRAL_DERIVADA_Y
from models.video_processor import FramePies
from services.biomecanica_service import BiomecanicaService

# ── Pesos para combinación híbrida de métodos (vertical) ──
PESO_PIXELES = 0.6
PESO_CINEMATICA = 0.4
# Ratio máximo entre los dos métodos para considerarlos coherentes
RATIO_COHERENCIA_MAX = 1.8
# Pesos para el cálculo de confianza
PESO_COBERTURA_CONFIANZA = 0.65
PESO_PROFUNDIDAD_CONFIANZA = 0.35


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
    angulo_rodilla_deg: float | None = None
    angulo_cadera_deg: float | None = None
    potencia_w: float | None = None
    asimetria_pct: float | None = None
    # Fase 6 — Biomecánica del aterrizaje
    estabilidad_aterrizaje: float | None = None
    estabilidad_detalle: dict | None = None
    amortiguacion: dict | None = None
    asimetria_recepcion_pct: float | None = None
    # Fase 7 — Análisis cinemático temporal
    curvas_angulares: dict | None = None
    fases_salto: list | None = None
    velocidades_articulares: dict | None = None
    resumen_gesto: dict | None = None
    landmarks_frames: list | None = None
    factor_slowmo: float = 1.0  # >1 si se detectó slow-motion
    slowmo_factor: float | None = None  # alias devuelto en JSON al frontend


class CalculoService:
    """
    SERVICIO — Implementa las fórmulas de cinemática para salto vertical
    y de proyección geométrica para salto horizontal.
    """

    def calcular_vertical(
        self,
        frames: list[FramePies],
        fps: float,
        altura_real_m: float,
        peso_kg: float | None = None,
    ) -> ResultadoSalto:
        """
        Salto vertical — combina dos métodos:

        1. Cinemática (tiempo de vuelo): h = (1/8) * g * t²
        2. Píxeles calibrados: h = (Y_suelo - Y_pico) * (Hr / Hp)

        Si ambos están disponibles, devuelve el promedio ponderado
        (60 % píxeles — más fiable con buena detección —, 40 % cinemática).
        Si solo uno está disponible, usa ese.
        """
        despegue, aterrizaje, confianza = self._detectar_vuelo(frames, "vertical", fps)

        if despegue is None or aterrizaje is None:
            return ResultadoSalto(
                tipo_salto="vertical",
                distancia=0.0,
                confianza=0.0,
            )

        # Corrección automática de slow-motion
        factor_slowmo = self._detectar_factor_slowmo(frames, despegue, aterrizaje, fps, altura_real_m)
        fps_real = fps * factor_slowmo

        angulo_rodilla, angulo_cadera = self._calcular_angulos_despegue(frames, despegue)

        tiempo_vuelo = max(0.0, (aterrizaje - despegue) / fps_real)

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

        # ── Combinación con filtros de plausibilidad ──
        altura_cin_valida = altura_cin_cm if self._es_altura_vertical_plausible(altura_cin_cm) else None
        altura_px_valida = altura_px_cm if self._es_altura_vertical_plausible(altura_px_cm) else None

        if altura_px_valida is not None and altura_cin_valida is not None:
            mayor = max(altura_px_valida, altura_cin_valida)
            menor = min(altura_px_valida, altura_cin_valida)
            ratio = (mayor / menor) if menor > 0 else 99.0

            if ratio <= RATIO_COHERENCIA_MAX:
                distancia_final = (PESO_PIXELES * altura_px_valida) + (PESO_CINEMATICA * altura_cin_valida)
                metodo = "hibrido"
            else:
                # Si discrepan mucho, priorizar la estimación más alta para evitar colapso por ruido.
                distancia_final = mayor
                metodo = "hibrido_robusto"
        elif altura_px_valida is not None:
            distancia_final = altura_px_valida
            metodo = "pixeles"
        elif altura_cin_valida is not None:
            distancia_final = altura_cin_valida
            metodo = "cinematica"
        else:
            # Último fallback: conservar el valor cinemático si al menos es positivo.
            distancia_final = max(0.0, altura_cin_cm)
            metodo = "cinematica_fallback"

        # ── Potencia de Sayers (solo si hay peso) ──
        potencia_w = None
        if peso_kg is not None and peso_kg > 0 and distancia_final > 0:
            potencia_w = round(BiomecanicaService.potencia_sayers(distancia_final, peso_kg), 1)

        # ── Asimetría bilateral ──
        asimetria_pct = self._calcular_asimetria(frames, despegue)
        estabilidad = self._calcular_estabilidad(asimetria_pct, confianza)

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
            angulo_rodilla_deg=round(angulo_rodilla, 2) if angulo_rodilla is not None else None,
            angulo_cadera_deg=round(angulo_cadera, 2) if angulo_cadera is not None else None,
            potencia_w=potencia_w,
            asimetria_pct=asimetria_pct,
            estabilidad_aterrizaje=estabilidad,
            factor_slowmo=factor_slowmo,
            slowmo_factor=round(factor_slowmo, 2) if factor_slowmo > 1.0 else None,
        self,
        frames: list[FramePies],
        fps: float,
        altura_real_m: float,
        peso_kg: float | None = None,
    ) -> ResultadoSalto:
        """
        Salto horizontal por proyección geométrica.
        Calibración: S = Hr / Hp
        Distancia:   D_real = Dp * S

        Usa la altura del usuario en metros (altura_real_m) y la altura
        medida en píxeles para calcular el factor de escala.
        """
        import logging
        log = logging.getLogger(__name__)
        log.info("[HORIZ] Frames: %d, FPS: %.1f, altura_real: %.2f m", len(frames), fps, altura_real_m)

        despegue, aterrizaje, confianza = self._detectar_vuelo(frames, "horizontal", fps)
        log.info("[HORIZ] Vuelo: despegue=%s, aterrizaje=%s, confianza=%.3f", despegue, aterrizaje, confianza)

        if despegue is None or aterrizaje is None:
            log.warning("[HORIZ] No se detectó fase de vuelo → 0 cm")
            return ResultadoSalto(
                tipo_salto="horizontal",
                distancia=0.0,
                confianza=0.0,
            )

        # Corrección automática de slow-motion
        factor_slowmo = self._detectar_factor_slowmo(frames, despegue, aterrizaje, fps, altura_real_m)
        fps_real = fps * factor_slowmo
        log.info("[HORIZ] Slow-motion: factor=%.2f, fps_video=%.1f, fps_real=%.1f", factor_slowmo, fps, fps_real)

        angulo_rodilla, angulo_cadera = self._calcular_angulos_despegue(frames, despegue)

        # Factor de escala: usar la altura en píxeles del frame de despegue
        altura_px = frames[despegue].altura_persona_px
        if not altura_px or altura_px == 0:
            # Buscar el frame más cercano que tenga medida de altura
            altura_px = self._buscar_altura_px(frames, despegue)

        if not altura_px or altura_px == 0:
            log.warning("[HORIZ] Sin altura en px → 0 cm")
            return ResultadoSalto(
                tipo_salto="horizontal",
                distancia=0.0,
                confianza=0.0,
            )

        # S = Hr / Hp  (metros por píxel)
        factor_escala = altura_real_m / altura_px

        # Desplazamiento horizontal robusto en píxeles durante la ventana de vuelo.
        desplazamiento_px = self._desplazamiento_horizontal_robusto(frames, despegue, aterrizaje)
        log.info("[HORIZ] altura_px=%.1f, factor_escala=%.5f, desplaz_px=%s", altura_px, factor_escala, desplazamiento_px)
        if desplazamiento_px is None or desplazamiento_px <= 0:
            log.warning("[HORIZ] Desplazamiento horizontal nulo → 0 cm")
            return ResultadoSalto(
                tipo_salto="horizontal",
                distancia=0.0,
                confianza=0.0,
            )

        # D_real = Dp * S  →  en metros, convertir a cm
        distancia_m = desplazamiento_px * factor_escala
        distancia_cm = max(0.0, distancia_m * 100)
        tiempo_vuelo = (aterrizaje - despegue) / fps_real

        # Guardarraíl para evitar valores colapsados por detección espuria.
        if tiempo_vuelo > 0.12 and distancia_cm < 5:
            desplazamiento_px_total = self._desplazamiento_horizontal_robusto(frames, 0, len(frames) - 1)
            if desplazamiento_px_total is not None and desplazamiento_px_total > desplazamiento_px:
                distancia_cm = max(distancia_cm, desplazamiento_px_total * factor_escala * 100)

        asimetria_pct = self._calcular_asimetria(frames, despegue)
        estabilidad = self._calcular_estabilidad(asimetria_pct, confianza)
        potencia_w = self._calcular_potencia_horizontal(distancia_cm, tiempo_vuelo, peso_kg)

        return ResultadoSalto(
            tipo_salto="horizontal",
            distancia=round(distancia_cm, 2),
            confianza=round(confianza, 2),
            frame_despegue=despegue,
            frame_aterrizaje=aterrizaje,
            tiempo_vuelo_s=round(tiempo_vuelo, 4),
            angulo_rodilla_deg=round(angulo_rodilla, 2) if angulo_rodilla is not None else None,
            angulo_cadera_deg=round(angulo_cadera, 2) if angulo_cadera is not None else None,
            potencia_w=potencia_w,
            asimetria_pct=asimetria_pct,
            estabilidad_aterrizaje=estabilidad,
            factor_slowmo=factor_slowmo,
            slowmo_factor=round(factor_slowmo, 2) if factor_slowmo > 1.0 else None,self, frames: list[FramePies], tipo_salto: str, fps: float) -> tuple[int | None, int | None, float]:
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

        # 1. Filtro de suavizado adaptado al FPS para reducir ruido.
        ventana = max(3, int(round(fps * 0.08)))
        if ventana % 2 == 0:
            ventana += 1
        kernel = np.ones(ventana, dtype=float) / float(ventana)
        y_suave = np.convolve(y_array, kernel, mode='same')

        # 2. Baseline de apoyo y umbral dinámico por altura corporal.
        n_base = min(len(y_suave), max(8, int(round(fps * 0.6))))
        y_base = float(np.median(y_suave[:n_base]))
        altura_ref = self._altura_referencia_px(frames)
        if altura_ref is None or altura_ref <= 0:
            altura_ref = max(120.0, abs(float(np.percentile(y_suave, 95) - np.percentile(y_suave, 5))))

        if tipo_salto == "vertical":
            umbral_altura = max(1.2, altura_ref * 0.004)
        else:
            # Horizontal: umbral más alto para filtrar ruido de postura/caminata.
            # Un salto horizontal eleva los pies al menos 3-5 cm (~6-12 px típicos).
            # El ruido natural estando de pie es ~5-7 px, así que necesitamos superar eso.
            umbral_altura = max(8.0, altura_ref * 0.02)

        # 3. Detectar tramos en aire (pies claramente por encima del baseline).
        en_aire = y_suave < (y_base - umbral_altura)

        segmentos: list[tuple[int, int, float]] = []
        i = 0
        min_frames_vuelo = max(3, int(round(fps * 0.06)))
        while i < len(en_aire):
            if not en_aire[i]:
                i += 1
                continue
            start = i
            while i < len(en_aire) and en_aire[i]:
                i += 1
            end = i - 1
            if (end - start + 1) >= min_frames_vuelo:
                profundidad = float(y_base - np.min(y_suave[start:end + 1]))
                score = profundidad * float(end - start + 1)
                segmentos.append((start, end, score))

        despegue = None
        aterrizaje = None
        if segmentos:
            # Elegir el vuelo más consistente (profundidad * duración)
            start, end, _ = max(segmentos, key=lambda s: s[2])
            despegue = start
            aterrizaje = end
        else:
            # Fallback a derivada si no hay segmento limpio.
            derivada = np.diff(y_suave)
            ruido = float(np.std(derivada)) if len(derivada) > 0 else 0.0
            base_der = UMBRAL_DERIVADA_Y if tipo_salto == "vertical" else UMBRAL_DERIVADA_Y * 0.3
            umbral_derivada = max(base_der * 0.25, ruido * 0.9, 0.45)
            min_frames = max(3, int(round(fps * 0.06)))
            for k in range(len(derivada)):
                if derivada[k] < -umbral_derivada:
                    for j in range(k + min_frames, len(derivada)):
                        if derivada[j] > umbral_derivada:
                            despegue = k
                            aterrizaje = j + 1
                            break
                    if despegue is not None and aterrizaje is not None:
                        break

        if despegue is None or aterrizaje is None:
            despegue, aterrizaje = self._detectar_vuelo_legacy(y_suave, fps, tipo_salto)

        if despegue is None or aterrizaje is None:
            despegue, aterrizaje = self._detectar_vuelo_por_pico(y_suave, fps, frames)

        if despegue is None or aterrizaje is None:
            return None, None, 0.0

        # Validación temporal para descartar falsos positivos muy cortos.
        # Se usan límites generosos porque el vídeo puede estar en slow-motion
        # (el FPS del contenedor no refleja el tiempo real). La corrección
        # temporal precisa se aplica después con _detectar_factor_slowmo().
        tiempo_vuelo = (aterrizaje - despegue) / fps if fps > 0 else 0.0
        max_vuelo = 8.0 if tipo_salto == "horizontal" else 5.0
        if tiempo_vuelo < 0.05 or tiempo_vuelo > max_vuelo:
            return None, None, 0.0

        if tiempo_vuelo > 2.0:
            # Posible slow-motion: validar con elevación real de píxeles.
            elevacion_px = float(y_base - np.min(y_suave[despegue:aterrizaje + 1]))
            min_elevacion = (altura_ref * 0.02) if altura_ref and altura_ref > 0 else 3.0

            if elevacion_px >= min_elevacion:
                # Elevación significativa + duración larga = slow-motion, aceptar.
                pass
            else:
                # Sin elevación real, intentar detector por pico.
                desp_pico, aterr_pico = self._detectar_vuelo_por_pico(y_suave, fps, frames)
                if desp_pico is not None and aterr_pico is not None:
                    despegue, aterrizaje = desp_pico, aterr_pico
                else:
                    return None, None, 0.0

        frames_vuelo = frames[despegue:aterrizaje + 1]
        detectados = sum(1 for f in frames_vuelo if f.talon_izq_y is not None or f.talon_der_y is not None)
        cobertura = detectados / len(frames_vuelo) if frames_vuelo else 0.0
        profundidad_px = float(y_base - np.min(y_suave[despegue:aterrizaje + 1]))
        factor_profundidad = min(1.0, profundidad_px / max(umbral_altura * 1.8, 1.0))
        confianza = max(0.0, min(1.0, (PESO_COBERTURA_CONFIANZA * cobertura) + (PESO_PROFUNDIDAD_CONFIANZA * factor_profundidad)))

        return despegue, aterrizaje, confianza

    def _detectar_vuelo_legacy(self, y_suave: np.ndarray, fps: float, tipo_salto: str) -> tuple[int | None, int | None]:
        """Fallback conservador cuando el detector robusto no encuentra un vuelo limpio."""
        if y_suave is None or len(y_suave) < 3:
            return None, None

        derivada = np.diff(y_suave)
        umbral = (UMBRAL_DERIVADA_Y * 0.55) if tipo_salto == "vertical" else (UMBRAL_DERIVADA_Y * 0.22)
        min_frames = max(2, int(round(fps * 0.045)))

        for i in range(len(derivada)):
            if derivada[i] < -umbral:
                for j in range(i + min_frames, len(derivada)):
                    if derivada[j] > umbral:
                        return i, j + 1
        return None, None

    def _detectar_vuelo_por_pico(
        self,
        y_suave: np.ndarray,
        fps: float,
        frames: list[FramePies],
    ) -> tuple[int | None, int | None]:
        """
        Fallback basado en el pico del salto (mínimo Y = pies más altos).

        Funciona con carreras de aproximación donde el baseline inicial
        no es representativo del suelo. Busca el pico más prominente
        y trabaja hacia fuera para encontrar despegue y aterrizaje
        usando niveles de suelo locales.
        """
        if y_suave is None or len(y_suave) < 10:
            return None, None

        # 1. Encontrar el pico (mínimo Y = pies más arriba)
        idx_pico = int(np.argmin(y_suave))
        y_pico = float(y_suave[idx_pico])

        # Necesitamos frames antes y después del pico
        if idx_pico < 3 or idx_pico > len(y_suave) - 4:
            return None, None

        # 2. Nivel de suelo local: máximo Y antes y después del pico
        y_suelo_pre = float(np.max(y_suave[:idx_pico]))
        y_suelo_post = float(np.max(y_suave[idx_pico:]))

        # 3. La elevación debe ser significativa (>5% de la altura de la persona)
        elevacion = min(y_suelo_pre, y_suelo_post) - y_pico
        altura_ref = self._altura_referencia_px(frames)
        min_elevacion = (altura_ref * 0.05) if altura_ref and altura_ref > 0 else 5.0
        if elevacion < min_elevacion:
            return None, None

        # 4. Despegue: yendo hacia atrás desde el pico, buscar donde Y
        #    está al 85% del nivel de suelo pre-salto (15% ya elevado)
        umbral_desp = y_suelo_pre - (y_suelo_pre - y_pico) * 0.15
        despegue = idx_pico
        for i in range(idx_pico - 1, -1, -1):
            if y_suave[i] >= umbral_desp:
                despegue = i
                break

        # 5. Aterrizaje: yendo hacia adelante desde el pico, buscar donde Y
        #    vuelve al 85% del nivel de suelo post-salto
        umbral_aterr = y_suelo_post - (y_suelo_post - y_pico) * 0.15
        aterrizaje = idx_pico
        for i in range(idx_pico + 1, len(y_suave)):
            if y_suave[i] >= umbral_aterr:
                aterrizaje = i
                break

        if despegue == aterrizaje:
            return None, None

        return despegue, aterrizaje

    def _estimar_slowmo(
        self,
        frames: list[FramePies],
        despegue: int,
        aterrizaje: int,
        fps: float,
        altura_real_m: float,
    ) -> float:
        """
        Estima el factor de slow-motion comparando el tiempo basado en frames
        con el tiempo físico predicho por la elevación vertical.

        Usa h = (1/8) * g * t²  →  t_real = sqrt(8*h/g)

        Retorna factor >= 1.0 (1.0 = tiempo real, 2.0 = 2× cámara lenta, etc.)
        """
        tiempo_frames = (aterrizaje - despegue) / fps if fps > 0 else 0.0
        if tiempo_frames <= 0.05:
            return 1.0

        altura_px = self._buscar_altura_px(frames, despegue)
        if not altura_px or altura_px <= 0:
            return 1.0

        factor_escala = altura_real_m / altura_px  # metros por píxel

        y_suelo = self._promedio_y_pies(frames[despegue])
        y_pico = None
        for i in range(despegue, min(aterrizaje + 1, len(frames))):
            y = self._promedio_y_pies(frames[i])
            if y is not None and (y_pico is None or y < y_pico):
                y_pico = y

        if y_suelo is None or y_pico is None:
            return 1.0

        elevacion_px = y_suelo - y_pico
        if elevacion_px <= 0:
            return 1.0

        elevacion_m = elevacion_px * factor_escala

        # Física: h = (1/8) * g * t²  →  t = sqrt(8h / g)
        t_fisico = (8.0 * elevacion_m / GRAVEDAD) ** 0.5
        if t_fisico < 0.05:
            return 1.0

        factor = tiempo_frames / t_fisico
        return max(1.0, factor)

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

    @staticmethod
    def _altura_referencia_px(frames: list[FramePies]) -> float | None:
        alturas = [
            float(f.altura_persona_px)
            for f in frames
            if f.altura_persona_px is not None and f.altura_persona_px > 0
        ]
        if not alturas:
            return None
        return float(np.median(np.array(alturas, dtype=float)))

    @staticmethod
    def _es_altura_vertical_plausible(valor_cm: float | None) -> bool:
        if valor_cm is None:
            return False
        return 5.0 <= float(valor_cm) <= 180.0

    def detectar_tipo_salto(self, frames: list[FramePies], fps: float) -> str:
        """
        Analiza el patrón de movimiento real del vídeo y devuelve
        'vertical' u 'horizontal' según lo que se observa.

        Heurística: compara el desplazamiento neto en Y (pies subiendo)
        versus el desplazamiento neto en X (pies avanzando).
        Si Y >> X, el salto es vertical.
        """
        despegue, aterrizaje, _ = self._detectar_vuelo(frames, "horizontal", fps)
        if despegue is None or aterrizaje is None:
            return "vertical"

        # Desplazamiento Y: diferencia entre posición de apoyo y pico más alto
        ys = []
        for f in frames[despegue:aterrizaje + 1]:
            y = self._promedio_y_pies(f)
            if y is not None:
                ys.append(y)
        delta_y = (max(ys) - min(ys)) if len(ys) >= 2 else 0.0

        # Desplazamiento X: posición pre-salto vs post-salto
        pre_xs = []
        for i in range(max(0, despegue - 10), despegue):
            x = self._x_representativo(frames[i])
            if x is not None:
                pre_xs.append(x)
        post_xs = []
        for i in range(aterrizaje + 1, min(len(frames), aterrizaje + 11)):
            x = self._x_representativo(frames[i])
            if x is not None:
                post_xs.append(x)

        if pre_xs and post_xs:
            delta_x = abs(float(np.mean(post_xs)) - float(np.mean(pre_xs)))
        else:
            delta_x = 0.0

        # Si el movimiento vertical es >5x el horizontal, es un salto vertical
        if delta_y > 0 and (delta_x < 1.0 or delta_y / max(delta_x, 0.01) > 5.0):
            return "vertical"

        return "horizontal"

    def _x_representativo(self, frame: FramePies) -> float | None:
        x_pies = self._promedio_x_pies(frame)
        x_cadera = frame.cadera_x

        if x_pies is None and x_cadera is None:
            return None
        if x_pies is None:
            return float(x_cadera)
        if x_cadera is None:
            return float(x_pies)
        return float((0.7 * x_pies) + (0.3 * x_cadera))

    def _desplazamiento_horizontal_robusto(
        self,
        frames: list[FramePies],
        idx_inicio: int,
        idx_fin: int,
    ) -> float | None:
        if not frames:
            return None

        i0 = max(0, idx_inicio)
        i1 = min(len(frames) - 1, idx_fin)
        if i1 <= i0:
            return None

        xs = []
        for i in range(i0, i1 + 1):
            x = self._x_representativo(frames[i])
            if x is not None:
                xs.append(float(x))

        if len(xs) < 2:
            return None

        # Usar percentiles para minimizar el impacto de outliers de landmarks.
        x10 = float(np.percentile(xs, 10))
        x90 = float(np.percentile(xs, 90))
        desplazamiento = abs(x90 - x10)
        if desplazamiento <= 0:
            return None
        return desplazamiento

    @staticmethod
    def _calcular_angulos_despegue(frames: list[FramePies], idx_despegue: int) -> tuple[float | None, float | None]:
        """
        Calcula angulos articulares en el frame de despegue:
        - Rodilla: entre vectores cadera->rodilla y tobillo->rodilla.
        - Cadera: entre vectores hombro->cadera y rodilla->cadera.
        """
        if idx_despegue < 0 or idx_despegue >= len(frames):
            return None, None

        def frame_valido(fr: FramePies) -> bool:
            return all(v is not None for v in [
                fr.hombro_x,
                fr.hombro_y,
                fr.cadera_x,
                fr.cadera_y,
                fr.rodilla_x,
                fr.rodilla_y,
                fr.tobillo_x,
                fr.tobillo_y,
            ])

        f = None
        if frame_valido(frames[idx_despegue]):
            f = frames[idx_despegue]
        else:
            # Fallback robusto: usar el frame mas cercano al despegue con landmarks validos.
            for offset in range(1, min(len(frames), 8)):
                idx_prev = idx_despegue - offset
                idx_next = idx_despegue + offset
                if idx_prev >= 0 and frame_valido(frames[idx_prev]):
                    f = frames[idx_prev]
                    break
                if idx_next < len(frames) and frame_valido(frames[idx_next]):
                    f = frames[idx_next]
                    break

        if f is None:
            return None, None

        p_hombro = (float(f.hombro_x), float(f.hombro_y))
        p_cadera = (float(f.cadera_x), float(f.cadera_y))
        p_rodilla = (float(f.rodilla_x), float(f.rodilla_y))
        p_tobillo = (float(f.tobillo_x), float(f.tobillo_y))

        angulo_rodilla = BiomecanicaService.angulo_articulacion_deg(
            p_origen_v1=p_cadera,
            p_articulacion=p_rodilla,
            p_origen_v2=p_tobillo,
        )
        angulo_cadera = BiomecanicaService.angulo_articulacion_deg(
            p_origen_v1=p_hombro,
            p_articulacion=p_cadera,
            p_origen_v2=p_rodilla,
        )
        return angulo_rodilla, angulo_cadera

    @staticmethod
    def _calcular_asimetria(frames: list[FramePies], idx_despegue: int) -> float | None:
        """
        Compara el desplazamiento Y del talón izquierdo vs derecho durante el despegue.

        ASI = (|izq − der| / max(izq, der)) × 100
        """
        if idx_despegue < 0 or idx_despegue >= len(frames):
            return None

        f = frames[idx_despegue]
        if f.talon_izq_y is None or f.talon_der_y is None:
            return None

        # Desplazamiento de cada talón respecto a su posición en reposo
        # (frame 0 como referencia, si disponible)
        ref = frames[0] if frames else f
        if ref.talon_izq_y is None or ref.talon_der_y is None:
            # Sin referencia, usar valores absolutos del frame de despegue
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

    @staticmethod
    def _calcular_estabilidad(asimetria_pct: float | None, confianza: float) -> float:
        """
        Índice heurístico (0..100) de estabilidad de aterrizaje.

        Se usa como proxy hasta completar la fase de estabilidad por oscilación
        post-aterrizaje con curvas temporales.
        """
        asim = asimetria_pct if asimetria_pct is not None else 8.0
        penalizacion_asim = min(45.0, asim * 2.0)
        penalizacion_conf = max(0.0, (1.0 - float(confianza)) * 35.0)
        score = 100.0 - penalizacion_asim - penalizacion_conf
        return round(max(0.0, min(100.0, score)), 2)

    def _detectar_factor_slowmo(
        self,
        frames: list[FramePies],
        despegue: int,
        aterrizaje: int,
        fps_video: float,
        altura_real_m: float,
    ) -> float:
        """
        Detecta si el vídeo fue grabado en cámara lenta comparando la
        aceleración vertical aparente con la gravedad real (9.81 m/s²).

        En la fase de vuelo, la trayectoria vertical sigue una parábola:
            y(t) = y₀ + v₀·t + ½·a·t²

        Se ajusta una parábola a las coordenadas Y de la cadera durante
        el vuelo y se extrae la aceleración aparente.

        factor = sqrt(g_real / g_aparente)
        fps_real = fps_video * factor

        Devuelve el factor (>1 si es slow-motion, ~1 si es velocidad normal).
        Se limita el rango a [1.0, 12.0] para evitar resultados absurdos.
        """
        import logging
        log = logging.getLogger(__name__)

        n_vuelo = aterrizaje - despegue + 1
        if n_vuelo < 5:
            log.info("[SLOWMO] Vuelo muy corto (%d frames), no se puede estimar", n_vuelo)
            return 1.0

        # Usar coordenada Y de la cadera (más estable que los pies durante el vuelo).
        y_vals = []
        for i in range(despegue, aterrizaje + 1):
            f = frames[i]
            y = f.cadera_y if f.cadera_y is not None else self._promedio_y_pies(f)
            y_vals.append(y)

        # Interpolar Nones
        y_interp = self._interpolar_nones(y_vals)
        if y_interp is None or len(y_interp) < 5:
            log.info("[SLOWMO] Datos Y insuficientes, asumiendo factor=1.0")
            return 1.0

        # Ajustar parábola: y = a·t² + b·t + c  (t en frames)
        t_frames = np.arange(len(y_interp), dtype=float)
        try:
            coefs = np.polyfit(t_frames, y_interp, 2)
        except (np.linalg.LinAlgError, ValueError):
            log.info("[SLOWMO] Fallo en polyfit, asumiendo factor=1.0")
            return 1.0

        a_px_per_frame2 = coefs[0]  # aceleración en píxeles/frame²

        # En coordenadas de imagen, Y crece hacia abajo,
        # así que la gravedad produce a > 0 (la cadera cae = Y aumenta en la 2ª mitad).
        # La aceleración real es |2*a| (porque y = ½·a·t², polyfit da coef de t² = ½·a).
        a_px_per_frame2 = abs(a_px_per_frame2) * 2.0

        if a_px_per_frame2 < 1e-6:
            log.info("[SLOWMO] Aceleración aparente ~0, asumiendo factor=1.0")
            return 1.0

        # Convertir de píxeles/frame² a m/s²:
        # a_real = a_px * escala * fps²
        altura_px = self._altura_referencia_px(frames)
        if not altura_px or altura_px <= 0:
            log.info("[SLOWMO] Sin altura en px, asumiendo factor=1.0")
            return 1.0

        escala = altura_real_m / altura_px  # metros/píxel
        g_aparente = a_px_per_frame2 * escala * (fps_video ** 2)

        if g_aparente < 0.1:
            log.info("[SLOWMO] g_aparente=%.3f demasiado bajo, asumiendo factor=1.0", g_aparente)
            return 1.0

        factor = float(np.sqrt(GRAVEDAD / g_aparente))

        log.info(
            "[SLOWMO] a_px=%.4f px/f², escala=%.6f m/px, g_aparente=%.3f m/s², factor=%.2f",
            a_px_per_frame2, escala, g_aparente, factor,
        )

        # Solo aplicar si el factor es significativo (>1.3 = al menos 30% slow-mo).
        # Si está entre 0.7 y 1.3, asumimos velocidad normal.
        if 0.7 <= factor <= 1.3:
            log.info("[SLOWMO] Factor cercano a 1.0 (%.2f), no se aplica corrección", factor)
            return 1.0

        # Limitar rango razonable: los móviles graban a 2x–8x slow-mo típicamente.
        factor = max(1.0, min(12.0, factor))
        log.info("[SLOWMO] Aplicando corrección slow-motion: factor=%.2f", factor)
        return factor

    @staticmethod
    def _calcular_potencia_horizontal(
        distancia_cm: float,
        tiempo_vuelo_s: float,
        peso_kg: float | None,
    ) -> float | None:
        """
        Estimación de potencia para salto horizontal.

        A partir de distancia y tiempo de vuelo se estima la velocidad de despegue:
            vx = D / t
            vy = g * t / 2
            E = 0.5 * m * (vx^2 + vy^2)
        y la potencia media aproximada durante el impulso como E / t_impulso.
        """
        if peso_kg is None or peso_kg <= 0:
            return None
        if distancia_cm <= 0 or tiempo_vuelo_s <= 0:
            return None

        distancia_m = float(distancia_cm) / 100.0
        t = float(tiempo_vuelo_s)
        vx = distancia_m / t
        vy = (GRAVEDAD * t) / 2.0
        energia_j = 0.5 * float(peso_kg) * ((vx * vx) + (vy * vy))

        # Aproximación de fase de impulso (s) para convertir energía en potencia media.
        t_impulso = min(0.35, max(0.18, 0.45 * t))
        potencia_w = energia_j / t_impulso if t_impulso > 0 else 0.0
        if not np.isfinite(potencia_w) or potencia_w <= 0:
            return None
        return round(float(potencia_w), 1)
