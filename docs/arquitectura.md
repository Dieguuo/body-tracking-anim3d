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
                                                                                                         ↕
                                                                                              MySQL (usuarios + saltos)
```

## Capas

| Capa | Tecnología | Responsabilidad |
|------|-----------|----------------|
| Hardware | Arduino + HC-SR04 | Medir distancia física |
| Visión artificial | MediaPipe + OpenCV | Analizar vídeo, detectar landmarks anatómicos de los pies |
| Backend | Python + Flask | Leer serial / procesar vídeo, exponer API REST |
| Base de datos | MySQL (InnoDB) | Persistencia de usuarios y saltos (tablas `usuarios` y `saltos`) |
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
├── app.py                       ← Flask server (rutas de salto + CRUD usuarios/saltos)
├── config.py                    ← Constantes (gravedad, landmarks, umbrales, DB_CONFIG)
├── pose_landmarker_lite.task    ← Modelo MediaPipe
├── controllers/
│   ├── salto_controller.py      ← Orquesta procesamiento + cálculo
│   ├── usuario_controller.py    ← CRUD usuarios + endpoints progreso/comparativa/fatiga/tendencia
│   └── salto_db_controller.py   ← CRUD saltos en BD
├── models/
│   ├── db.py                    ← Pool de conexiones MySQL (context manager)
│   ├── video_processor.py       ← MediaPipe PoseLandmarker — extrae pies por frame
│   ├── usuario_model.py         ← Queries tabla usuarios
│   └── salto_model.py           ← Queries tabla saltos
└── services/
    ├── calculo_service.py       ← Fórmulas cinemáticas puras
    ├── biomecanica_service.py   ← Trigonometría pura para ángulos articulares
    ├── analitica_service.py     ← Fatiga intra-sesión + tendencia histórica
    └── comparativa_service.py   ← Lógica de negocio: progreso (mín. 4+4) y comparativa
```

### Base de datos — `bd_anim3d_saltos`

```
usuarios (1) ──────< (N) saltos
   id_usuario PK            id_salto PK
   alias UNIQUE             id_usuario FK → usuarios
   nombre_completo          tipo_salto ENUM('vertical','horizontal')
   altura_m DECIMAL(4,2)    distancia_cm INT
   peso_kg DECIMAL(5,1)     tiempo_vuelo_s DECIMAL(6,3)
   fecha_registro           confianza_ia DECIMAL(4,3)
                            metodo_origen ENUM('ia_vivo','video_galeria','sensor_arduino')
                            fecha_salto
                            video_blob LONGBLOB
                            video_nombre VARCHAR(255)
                            video_mime VARCHAR(100)
```

Relación 1:N con `ON DELETE CASCADE`: al eliminar un usuario se eliminan todos sus saltos.

## Principios aplicados

- **MVC** en el backend Python: modelo (serial/vídeo), vista (consola), controlador (flujo), servicio (cálculos puros).
- **Separación de responsabilidades**: el dispositivo no conoce el backend; el backend no conoce el frontend.
- **Modularidad**: cada funcionalidad vive en `modules/<nombre>/` con arduino/mobile, backend y frontend propios.
- **Autonomía de módulo**: cada módulo puede arrancarse y probarse de forma independiente.
- **Puertos independientes**: cada módulo corre en su propio puerto (sensor → 5000, salto → 5001).
