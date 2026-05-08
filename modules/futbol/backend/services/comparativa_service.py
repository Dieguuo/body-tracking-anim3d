"""
Espacio reservado para comparativas futuras.
"""


# Compara las metricas del usuario contra una referencia fija.
def comparar_con_referencia(metricas_usuario: dict) -> dict:
    referencia = {
        "angulo_cadera_deg": 85.0,
        "angulo_rodilla_deg": 110.0,
        "angulo_tobillo_deg": 75.0,
        "estabilidad_tronco": 95.0,
    }

    comparativa = {}
    for clave, valor in referencia.items():
        usuario = metricas_usuario.get(clave)
        if usuario is None:
            continue
        comparativa[clave] = {
            "usuario": usuario,
            "referencia": valor,
            "diferencia": usuario - valor,
        }

    return comparativa
