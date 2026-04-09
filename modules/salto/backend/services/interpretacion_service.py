"""
SERVICIO — Interpretación automática del salto (alertas y observaciones).

Reglas heurísticas para convertir métricas en mensajes accionables.
"""

from __future__ import annotations


def generar_alertas_salto(
    *,
    angulo_rodilla_deg: float | None,
    angulo_cadera_deg: float | None,
    asimetria_pct: float | None,
    confianza: float | None,
) -> list[dict]:
    alertas: list[dict] = []

    # Heurística aproximada de recepción rígida (proxy mientras se completa Fase 6).
    if angulo_rodilla_deg is not None and angulo_rodilla_deg >= 165:
        alertas.append({
            "codigo": "amortiguacion_insuficiente",
            "mensaje": "Amortiguación insuficiente detectada (patrón de recepción rígida).",
            "severidad": "media",
        })

    if angulo_cadera_deg is not None and angulo_cadera_deg < 145:
        alertas.append({
            "codigo": "extension_cadera_limitada",
            "mensaje": "Extensión de cadera limitada en el despegue.",
            "severidad": "media",
        })

    if asimetria_pct is not None and asimetria_pct > 15:
        alertas.append({
            "codigo": "desequilibrio_recepcion",
            "mensaje": "Desequilibrio en la recepción por asimetría superior al 15%.",
            "severidad": "alta",
        })

    if confianza is not None and confianza < 0.6:
        alertas.append({
            "codigo": "recepcion_inestable",
            "mensaje": "Recepción inestable detectada (baja estabilidad del patrón).",
            "severidad": "media",
        })

    return alertas


def generar_observaciones(
    *,
    distancia_cm: float,
    media_historica_cm: float | None,
    angulo_cadera_deg: float | None,
) -> list[str]:
    observaciones: list[str] = []

    if media_historica_cm is not None and media_historica_cm > 0:
        diff_pct = ((distancia_cm - media_historica_cm) / media_historica_cm) * 100.0
        if diff_pct <= -8:
            observaciones.append(
                "El salto actual queda por debajo de la media histórica del usuario."
            )
        elif diff_pct >= 8:
            observaciones.append(
                "El salto actual supera de forma clara la media histórica del usuario."
            )

    if angulo_cadera_deg is not None and angulo_cadera_deg < 145:
        observaciones.append(
            "Se detecta menor extensión de cadera respecto al rango recomendado de impulso."
        )

    if not observaciones:
        observaciones.append("Técnica estable sin desviaciones relevantes en este intento.")

    return observaciones


def clasificar_salto(
    *,
    alertas: list[dict],
    asimetria_pct: float | None,
    fatiga_significativa: bool,
) -> str:
    if fatiga_significativa:
        return "fatigado"

    if asimetria_pct is not None and asimetria_pct > 15:
        return "asimetrico"

    if not alertas:
        return "tecnicamente_correcto"

    return "equilibrado"
