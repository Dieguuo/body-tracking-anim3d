# Módulo 1 — Sensor de Distancia HC-SR04

Parte del proyecto **proyecto-medicion**. Este módulo es autónomo: puede arrancarse, probarse y demostrarse sin depender del resto del proyecto.

## Estructura

```
sensor/
├── arduino/
│   └── sensor_distancia/
│       ├── sensor_distancia.ino   ← Sketch Arduino
│       └── README.md
├── backend/                       ← Python MVC + Flask API
│   ├── app.py                     ← Entry point web
│   ├── main.py                    ← Entry point consola
│   ├── config.py
│   ├── controllers/
│   ├── models/
│   ├── views/
│   ├── services/                  # Reservado
│   └── utils/                     # Reservado
└── frontend/                      ← Interfaz web del módulo
    ├── index.html
    ├── js/app.js
    └── css/styles.css
```

## Cómo ejecutar

```powershell
# Desde la raíz del proyecto (activar venv primero)

# 1. Backend
scripts\run_backend.bat          # o: cd modules\sensor\backend && python app.py

# 2. Frontend
scripts\run_frontend.bat         # o: cd modules\sensor\frontend && python -m http.server 8080
```

Backend en `http://localhost:5000/distancia`
Frontend en `http://localhost:8080`

```json
{ "valor": 23.45, "unidad": "cm", "raw": "Distancia: 23.45 cm", "timestamp": "2026-03-18T10:30:00+00:00" }
```

## Arquitectura interna

```
Arduino (HC-SR04)
      │  Serial USB · 9600 baudios
      ▼
SensorSerial          (Model)       — lee y parsea líneas del puerto serie
      │
DistanciaController   (Controller)  — hilo daemon + estado thread-safe
      │
Flask app.py          (API)         — GET /distancia → JSON
      │
frontend/app.js       (Frontend)    — fetch cada 1 s → actualiza DOM
```

## Estado — Fase 1

- [x] Sketch Arduino funcional
- [x] Backend MVC funcional
- [x] API REST expuesta (`GET /distancia` con `valor`, `unidad`, `raw`, `timestamp`)
- [x] Frontend conectado al endpoint
