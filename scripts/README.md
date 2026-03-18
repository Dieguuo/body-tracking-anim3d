# Scripts

Scripts de arranque rápido para el módulo sensor (Fase 1).

## Backend

| Script | Plataforma | Qué hace |
|--------|------------|----------|
| `run_backend.bat` | Windows | Activa el venv y arranca `modules/sensor/backend/app.py` |
| `run_backend.sh` | Linux/macOS | Ídem para shell |

API disponible en `http://localhost:5000/distancia`.

## Frontend

| Script | Plataforma | Qué hace |
|--------|------------|----------|
| `run_frontend.bat` | Windows | Sirve `modules/sensor/frontend/` con `python -m http.server 8080` |
| `run_frontend.sh` | Linux/macOS | Ídem para shell |

Interfaz disponible en `http://localhost:8080`.

## Orden de arranque recomendado

1. `run_backend.bat` → espera hasta que el Arduino esté detectado
2. `run_frontend.bat` → abre `http://localhost:8080` en el navegador
