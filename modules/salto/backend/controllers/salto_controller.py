"""
CONTROLADOR — Orquesta el procesamiento de vídeo y el cálculo del salto.

Recibe la ruta del vídeo y los parámetros, coordina modelo y servicio,
y devuelve el resultado final.
"""

from models.video_processor import VideoProcessor
from services.calculo_service import CalculoService, ResultadoSalto


class SaltoController:
    """
    CONTROLADOR — Flujo principal:
      1. Validar archivo de vídeo
      2. Procesar con MediaPipe (Modelo)
      3. Calcular distancia (Servicio)
      4. Devolver resultado
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
            ResultadoSalto con la distancia calculada.
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
            return self.calculo.calcular_horizontal(frames, info.fps, altura_real_m)

        return self.calculo.calcular_vertical(frames, info.fps, altura_real_m, peso_kg)


