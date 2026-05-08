# Historial técnico — 2026-05-05

## Resumen

Sesión centrada en (a) extender el módulo `futbol` con analítica avanzada
equivalente a la del módulo `salto` y (b) integrar el overlay de landmarks en
el cliente que añadió Diego en commits posteriores. Se cierran 10 fases
(F1–F10) más una ronda de revisión y refactor.

## Cambios principales

### Backend (`modules/futbol/backend`)

- **Esquema BD** — `scripts/init_db.sql`: 6 columnas nuevas en `golpes_futbol`
  (`velocidad_pie_ms`, `frame_impacto`, `clasificacion`, `curvas_json`,
  `landmarks_json`, `alertas_json`). Migraciones idempotentes con
  `INFORMATION_SCHEMA.COLUMNS` + `PREPARE/EXECUTE`.
- **Servicios nuevos**:
  - `services/impacto_service.py` — detección de pierna de golpeo y frame de
    impacto por pico de velocidad horizontal del tobillo + cálculo de
    velocidad del pie en m/s.
  - `services/cinematico_service.py` — curvas angulares frame a frame, 4 fases
    del gesto y velocidades articulares (°/s).
  - `services/apoyo_service.py` — estabilidad temporal del tronco, estabilidad
    de la pierna de apoyo y asimetría postural.
  - `services/analitica_service.py` — fatiga intra-sesión (ventana 2 h),
    tendencia con regresión lineal pura y comparativa de últimas N patadas.
  - `services/interpretacion_service.py` — 7 alertas técnicas, clasificación
    heurística y observaciones en lenguaje natural.
  - `services/video_anotado_service.py` — generación de MP4 con OpenCV
    (esqueleto 33 landmarks, ángulos articulares, banner de impacto y
    trayectoria del tobillo de golpeo).
- **Controlador** — `controllers/futbol_controller.py`: orquesta todo el
  pipeline y devuelve un dict consolidado con métricas + curvas + fases +
  velocidades + estabilidad + alertas + clasificación + observaciones.
- **Modelo** — `models/futbol_model.py`: persistencia condicional de las
  columnas nuevas, helpers `_obtener_columna_json(id, col)` y
  `_listar_por_usuario(id, orden)` para evitar duplicación, parser JSON
  robusto a `dict | bytes | str`.
- **Endpoints nuevos en `app.py`** (puerto 5002):
  - `POST /api/futbol/video-anotado`
  - `GET /api/golpeos/<id>/{curvas,landmarks,alertas}`
  - `GET /api/usuarios_futbol/<id>/{fatiga,tendencia,comparativa}`
  - Helpers internos `_validar_usuario` y `_golpeos_serializados`.

### Frontend (`integration/web`)

- **`futbol.html`** — Chart.js 4.4.0 vía CDN, nuevas data-boxes y 6 paneles
  ocultos por defecto (`panel-fases`, `panel-alertas`, `panel-curvas`,
  `panel-velocidades`, `panel-analitica`, `panel-acciones`).
- **`js/api_futbol.js`** — 7 helpers nuevos:
  `obtenerCurvasGolpeo`, `obtenerLandmarksGolpeo`, `obtenerAlertasGolpeo`,
  `obtenerFatigaUsuarioFutbol`, `obtenerTendenciaUsuarioFutbol`,
  `obtenerComparativaUsuarioFutbol`, `generarVideoAnotadoFutbol` (devuelve
  `Blob`, no JSON).
- **`js/futbol.js`** — render de los nuevos paneles, gráficas Chart.js (con
  `destroy` antes de recrear), `cargarAnaliticaUsuario(id)` que invoca los 3
  endpoints analíticos en paralelo, botón de vídeo anotado con `Blob` del
  último vídeo analizado.

### Integración con landmarks cliente (commits de Diego)

Sobre la base anterior, Diego añadió:

- **`js/futbol_landmarks.js`** (nuevo, 383 líneas) — overlay client-side con
  MediaPipe Tasks Vision (CDN). Dos loops `requestAnimationFrame`
  independientes:
  - Live: dibuja esqueleto sobre `#vista-camara` / `#canvas-esqueleto`.
  - Preview: dibuja sobre el `<video>` del último blob analizado.
  - Heurística de detección de balón por diferencia de píxeles (canvas 160 px,
    throttling 1/2 frames, suavizado `α=0.6`).
- Nuevo bloque `#preview-landmarks` dentro de `panel-acciones` en
  `futbol.html`.
- Llamada `window.futbolLandmarksPreview.setVideoBlob(videoBlob)` desde
  `procesarVideo` tras `pintarResultados`.
- CSS: clases `.btn-accion`, `.btn-secondary`, `.preview-landmarks`,
  `.preview-video-wrap`, `.preview-video`, `.preview-canvas`.

## Bugs reales encontrados y corregidos

### Backend
1. **`impacto_service.calcular_velocidad_pie`**: el comentario decía
   "ventana ±2 frames y mediana" pero el código usaba `max`. Corregido el
   comentario para reflejar el comportamiento real (que es el correcto).

### Frontend
2. **Race condition entre análisis concurrentes** en
   `js/futbol.js → procesarVideo`. Antes se asignaba
   `ultimoVideoBlob = videoBlob` antes del `await analizarGolpeo`. Si el
   usuario lanzaba un segundo análisis mientras el primero estaba en curso,
   el resultado del primero se asociaba al blob equivocado y "Generar vídeo
   anotado" trabajaba sobre el vídeo erróneo.
   Solución: contador `analisisSeq` que descarta resultados/errores
   obsoletos; `videoBlob` se pasa explícitamente como parámetro a
   `pintarResultados(data, videoBlob)` → `prepararAcciones`.
3. **`let ultimoVideoBlob/ultimoResultado` declaradas tras su uso** —
   funcionaba por hoisting de `let` dentro del scope del handler, pero era
   frágil. Movidas al bloque inicial de variables.
4. **`inputArchivo.value = ''` no se reseteaba si el análisis fallaba** —
   bloqueaba la reselección del mismo archivo. Envuelto en `try/finally`.
5. **Preview no se limpiaba al iniciar nuevo análisis** — se añadió
   `futbolLandmarksPreview.reset()` en `js/futbol_landmarks.js` que para el
   loop, limpia el canvas, libera el `URL.createObjectURL` previo, oculta el
   bloque y resetea el estado del detector de balón. `procesarVideo` lo
   invoca al inicio.

## Refactors aplicados

| Lugar                | Antes                                                | Después                                  |
| -------------------- | ---------------------------------------------------- | ---------------------------------------- |
| `futbol_model.py`    | 3 métodos `obtener_curvas/landmarks/alertas` casi idénticos | `_obtener_columna_json(id, col)`         |
| `futbol_model.py`    | 2 métodos `obtener_por_usuario[_ordenado_asc]` con SQL duplicado | `_listar_por_usuario(id, orden)`         |
| `app.py`             | 3 endpoints repetían validación + fetch + serialize   | Helpers `_validar_usuario`, `_golpeos_serializados` |

## Validación

Pipeline end-to-end ejecutado con datos sintéticos (30 frames, patada con
pierna derecha entre frames 14–18). Resultados clave:

| Métrica              | Valor                                       |
| -------------------- | ------------------------------------------- |
| Pierna golpeo        | derecha                                     |
| Frame impacto        | 14                                          |
| Velocidad del pie    | 6.1 m/s (px/s = 1560)                       |
| Fases detectadas     | aproximacion, armado, impacto, follow_through |
| Pico vel. rodilla    | 220.3 °/s en frame 14                       |
| Fatiga (4 golpeos)   | significativa, caída 25%                    |
| Tendencia            | empeorando (R² = 0.95)                      |

`get_errors` final: sin errores en `app.py`, `futbol_model.py`,
`impacto_service.py`, `futbol.js`, `api_futbol.js`, `futbol_landmarks.js`,
`futbol.html`.

## Documentación actualizada

- `docs/futbol.md` reescrito con la nueva sección de analítica, alertas,
  endpoints y robustez del frontend.
- `modules/futbol/ANALITICA_AVANZADA.md` (nuevo) — referencia detallada de
  las 10 fases.
- `docs/README.md` — añadidos enlaces a `ANALITICA_AVANZADA.md` y a este
  historial.

## Pendientes detectados (no implementados)

- Visor 3D de landmarks (reutilizar componente del módulo `salto`).
- Calibración de `altura_real_m` por usuario (ahora 1.70 m por defecto).
- Tests unitarios para `analitica_service` y `cinematico_service`.
- Persistir `velocidades_articulares` para consultas históricas detalladas.
- Modelo dedicado de tracking del balón (mejor que la heurística actual).
