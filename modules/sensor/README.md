# Módulo 1 — Sensor de Distancia HC-SR04

Parte del proyecto **body-traking-anim3d**. Este módulo es autónomo: puede arrancarse, probarse y demostrarse sin depender del resto del proyecto.

## Estructura

```
sensor/
├── arduino/
│   └── sensor_distancia/
│       ├── sensor_distancia.ino   ← Sketch Arduino
│       └── README.md
└── backend/                       ← Python MVC + Flask API
    ├── app.py                     ← Entry point web
    ├── main.py                    ← Entry point consola
    ├── config.py
    ├── controllers/
    ├── models/
    └── views/
```

> **Nota:** este módulo no tiene frontend propio. La interfaz web está unificada en `integration/web/` (compartida con el módulo de salto).

## Cómo ejecutar

```powershell
# Desde la raíz del proyecto (activar venv primero)

# Backend del sensor
cd modules\sensor\backend
python app.py
```

Backend en `http://localhost:5000/distancia`  
Frontend en `https://localhost:8443` (HTTPS) o `http://localhost:8080` (HTTP) — servido desde `integration/web/`

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
integration/web/      (Frontend)    — fetch cada 1 s → actualiza DOM
```

## Estado — Fase 1

- [x] Sketch Arduino funcional
- [x] Backend MVC funcional
- [x] API REST expuesta (`GET /distancia` con `valor`, `unidad`, `raw`, `timestamp`)
- [x] Frontend conectado al endpoint
