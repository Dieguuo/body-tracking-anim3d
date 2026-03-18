#!/bin/bash
# Lanza la API Flask del módulo sensor (solo datos, sin frontend)
# Endpoint: http://localhost:5000/distancia

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

source .venv/Scripts/activate 2>/dev/null || source .venv/bin/activate 2>/dev/null

cd modules/sensor/backend
python app.py
