"""
SERVICIO — Interpretación heurística del golpeo.

Convierte métricas en alertas accionables, clasifica el golpeo en categorías
y genera observaciones en lenguaje natural.
"""

from __future__ import annotations


def generar_alertas_golpeo(metricas: dict) -> list[dict]:
    alertas: list[dict] = []

    angulo_rodilla = metricas.get("angulo_rodilla_deg")
    angulo_cadera = metricas.get("angulo_cadera_deg")
    estab_tronco = metricas.get("estabilidad_tronco")
    apoyo_score = (metricas.get("apoyo") or {}).get("score")
    asimetria = metricas.get("asimetria_postura_pct")
    vel_pie_ms = metricas.get("velocidad_pie_ms")
    confianza = metricas.get("confianza")

    if angulo_rodilla is not None and angulo_rodilla > 165:
        alertas.append({
            "codigo": "rodilla_extendida",
            "mensaje": "Rodilla excesivamente extendida en el impacto: pierde transferencia.",
            "severidad": "media",
        })

    if angulo_cadera is not None and angulo_cadera < 130:
        alertas.append({
            "codigo": "armado_corto",
            "mensaje": "Armado corto: poca flexión de cadera antes del impacto.",
            "severidad": "media",
        })

    if estab_tronco is not None and estab_tronco < 60:
        alertas.append({
            "codigo": "tronco_inestable",
            "mensaje": "Tronco inestable durante el gesto.",
            "severidad": "alta",
        })

    if apoyo_score is not None and apoyo_score < 50:
        alertas.append({
            "codigo": "apoyo_inestable",
            "mensaje": "Pierna de apoyo con variación angular elevada en el impacto.",
            "severidad": "alta",
        })

    if asimetria is not None and asimetria > 15:
        alertas.append({
            "codigo": "postura_asimetrica",
            "mensaje": "Postura asimétrica entre lado izquierdo y derecho (>15%).",
            "severidad": "media",
        })

    if vel_pie_ms is not None and vel_pie_ms < 8.0:
        alertas.append({
            "codigo": "velocidad_pie_baja",
            "mensaje": "Velocidad del pie en el impacto por debajo del rango competitivo (<8 m/s).",
            "severidad": "media",
        })

    if confianza is not None and confianza < 0.6:
        alertas.append({
            "codigo": "deteccion_baja",
            "mensaje": "Confianza baja en la detección de pose: revisa encuadre y luz.",
            "severidad": "baja",
        })

    return alertas


def clasificar_golpeo(metricas: dict, alertas: list[dict], fatiga_significativa: bool = False) -> str:
    """
    Categorías:
      - fatigado
      - asimetrico
      - inestable
      - tecnico_lento (técnica correcta pero baja velocidad)
      - potente_estable (sin alertas y vel >= 12 m/s)
      - equilibrado (caso por defecto)
    """
    if fatiga_significativa:
        return "fatigado"

    codigos = {a.get("codigo") for a in alertas}
    if "postura_asimetrica" in codigos:
        return "asimetrico"
    if "tronco_inestable" in codigos or "apoyo_inestable" in codigos:
        return "inestable"

    vel = metricas.get("velocidad_pie_ms")
    if not codigos and vel is not None and vel >= 12.0:
        return "potente_estable"
    if not codigos and vel is not None and vel < 9.0:
        return "tecnico_lento"

    return "equilibrado"


def generar_observaciones(metricas: dict, alertas: list[dict]) -> list[str]:
    observaciones: list[str] = []

    vel = metricas.get("velocidad_pie_ms")
    if vel is not None:
        if vel >= 14:
            observaciones.append("Velocidad del pie muy alta en el impacto.")
        elif vel < 8:
            observaciones.append("Velocidad del pie baja: trabajar potencia explosiva.")

    pierna_g = metricas.get("pierna_golpeo")
    if pierna_g and pierna_g != "desconocida":
        observaciones.append(f"Golpeo ejecutado con la pierna {pierna_g}.")

    if not alertas:
        observaciones.append("Técnica estable, sin desviaciones relevantes en este intento.")

    return observaciones
