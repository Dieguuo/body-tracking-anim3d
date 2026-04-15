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
Móvil (vídeo grabado) → Upload POST → MediaPipe PoseLandmarker → Cálculo híbrido (cinemática + calibración)
                                                                           │
                                                              _detectar_factor_slowmo (corrección automática)
                                                              AterrizajeService (estabilidad + amortiguación)
                                                              CinematicoService (curvas + fases + velocidades)
                                                                           │
                                                                  Flask API → JSON / Vídeo anotado
                                                                           ↕
                                                                MySQL (usuarios + saltos)
```

## Capas

| Capa | Tecnología | Responsabilidad |
|------|-----------|----------------|
| Hardware | Arduino + HC-SR04 | Medir distancia física |
| Visión artificial | MediaPipe + OpenCV | Analizar vídeo, detectar landmarks anatómicos, generar vídeo anotado |
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
  js/api-client.js   ← Utilidad compartida fetchJson() para todas las páginas
scripts/             ← run_all.bat + https_server.py + generate_cert.py
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
│   ├── salto_controller.py      ← Orquesta procesamiento + cálculo + análisis avanzado
│   ├── usuario_controller.py    ← CRUD usuarios + endpoints progreso/comparativa/fatiga/tendencia
│   └── salto_db_controller.py   ← CRUD saltos en BD
├── models/
│   ├── db.py                    ← Pool de conexiones MySQL (context manager)
│   ├── video_processor.py       ← MediaPipe PoseLandmarker — extrae landmarks por frame
│   ├── usuario_model.py         ← Queries tabla usuarios
│   └── salto_model.py           ← Queries tabla saltos
├── utils/
│   ├── serializers.py           ← Serialización JSON compartida (Decimal/datetime → JSON)
│   └── session_utils.py         ← Agrupación de sesiones + conversión de fechas
└── services/
    ├── calculo_service.py       ← Fórmulas cinemáticas puras + detección slow-motion
    ├── biomecanica_service.py   ← Trigonometría pura para ángulos articulares
    ├── aterrizaje_service.py    ← Biomecánica del aterrizaje (estabilidad, amortiguación, simetría)
    ├── cinematico_service.py    ← Análisis cinemático temporal (curvas, fases, velocidades, resumen)
    ├── video_anotado_service.py ← Generación de vídeo con overlay OpenCV
    ├── analitica_service.py     ← Fatiga intra-sesión + tendencia histórica
    ├── comparativa_service.py   ← Lógica de negocio: progreso (mín. 4+4) y comparativa
    ├── interpretacion_service.py ← Alertas biomecánicas, observaciones y clasificación (Fase 9)
    └── video_library_service.py ← Clasificación de vídeos individuales y comparativas (Fase 8.4)
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

## Visualización 3D — flujo de datos

```
Procesamiento de vídeo (MediaPipe PoseLandmarker)
      │
      │  Extrae 33 landmarks (x, y, z, visibility) por frame
      ▼
curvas_json (columna JSON en tabla saltos)
      │
      │  GET /api/salto/<id>/landmarks
      ▼
Frontend (api_salto.js)
      │
      ├──→ Canvas 2D (_dibujarFrame2D)         ← fallback / validación
      │        Joints (círculos) + Bones (líneas)
      │        Overlays: arcos de ángulo, trayectoria CM, color por fase
      │        Ghost skeleton de comparación (35% opacidad, rosa)
      │
      └──→ Three.js 3D (_renderFrame3D)        ← visor principal
               33 esferas + líneas en escena 3D
               OrbitControls (rotar/zoom/pan)
               Color dinámico de joints/bones por fase
               Ghost skeleton 3D (40% opacidad, rosa)
               Conversión coordenadas: MediaPipe → Three.js
      │
      ├──→ Animación (_startAnimation / _stopAnimation)
      │        setInterval con intervalo basado en timestamps reales
      │        Velocidad configurable: ×0.25, ×0.5, ×1
      │        Loop automático al final
      │
      ├──→ Overlays (_actualizarMetricas)
      │        Ángulos rodilla/cadera en tiempo real
      │        Fase actual con nombre y color
      │        Panel de métricas auto-visible
      │
      └──→ Comparación (_mapCompareFrame)
               Carga landmarks de segundo salto (cached)
               Mapeo proporcional de frames
               Ghost skeleton sincronizado
```

### Carga de Three.js

```
CDN primario (esm.sh)  →  fallback (unpkg)  →  fallback (jsdelivr)  →  error → modo 2D
```

Three.js y OrbitControls se cargan una sola vez (patrón singleton con
`threeDepsPromise`). Versión fijada: 0.160.0.

### Tabla de componentes 3D

| Componente | Archivo | Función |
|---|---|---|
| Extracción landmarks | `video_processor.py` | 33 puntos × N frames desde MediaPipe |
| Persistencia | `salto_model.py` | Lectura/escritura en `curvas_json` |
| API endpoint | `app.py` | `GET /api/salto/<id>/landmarks` |
| Rendering 2D | `api_salto.js` | `_dibujarFrame2D()` sobre `<canvas>` |
| Rendering 3D | `api_salto.js` | `_ensureThreeViewer()` + `_renderFrame3D()` |
| Limpieza GPU | `api_salto.js` | `_disposeThreeViewer()` |
| Conexiones | `api_salto.js` | `POSE_CONNECTIONS_33` (mapa de bones) |
| Controles | `api_salto.js` | Toggle 2D/3D + slider + play/pause + speed |
| Animación | `api_salto.js` | `_startAnimation()` + `_stopAnimation()` |
| Fases | `api_salto.js` | `_getFaseParaFrame()` + `_FASE_COLORES` |
| Overlays ángulos | `api_salto.js` | `_anguloEntreLandmarks()` + `_dibujarArcoAngulo2D()` |
| Overlay trayectoria | `api_salto.js` | `_dibujarTrayectoriaCM2D()` |
| Overlay fases | `api_salto.js` | `_getBoneColorForFase()` (2D y 3D) |
| Métricas sync | `api_salto.js` | `_actualizarMetricas()` |
| Comparación | `api_salto.js` | `_poblarSelectorComparacion()` + `_mapCompareFrame()` |
| Ghost 2D | `api_salto.js` | `_dibujarFrameGhost2D()` |
| Ghost 3D | `api_salto.js` | `_renderFrameGhost3D()` + `_removeCompareGhost()` |

### Corrección de slow-motion — flujo

```
_detectar_vuelo()  →  ventana [despegue, aterrizaje] con fps_video (límites generosos: 5s/8s)
      │
_detectar_factor_slowmo(frames, despegue, aterrizaje, fps_video, altura_real_m)
      │
  1. Extrae Y de cadera durante vuelo
  2. Ajusta parábola: y = a·t² + b·t + c  (np.polyfit)
  3. Aceleración aparente: a_aparente = 2|a| × escala × fps²
  4. Factor: sqrt(9.81 / g_aparente)
  5. Si factor ∈ [0.7, 1.3] → no se corrige (velocidad normal)
  6. Si factor > 1.3 → fps_real = fps_video × factor
      │
calcular_vertical() / calcular_horizontal()
      │
  tiempo_vuelo = (aterrizaje − despegue) / fps_real    ← corregido
  velocidades, potencia, ratios → todos con fps_real
      │
ResultadoSalto.factor_slowmo → respuesta JSON
```
