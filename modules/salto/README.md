# Módulo 2 — Cálculo de Salto (Vertical y Horizontal)

Parte del proyecto **proyecto-medicion**. Este módulo es autónomo: puede arrancarse, probarse y demostrarse sin depender del resto del proyecto.

Recibe un vídeo grabado desde un móvil, lo analiza fotograma a fotograma con **MediaPipe Pose** y calcula la distancia del salto (vertical u horizontal).

## Estructura

```
salto/
├── backend/                         ← Python MVC + Flask API + MySQL
│   ├── app.py                       ← Entry point web (cálculo + CRUD usuarios/saltos)
│   ├── config.py                    ← Constantes centralizadas + DB_CONFIG
│   ├── pose_landmarker_lite.task    ← Modelo MediaPipe descargado
│   ├── controllers/
│   │   ├── salto_controller.py      ← Orquesta procesamiento + cálculo + análisis avanzado
│   │   ├── usuario_controller.py    ← CRUD usuarios + progreso + comparativa
│   │   └── salto_db_controller.py   ← CRUD saltos en BD
│   ├── models/
│   │   ├── db.py                    ← Pool de conexiones MySQL
│   │   ├── video_processor.py       ← MediaPipe PoseLandmarker — extrae pies por frame
│   │   ├── usuario_model.py         ← Queries tabla usuarios
│   │   └── salto_model.py           ← Queries tabla saltos
│   ├── services/
│   │   ├── calculo_service.py       ← Fórmulas: vertical (híbrido cinemática + calibración) + horizontal (calibración)
│   │   ├── biomecanica_service.py   ← Trigonometría pura para ángulos articulares
│   │   ├── aterrizaje_service.py    ← Biomecánica del aterrizaje: estabilidad, amortiguación, simetría recepción
│   │   ├── cinematico_service.py    ← Análisis cinemático temporal: curvas angulares, fases, velocidades
│   │   ├── video_anotado_service.py ← Generación de vídeo con overlay (landmarks + ángulos + eventos)
│   │   ├── analitica_service.py     ← Fatiga intra-sesión + tendencia histórica
│   │   └── comparativa_service.py   ← Lógica de negocio: progreso (mín. 4+4) y estadísticas
│   └── uploads/                     ← Vídeos temporales (auto-limpieza)
├── mobile/                          # Reservado — cliente móvil (Fase 2)
└── README.md
```

## Cómo ejecutar

```powershell
# Desde la raíz del proyecto (activar venv primero)

# 1. Backend
cd modules\salto\backend
python app.py
```

Backend en `http://localhost:5001`

## Endpoints

### Cálculo de salto

```
POST /api/salto/calcular
Content-Type: multipart/form-data
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `video` | archivo | Siempre | Vídeo .mp4 / .webm / .avi / .mov |
| `tipo_salto` | string | Siempre | `"vertical"` o `"horizontal"` |
| `altura_real_m` | float | Siempre | Altura real del usuario en metros (ej. `1.75`). Necesaria para calibrar la conversión píxel → metro. |
| `id_usuario` | int | Opcional | Si se envía, el resultado se guarda automáticamente en BD |
| `metodo_origen` | string | Opcional | `"ia_vivo"`, `"video_galeria"` o `"sensor_arduino"` (default: `video_galeria`) |
| `guardar_video_bd` | bool | Opcional | Si es `true` y se guarda salto, persiste el vídeo en BD |

**Respuesta JSON:**

```json
{
  "tipo_salto": "vertical",
  "distancia": 34.12,
  "unidad": "cm",
  "confianza": 0.98,
  "frame_despegue": 42,
  "frame_aterrizaje": 58,
  "tiempo_vuelo_s": 0.5333,
  "angulo_rodilla_deg": 162.3,
  "angulo_cadera_deg": 171.5,
  "potencia_w": 3182.5,
  "asimetria_pct": 8.3,
  "metodo": "hibrido",
  "dist_por_pixeles": 36.45,
  "dist_por_cinematica": 30.67,
  "estabilidad_aterrizaje": {
    "oscilacion_px": 3.45,
    "tiempo_estabilizacion_s": 0.267,
    "estable": true
  },
  "amortiguacion": {
    "angulo_rodilla_aterrizaje_deg": 155.2,
    "flexion_maxima_deg": 118.7,
    "rango_amortiguacion_deg": 36.5,
    "alerta_rigidez": false
  },
  "asimetria_recepcion_pct": 6.2,
  "curvas_angulares": {
    "frame_inicio": 27,
    "frame_fin": 73,
    "indices": [27, 28, 29, "..."],
    "timestamps_s": [0.0, 0.033, 0.067, "..."],
    "rodilla_deg": [165.1, 162.4, "..."],
    "cadera_deg": [170.3, 168.9, "..."]
  },
  "fases_salto": [
    { "fase": "preparatoria", "frame_inicio": 27, "frame_fin": 35 },
    { "fase": "impulsion", "frame_inicio": 35, "frame_fin": 42 },
    { "fase": "vuelo", "frame_inicio": 42, "frame_fin": 58 },
    { "fase": "recepcion", "frame_inicio": 58, "frame_fin": 66 }
  ],
  "velocidades_articulares": {
    "vel_rodilla_deg_s": [12.5, 25.3, "..."],
    "vel_cadera_deg_s": [8.1, 15.6, "..."],
    "pico_vel_rodilla": 485.2,
    "pico_vel_cadera": 312.8
  },
  "resumen_gesto": {
    "pico_flexion_rodilla": { "valor_deg": 98.5, "frame_idx": 35 },
    "pico_extension_rodilla": { "valor_deg": 172.3, "frame_idx": 41 },
    "rom_rodilla_deg": 73.8,
    "rom_cadera_deg": 45.2,
    "ratio_excentrico_concentrico": 1.14
  }
}
```

> Los campos `metodo`, `dist_por_pixeles` y `dist_por_cinematica` solo aparecen en salto vertical.
> Los campos de Fases 6-7 (`estabilidad_aterrizaje`, `amortiguacion`, etc.) son `null` si no se detectó un salto válido (despegue + aterrizaje).

### Vídeo anotado con overlay

```
POST /api/salto/video-anotado
Content-Type: multipart/form-data
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `video` | archivo | Siempre | Vídeo .mp4 / .webm / .avi / .mov |
| `tipo_salto` | string | Siempre | `"vertical"` o `"horizontal"` |
| `altura_real_m` | float | Siempre | Altura real del usuario en metros |

**Respuesta:** Descarga directa del vídeo anotado (`.mp4`) con:
- Esqueleto de landmarks dibujado sobre cada frame
- Ángulos de rodilla (izq/der) como texto superpuesto
- Marcadores de eventos: DESPEGUE (amarillo), ATERRIZAJE (naranja), PICO (magenta)
- Trayectoria del centro de masa en los frames post-aterrizaje

## Arquitectura interna

```
Vídeo grabado (.mp4 / .webm)
      │  Upload via POST
      ▼
VideoProcessor          (Modelo)      — MediaPipe PoseLandmarker, extrae landmarks por frame
      │
CalculoService          (Servicio)    — fórmulas de cinemática y calibración
      │
      ├── AterrizajeService             — Fase 6: estabilidad, amortiguación, simetría recepción
      ├── CinematicoService             — Fase 7: curvas angulares, fases, velocidades, resumen
      │
SaltoController         (Controlador) — orquesta modelo + servicios + enriquecimiento
      │
Flask app.py            (API)         — POST /api/salto/calcular → JSON
                                         POST /api/salto/video-anotado → MP4
                                           ↕
                                       MySQL (usuarios + saltos)

VideoAnotadoService     (Servicio)    — Fase 8.3: genera vídeo con overlay OpenCV
```

### CRUD Usuarios

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/usuarios` | Lista todos |
| `POST` | `/api/usuarios` | Crea (JSON: `alias`, `nombre_completo`, `altura_m`, `peso_kg` opcional) |
| `GET` | `/api/usuarios/<id>` | Obtiene por ID |
| `PUT` | `/api/usuarios/<id>` | Actualiza |
| `DELETE` | `/api/usuarios/<id>` | Elimina (CASCADE a saltos) |

### CRUD Saltos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/saltos` | Lista todos |
| `POST` | `/api/saltos` | Registra manualmente (JSON: `id_usuario`, `tipo_salto`, `distancia_cm`, `metodo_origen`) |
| `GET` | `/api/saltos/<id>` | Obtiene por ID |
| `PUT` | `/api/saltos/<id>` | Actualiza (JSON: `tipo_salto`, `distancia_cm`, `metodo_origen`; opcionales: `tiempo_vuelo_s`, `confianza_ia`) |
| `DELETE` | `/api/saltos/<id>` | Elimina |
| `GET` | `/api/usuarios/<id>/saltos` | Saltos de un usuario |

### Progreso y Comparativa

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/usuarios/<id>/progreso` | Cuántos saltos tiene vs mínimo (4+4) |
| `GET` | `/api/usuarios/<id>/comparativa` | Estadísticas por tipo (mejor, peor, media, último, evolución). 403 si no cumple mínimo |

### Analítica avanzada

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/usuarios/<id>/fatiga?tipo=vertical` | Fatiga intra-sesión: pendiente, nº saltos, caída %, alerta |
| `GET` | `/api/usuarios/<id>/tendencia?tipo=vertical` | Tendencia histórica: pendiente cm/semana, R², predicción 4 semanas, estado |

## Algoritmos

### Salto vertical — Método híbrido (cinemática + píxeles calibrados)

Se detecta el despegue y aterrizaje mediante la **derivada de la coordenada Y del talón** (cambio brusco = transición suelo/aire). La señal se suaviza previamente con **media móvil de 3 frames** y se aplica un **margen ciego de 5 frames** tras el despegue para evitar falsos aterrizajes.

Se combinan dos métodos independientes:

**1. Cinemática (tiempo de vuelo):**

```
h = (1/8) × g × t²
```

Donde `g = 9.81 m/s²` y `t` es el tiempo en el aire en segundos.

**2. Píxeles calibrados (desplazamiento vertical):**

Se calibra la escala píxel/metro usando la altura real del usuario y se mide el desplazamiento vertical máximo de los pies:

```
S = Hr / Hp           (metros por píxel)
h = (Y_suelo - Y_pico) × S
```

Si ambos métodos están disponibles, el resultado final es un **promedio ponderado** (60 % píxeles, 40 % cinemática). Si solo uno funciona, se usa ese.

### Salto horizontal — Proyección geométrica

Se calibra la escala píxel/metro usando la altura real del usuario:

```
S = Hr / Hp          (metros por píxel)
D_real = Dp × S      (distancia real en metros)
```

Donde `Hr` = altura real (m), `Hp` = altura en píxeles, `Dp` = desplazamiento horizontal en píxeles.

## Análisis biomecánico del aterrizaje (Fase 6)

Tras detectar el frame de aterrizaje, se analizan los N frames posteriores (ventana de 30 frames):

### Estabilidad de aterrizaje

- Se calcula la posición Y del centro de masa (promedio de caderas, landmarks 23/24) en cada frame post-aterrizaje.
- La **oscilación** es la desviación estándar de Y en la ventana.
- El **tiempo de estabilización** es el primer frame donde la derivada de Y < 0.5 px/frame durante al menos 2 frames consecutivos.

### Amortiguación

- Se calcula el ángulo de rodilla en el frame de aterrizaje.
- Se busca la **flexión máxima** de rodilla en los frames post-aterrizaje.
- El **rango de amortiguación** = ángulo al contacto − flexión máxima.
- Alerta de **rigidez** si el rango < 20° (riesgo de lesión).

### Simetría en la recepción

- Se compara el desplazamiento Y del talón izquierdo vs derecho en el frame de aterrizaje (misma fórmula ASI del despegue).
- Alerta si asimetría > 15%.

## Análisis cinemático temporal (Fase 7)

Pasa de métricas puntuales (un ángulo en un frame) a curvas temporales del gesto completo.

### Curvas angulares

- Se calcula el ángulo de rodilla y cadera en cada frame, desde 15 frames antes del despegue hasta 15 frames después del aterrizaje.
- Suavizado con media móvil de 3 frames para filtrar ruido de MediaPipe.

### Detección automática de fases

| Fase | Inicio | Fin |
|------|--------|-----|
| **Preparatoria** (excéntrica) | Inicio del rango | Mínimo flexión de rodilla (antes del despegue) |
| **Impulsión** (concéntrica) | Mínimo flexión | Frame de despegue |
| **Vuelo** | Frame de despegue | Frame de aterrizaje |
| **Recepción** | Frame de aterrizaje | Estabilización (o fin de la ventana) |

### Velocidades articulares

```
ω = Δθ × fps    (°/s)
```

Se detecta el **pico de velocidad de extensión** de rodilla y cadera (momento de máxima potencia articular).

### Métricas resumen del gesto

- Pico de flexión y extensión de rodilla (valor y frame)
- ROM (rango de movimiento) de rodilla y cadera
- Ratio tiempo excéntrico / tiempo concéntrico

## Vídeo anotado con overlay (Fase 8)

Se genera un vídeo MP4 con OpenCV que superpone sobre el original:

- **Esqueleto** dibujado con los landmarks de MediaPipe (líneas verdes, puntos rojos)
- **Ángulos de rodilla** izquierda y derecha como texto (RI / RD)
- **Marcadores de eventos**: banners semitransparentes en los frames de DESPEGUE, ATERRIZAJE y PICO
- **Trayectoria del centro de masa** en los frames post-aterrizaje

## Filtrado de reflejos

MediaPipe se configura con `num_poses=2` para detectar hasta dos personas. Si hay una segunda detección (reflejo en una superficie cercana), se selecciona la **silueta más grande** (mayor distancia cabeza-pies en píxeles), descartando automáticamente el reflejo.

## Estado

- [x] Backend MVC funcional
- [x] Procesamiento de vídeo con MediaPipe PoseLandmarker (Tasks API)
- [x] Algoritmo de salto vertical (método híbrido cinemática + píxeles)
- [x] Algoritmo de salto horizontal (calibración geométrica)
- [x] API REST cálculo (`POST /api/salto/calcular`)
- [x] Base de datos MySQL — tablas `usuarios` y `saltos` (1:N)
- [x] CRUD REST para usuarios y saltos
- [x] Guardado automático en BD desde el cálculo (con `id_usuario`)
- [x] Regla de negocio: mínimo 4+4 saltos para comparativa
- [x] Endpoint de progreso y comparativa (estadísticas al vuelo)
- [x] Frontend web integrado en `integration/web/salto.html`
- [x] Ángulos articulares (rodilla + cadera) en el frame de despegue
- [x] Potencia de Sayers (requiere `peso_kg` en perfil de usuario)
- [x] Asimetría bilateral (alerta visual si > 15 %)
- [x] Endpoint de fatiga intra-sesión (`GET /api/usuarios/<id>/fatiga`)
- [x] Endpoint de tendencia histórica (`GET /api/usuarios/<id>/tendencia`)
- [x] Estabilidad de aterrizaje (oscilación CM + tiempo de estabilización)
- [x] Amortiguación de rodilla (flexión máxima + alerta rigidez < 20°)
- [x] Simetría en la recepción (ASI bilateral al aterrizar)
- [x] Curvas angulares completas (rodilla + cadera en todo el gesto)
- [x] Detección automática de fases (preparatoria, impulsión, vuelo, recepción)
- [x] Velocidades articulares (°/s) + pico de velocidad de extensión
- [x] Métricas resumen del gesto (ROM, ratio excéntrico/concéntrico)
- [x] Timeline interactivo con fases coloreadas y marcadores de eventos
- [x] Gráficas de curvas articulares (Chart.js — rodilla y cadera vs tiempo)
- [x] Vídeo anotado con overlay (`POST /api/salto/video-anotado`)
- [ ] Cliente móvil para grabar y enviar vídeo (`mobile/`)
