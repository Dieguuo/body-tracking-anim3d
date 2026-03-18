#!/bin/bash
# Sirve el frontend del módulo sensor con Python como servidor estático
# Accede en: http://localhost:8080

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../modules/sensor/frontend"
python -m http.server 8080
