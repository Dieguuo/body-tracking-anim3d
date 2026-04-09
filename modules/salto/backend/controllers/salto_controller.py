"""
CONTROLADOR — Orquesta el procesamiento de vídeo y el cálculo del salto.

Recibe la ruta del vídeo y los parámetros, coordina modelo y servicio,
y devuelve el resultado final.
"""

from models.video_processor import VideoProcessor
from services.calculo_service import CalculoService, ResultadoSalto
from services.aterrizaje_service import AterrizajeService
from services.cinematico_service import CinematicoService


class SaltoController:
    """
    CONTROLADOR — Flujo principal:
      1. Validar archivo de vídeo
      2. Procesar con MediaPipe (Modelo)
      3. Calcular distancia (Servicio)
      4. Analizar aterrizaje y cinemática (Fases 6-7)
      5. Devolver resultado
    """

    def __init__(self):
        self.processor = VideoProcessor()
        self.calculo = CalculoService()

    def procesar_salto(
        self,
        ruta_video: str,
        tipo_salto: str,
        altura_real_m: float | None = None,
        peso_kg: float | None = None,
    ) -> ResultadoSalto:
        """
        Punto de entrada principal.

        Args:
            ruta_video: Ruta al archivo de vídeo guardado en disco.
            tipo_salto: "vertical" o "horizontal".
            altura_real_m: Altura real del usuario en metros (obligatorio para ambos tipos).

        Returns:
            ResultadoSalto con la distancia calculada y análisis completo.
        """
        # Procesar vídeo (Modelo)
        frames, info = self.processor.procesar(ruta_video)

        if not frames or info is None:
            return ResultadoSalto(
                tipo_salto=tipo_salto,
                distancia=0.0,
                confianza=0.0,
            )

        if tipo_salto == "horizontal":
            resultado = self.calculo.calcular_horizontal(frames, info.fps, altura_real_m)
        else:
            resultado = self.calculo.calcular_vertical(frames, info.fps, altura_real_m, peso_kg)

        # Fase 6+7: análisis avanzado solo si se detectó un salto válido
        if resultado.frame_despegue is not None and resultado.frame_aterrizaje is not None:
            self._enriquecer_con_analisis(resultado, frames, info.fps)

        return resultado

    @staticmethod
    def _enriquecer_con_analisis(
        resultado: ResultadoSalto,
        frames: list,
        fps: float,
    ) -> None:
        """Añade datos de aterrizaje (Fase 6) y cinemática (Fase 7) al resultado."""
        desp = resultado.frame_despegue
        aterr = resultado.frame_aterrizaje

        # ── Fase 6 — Biomecánica del aterrizaje ──
        resultado.estabilidad_aterrizaje = AterrizajeService.analizar_estabilidad(frames, aterr, fps)
        resultado.amortiguacion = AterrizajeService.analizar_amortiguacion(frames, aterr)
        resultado.asimetria_recepcion_pct = AterrizajeService.analizar_simetria_recepcion(frames, aterr)

        # ── Fase 7 — Análisis cinemático temporal ──
        curvas = CinematicoService.curvas_angulares(frames, desp, aterr)
        resultado.curvas_angulares = curvas

        idx_estab = AterrizajeService.idx_estabilizacion(frames, aterr, fps)
        resultado.fases_salto = CinematicoService.detectar_fases(curvas, desp, aterr, idx_estab)

        resultado.velocidades_articulares = CinematicoService.velocidades_articulares(curvas, fps)
        resultado.resumen_gesto = CinematicoService.resumen_gesto(curvas, resultado.fases_salto, fps)



