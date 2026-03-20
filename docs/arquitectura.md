# Arquitectura del proyecto

## Flujo general

Cada módulo del proyecto sigue el mismo patrón:

```
Dispositivo físico / fuente de datos
      │  (Serial USB, HTTP, WebSocket...)
      ▼
Python Backend (Flask)
      │  HTTP REST API
      ▼
Frontend Web (HTML + JS)
```

### Módulo sensor (Fase 1)

```
Arduino (HC-SR04) → Serial USB (9600 baud) → Python MVC → Flask API → Frontend web
```

### Módulo salto (Fase 2 — backend activo)

```
Móvil (vídeo grabado) → Upload POST → MediaPipe PoseLandmarker → Cálculo híbrido (cinemática + calibración) → Flask API → JSON
```

## Capas

| Capa | Tecnología | Responsabilidad |
|------|-----------|----------------|
| Hardware | Arduino + HC-SR04 | Medir distancia física |
| Visión artificial | MediaPipe + OpenCV | Analizar vídeo, detectar landmarks anatómicos de los pies |
| Backend | Python + Flask | Leer serial / procesar vídeo, exponer API REST |
| Frontend (integración) | HTML / JS / CSS | Dashboard web unificado (mobile-first) |
| Móvil (Fase 2) | Por definir | Grabar vídeo del salto y enviarlo al backend |

## Organización de carpetas

```
modules/
├── sensor/          ← Módulo 1: arduino/ + backend/
└── salto/           ← Módulo 2: backend/ (MVC + MediaPipe) + mobile/ (futuro)

integration/web/     ← Frontend web unificado (index + salto + sensor)
scripts/             ← run_all.bat para arrancar todo
```

El frontend unificado en `integration/web/` consume ambos backends.
Cada módulo expone solo su API REST; no tiene frontend propio.

### Detalle — backend módulo salto

```
modules/salto/backend/
├── app.py                       ← Flask server (POST /api/salto/calcular)
├── config.py                    ← Constantes (gravedad, landmarks, umbrales)
├── pose_landmarker_lite.task    ← Modelo MediaPipe
├── controllers/
│   └── salto_controller.py      ← Orquesta procesamiento + cálculo
├── models/
│   └── video_processor.py       ← MediaPipe PoseLandmarker — extrae pies por frame
└── services/
    └── calculo_service.py       ← Fórmulas cinemáticas puras
```

## Principios aplicados

- **MVC** en el backend Python: modelo (serial/vídeo), vista (consola), controlador (flujo), servicio (cálculos puros).
- **Separación de responsabilidades**: el dispositivo no conoce el backend; el backend no conoce el frontend.
- **Modularidad**: cada funcionalidad vive en `modules/<nombre>/` con arduino/mobile, backend y frontend propios.
- **Autonomía de módulo**: cada módulo puede arrancarse y probarse de forma independiente.
- **Puertos independientes**: cada módulo corre en su propio puerto (sensor → 5000, salto → 5001).
