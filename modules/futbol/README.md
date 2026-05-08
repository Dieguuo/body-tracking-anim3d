# Módulo futbol

Analiza la técnica de golpeo de balón usando visión artificial (MediaPipe Pose).  
Comparte base de datos y contrato de usuarios con el módulo salto.

---

## Arquitectura

```
modules/futbol/backend/
├── app.py                  # Flask entry point (puerto 5002, HTTPS)
├── config.py               # Variables de entorno, pesos del score compuesto
├── controllers/
│   ├── futbol_controller.py        # Pipeline principal de análisis
│   ├── futbol_db_controller.py     # Blueprint CRUD de golpeos
│   ├── usuario_controller.py       # Blueprint /api/usuarios (canónico)
│   └── usuarios_futbol_controller.py  # Blueprint legacy /api/usuarios_futbol (deprecado)
├── models/
│   ├── futbol_model.py     # Acceso a gestos_futbol + vistas v_golpeos
│   ├── usuarios_futbol_model.py  # Acceso a la tabla usuarios
│   └── video_processor.py  # Extracción de poses por frame con MediaPipe
└── services/
    ├── calculo_service.py          # Ángulos puntuales, estabilidad, score compuesto
    ├── impacto_service.py          # Detección de frame de impacto y velocidad del pie
    ├── cinematico_service.py       # Curvas angulares, fases del gesto, velocidades articulares
    ├── apoyo_service.py            # Estabilidad temporal del tronco y pierna de apoyo
    ├── interpretacion_service.py   # Alertas, clasificación y observaciones
    ├── analitica_service.py        # Fatiga, tendencia, comparativa, alertas avanzadas
    └── video_anotado_service.py    # Genera MP4 con overlay de esqueleto y ángulos
```

---

## Base de datos

BD unificada `bd_anim3d` (compartida con salto). Esquema table-per-class:

| Tabla            | Uso                                                |
|------------------|----------------------------------------------------|
| `usuarios`       | Jugador (alias, nombre_completo, altura_m, peso_kg)|
| `sesiones`       | Agrupación temporal de gestos por módulo           |
| `gestos`         | Registro base de cada gesto (módulo, fecha, FK usuario) |
| `gestos_futbol`  | Métricas específicas del golpeo (1:1 con `gestos`) |
| `gestos_curvas`  | Series angulares por frame (JSON)                  |
| `gestos_alertas` | Alertas biomecánicas normalizadas (1:N)            |
| `gestos_videos`  | Vídeo binario o ruta asociado al gesto             |
| `v_golpeos`      | Vista JOIN `gestos` + `gestos_futbol` (alias legacy) |

Ver esquema completo en [`scripts/README_BBDD_UNIFICADA.md`](../../scripts/README_BBDD_UNIFICADA.md).

---

## Arranque rápido

```powershell
# Desde la raíz del repositorio
$env:CORS_ORIGINS = "https://localhost:8443,https://127.0.0.1:8443"
cd modules\futbol\backend
python app.py          # Arranca en https://localhost:5002
```

Variables de entorno relevantes (`.env` o shell):

| Variable               | Por defecto | Descripción                          |
|------------------------|-------------|--------------------------------------|
| `FLASK_PORT`           | `5002`      | Puerto del backend                   |
| `FUTBOL_MODEL_PATH`    | —           | Ruta al modelo MediaPipe (opcional)  |
| `CORS_ORIGINS`         | localhost   | Orígenes permitidos por CORS         |
| `SCORE_PESO_VELOCIDAD` | `0.40`      | Peso velocidad en score compuesto    |
| `SCORE_PESO_ESTABILIDAD`| `0.25`     | Peso estabilidad en score compuesto  |
| `SCORE_PESO_CONFIANZA` | `0.20`      | Peso confianza en score compuesto    |
| `SCORE_PESO_CADERA`    | `0.15`      | Peso ángulo cadera en score compuesto|

---

## Endpoints

### Análisis

| Método | Ruta                          | Descripción                                 |
|--------|-------------------------------|---------------------------------------------|
| POST   | `/api/futbol/analizar`        | Analiza un vídeo de golpeo (form-data)      |
| POST   | `/api/futbol/video-anotado`   | Genera MP4 con overlay biomecánico          |
| GET    | `/api/golpeos/<id>/curvas`    | Series angulares del golpeo                 |

Parámetros de `/api/futbol/analizar`:

| Campo              | Tipo      | Descripción                          |
|--------------------|-----------|--------------------------------------|
| `video`            | file      | Vídeo (mp4/webm/mov/avi) — **obligatorio** |
| `id_usuario`       | int       | Si se indica, guarda el golpeo en BD |
| `guardar_bd`       | bool      | Forzar guardado aunque no haya usuario |
| `guardar_video_bd` | bool      | Persistir el vídeo en `gestos_videos` |
| `metodo_origen`    | string    | `ia_vivo` o `video_galeria`          |
| `incluir_landmarks`| bool      | Incluir landmarks por frame en respuesta |

Campos relevantes de la respuesta:

```json
{
  "angulo_cadera_deg": 142.3,
  "angulo_rodilla_deg": 98.7,
  "angulo_tobillo_deg": 115.2,
  "estabilidad_tronco": 87.4,
  "velocidad_pie_ms": 9.2,
  "score_compuesto": 74.5,
  "clasificacion": "tecnica_estable",
  "alertas": [],
  "observaciones": [],
  "fases": [],
  "curvas": {},
  "apoyo": { "score": 0.91 },
  "frame_impacto": 38
}
```

### Usuarios (canónico — compartido con salto)

| Método | Ruta                     | Descripción                 |
|--------|--------------------------|-----------------------------|
| GET    | `/api/usuarios`          | Lista paginada de usuarios  |
| POST   | `/api/usuarios`          | Crear usuario               |
| GET    | `/api/usuarios/<id>`     | Obtener usuario             |
| PUT    | `/api/usuarios/<id>`     | Actualizar usuario          |
| DELETE | `/api/usuarios/<id>`     | Eliminar usuario            |

### Analítica avanzada

| Método | Ruta                                       | Descripción                        |
|--------|--------------------------------------------|------------------------------------|
| GET    | `/api/usuarios/<id>/fatiga`                | Fatiga intra-sesión                |
| GET    | `/api/usuarios/<id>/tendencia`             | Tendencia histórica de métrica     |
| GET    | `/api/usuarios/<id>/comparativa`           | Comparativa entre sesiones         |
| GET    | `/api/usuarios/<id>/alertas_tendencia`     | Alertas de tendencia longitudinal  |
| GET    | `/api/usuarios/<id>/analitica_avanzada`    | Bloque completo: correlaciones, ranking, predicción |

### Rutas legacy (deprecadas — retirada 2026-08-01)

#### Analítica

| Ruta legacy                                | Sustituta canónica                        |
|--------------------------------------------|-------------------------------------------|
| `/api/usuarios_futbol/<id>/fatiga`         | `/api/usuarios/<id>/fatiga`               |
| `/api/usuarios_futbol/<id>/tendencia`      | `/api/usuarios/<id>/tendencia`            |
| `/api/usuarios_futbol/<id>/comparativa`    | `/api/usuarios/<id>/comparativa`          |

#### CRUD de usuarios

| Método | Ruta legacy                              | Sustituta canónica           |
|--------|------------------------------------------|------------------------------|
| GET    | `/api/usuarios_futbol`                   | `/api/usuarios`              |
| GET    | `/api/usuarios_futbol/<id>`              | `/api/usuarios/<id>`         |
| POST   | `/api/usuarios_futbol`                   | `/api/usuarios`              |
| PUT    | `/api/usuarios_futbol/<id>`              | `/api/usuarios/<id>`         |
| DELETE | `/api/usuarios_futbol/<id>`              | `/api/usuarios/<id>`         |

El CRUD legacy acepta paginación canónica (`?paginado=1&limit=&offset=`) y
devuelve **ambos** campos por compatibilidad: `usuarios` (legacy) y
`items` + `total` + `has_more` (canónico). Validaciones idénticas al canónico:
`altura_m` (0.50–2.50), `peso_kg` (20–300), 409 en alias duplicado.

Todas las rutas legacy devuelven cabeceras:

```
Deprecation: version="2026-08-01"
Sunset: Sat, 01 Aug 2026 00:00:00 GMT
Link: </api/usuarios>; rel="successor-version"
```

---

## Versionado de features

Los gestos persisten la versión del esquema de métricas con que fueron
extraídos en `gestos_futbol.features_version`. Se controla con la constante
`config.FEATURES_VERSION` (env `FUTBOL_FEATURES_VERSION`, por defecto `v1`).

Incrementar la versión cuando:
- Cambien fórmulas de score / umbrales por defecto.
- Se añadan o quiten métricas en `SCORE_PESOS_GOLPEO` o `SCORE_RANGOS_GOLPEO`.
- Cambie la lógica de clasificación.

Para BBDD pre-existentes: aplicar `scripts/migrate_features_version.sql`
(idempotente). Para BBDD nuevas: el `init_db_unificada.sql` ya incluye la
columna y la vista `v_golpeos` actualizadas.

---

## Frontend

| Archivo                                   | Propósito                              |
|-------------------------------------------|----------------------------------------|
| `integration/web/futbol.html`             | Cámara, análisis, panel analítico      |
| `integration/web/futbol_videos.html`      | Biblioteca de vídeos y comparativas    |
| `integration/web/js/api_futbol.js`        | Llamadas al backend + render analítica |
| `integration/web/js/futbol.js`            | Flujo de grabación, resultados, comparativa 4 tiros |
| `integration/web/js/futbol_videos.js`     | Lógica de la biblioteca de vídeos      |
| `integration/web/js/usuario_activo.js`    | **Punto único de verdad** del usuario activo (`window.UsuarioActivo`). Compartido con el módulo salto. |

### Flujo de captura

- El selector `Modo` permite elegir entre `Tiro individual` y `Tiros comparativa (4 tiros)`.
- En modo comparativa, el frontend acumula los últimos 4 tiros de la sesión y pinta una tabla de comparación con score, velocidad, estabilidad y ángulos.
- En modo individual, la tabla de comparativa se oculta y el resultado se trata como un tiro aislado.
- La biblioteca de vídeos separa automáticamente `Tiros individuales` y `Comparativas de 4 tiros`.

---

## Posición de cámara requerida

> El sistema trabaja en **coordenadas 2D (x, y)**. Todos los ángulos se calculan en el plano de imagen. Una posición de cámara incorrecta produce mediciones inválidas.

### Modo horizontal (paisaje) — **recomendado para golpeo**

```
         ←————— 4–6 metros —————→
[CÁMARA] ═════════════════════ [JUGADOR] →→→ (dirección del tiro)
         altura ideal: a nivel de cadera-rodilla (~0.8–1.0 m del suelo)
```

| Requisito | Valor |
|-----------|-------|
| **Plano** | Sagital: cámara perpendicular a la dirección del golpeo (90°) |
| **Distancia** | 4–6 metros para ver el cuerpo completo en 1280×720 |
| **Altura** | Nivel cadera–rodilla del jugador (~0.8–1.0 m del suelo) |
| **Encuadre** | Cabeza **y** ambos pies visibles — si se cortan los pies, `angulo_tobillo` falla |
| **Eje de movimiento** | El jugador avanza de izquierda a derecha (o derecha a izquierda) en la imagen |
| **NO usar** | Vista frontal o diagonal — las piernas se superponen en proyección 2D y los ángulos se distorsionan |

### Modo vertical (retrato) — uso limitado

Sólo recomendado cuando el movimiento principal es vertical (remates de cabeza en salto). Para golpeos de balón a ras de suelo, el campo visual es demasiado estrecho y la velocidad horizontal del pie se captura mal.

### Lo que el sistema NO puede medir con una sola cámara lateral

- Rotación interna/externa de rodilla (requiere vista frontal)
- Profundidad del paso previo al golpeo (requiere 3D)
- Aducción/aducción de cadera (requiere vista frontal)

---

## Score compuesto (0–100)

Calculado en `services/calculo_service.py` usando pesos de `config.SCORE_PESOS_GOLPEO`:

```
score = Σ peso_i × normalizar(metrica_i, rango_min_i, rango_max_i) × 100
```

Métricas y pesos por defecto:

| Métrica               | Peso | Rango de normalización | Unidad |
|-----------------------|------|------------------------|--------|
| `velocidad_pie_ms`    | 0.40 | 2 – 18                 | m/s    |
| `estabilidad_tronco`  | 0.25 | 30 – 100              | score 0–100 |
| `confianza`           | 0.20 | 0.5 – 1.0             | ratio  |
| `angulo_cadera_deg`   | 0.15 | 90° – 160°            | grados |

---

## Notas técnicas

- El modelo MediaPipe reutiliza `pose_landmarker_lite.task` del módulo salto.
- El backend de salto corre en puerto 5001, el sensor en 5000.
- Ver contrato completo de API en [`scripts/API_CONTRATOS.md`](../../scripts/API_CONTRATOS.md).

### Pipeline de análisis (orden de ejecución en `futbol_controller.py`)

1. `VideoProcessor.procesar()` → extrae `FramePose` por cada frame del vídeo.
2. `detectar_pierna_golpeo_apoyo()` → detecta pierna activa e `idx_impacto` por pico de velocidad 2D.
3. `CalculoService.calcular_metricas(frames, info, idx_impacto)` → ángulos articulares **en el frame de impacto** (no en el último frame).
4. `calcular_velocidad_pie()` → convierte px/s a m/s usando altura estimada del jugador.
5. `calcular_curvas_angulares()` → series angulares frame a frame.
6. `detectar_fases()` → aproximación / armado / impacto / follow-through.
7. `estabilidad_tronco_temporal()` + `estabilidad_pierna_apoyo()` + `asimetria_postura()`.
8. `generar_alertas_golpeo()` → alertas accionables.
9. `clasificar_golpeo()` + `generar_observaciones()` + `calcular_score_compuesto()`.

> **Importante:** `detectar_pierna_golpeo_apoyo` se llama **antes** de `calcular_metricas` para que los ángulos se midan en el frame de impacto real, no en el follow-through.
