"""
SERVICIO — Trigonometría pura para ángulos articulares y biomecánica.

Este modulo no depende de video, red ni base de datos. Solo opera con
puntos/vectores 2D y devuelve angulos en grados o potencia en watts.
"""

from math import atan2, degrees


class BiomecanicaService:
    """Funciones puras para calcular angulos biomecanicos en 2D y potencia."""

    @staticmethod
    def angulo_entre_vectores_deg(v1: tuple[float, float], v2: tuple[float, float]) -> float | None:
        """
        Devuelve el angulo (0..180) entre dos vectores usando arctan2.

        Formula robusta:
            angulo = atan2(|cross|, dot)
        """
        x1, y1 = v1
        x2, y2 = v2

        dot = (x1 * x2) + (y1 * y2)
        cross = (x1 * y2) - (y1 * x2)

        if (x1 == 0 and y1 == 0) or (x2 == 0 and y2 == 0):
            return None

        angulo = degrees(atan2(abs(cross), dot))
        return angulo

    @staticmethod
    def angulo_articulacion_deg(
        p_origen_v1: tuple[float, float],
        p_articulacion: tuple[float, float],
        p_origen_v2: tuple[float, float],
    ) -> float | None:
        """
        Angulo en la articulacion entre dos segmentos.

        Se construyen los vectores:
        - v1: p_origen_v1 -> p_articulacion
        - v2: p_origen_v2 -> p_articulacion
        """
        ax, ay = p_articulacion
        v1 = (ax - p_origen_v1[0], ay - p_origen_v1[1])
        v2 = (ax - p_origen_v2[0], ay - p_origen_v2[1])
        return BiomecanicaService.angulo_entre_vectores_deg(v1, v2)

    @staticmethod
    def potencia_sayers(altura_cm: float, peso_kg: float) -> float:
        """
        Potencia pico de miembros inferiores (ecuación de Sayers, 1999).

            P (W) = 60.7 × altura_cm + 45.3 × peso_kg − 2055

        Validada contra plataformas de fuerza (R² > 0.88).
        """
        return 60.7 * altura_cm + 45.3 * peso_kg - 2055
