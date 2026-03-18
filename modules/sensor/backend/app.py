"""
Punto de entrada web del módulo 1 — Sensor de distancia.

Arranca un hilo de fondo que lee el Arduino por serial y expone
la última medición mediante una API REST mínima.

Este archivo es solo API. El frontend corre por separado
(Live Server, servidor estático, etc.) y consume este endpoint.

Uso:
    python app.py

Endpoints:
    GET /distancia  → JSON con la última medición
"""

import sys
from flask import Flask, jsonify
from flask_cors import CORS

from config import DEFAULT_BAUD_RATE, FLASK_PORT
from controllers.distancia_controller import DistanciaController

app = Flask(__name__)
CORS(app)  # Necesario para que el frontend en otro origen pueda hacer fetch
controller = DistanciaController(baud_rate=DEFAULT_BAUD_RATE)


@app.route("/distancia")
def get_distancia():
    """Devuelve la última medición del sensor como JSON."""
    medicion = controller.get_ultima_medicion()
    if medicion is None:
        return jsonify({"error": "Sin datos disponibles aún"}), 503
    return jsonify({
        "valor": medicion.valor,
        "unidad": "cm",
        "raw": medicion.raw,
        "timestamp": medicion.timestamp.isoformat(),
    })


if __name__ == "__main__":
    if not controller.iniciar_en_segundo_plano():
        print("[ERROR] No se pudo iniciar el sensor. Verifica la conexión del Arduino.")
        sys.exit(1)

    print(f"[INFO] API disponible en http://localhost:{FLASK_PORT}/distancia")
    print(f"[INFO] Sirve el frontend con Live Server u otro servidor estático")
    # debug=False es obligatorio: el modo debug relanza el proceso y rompe el hilo de fondo
    app.run(host="0.0.0.0", port=FLASK_PORT, debug=False)
