# Changelog

Registro de cambios por sesión de desarrollo.

---

## [2026-05-08] — Sesión 2: Visor 3D fútbol, cámara horizontal y limpieza

### Añadido

- **Visor 3D para el módulo fútbol** — paridad completa con el módulo salto:
  - Botones **Vista 2D / Vista 3D** en la sección de replay de landmarks.
  - Contenedor WebGL (`#preview-view-3d`) con fondo degradado oscuro.
  - Controles de reproducción: play/pausa, slider de scrubbing, velocidades ×1 / ×½ / ×¼.
  - Etiqueta **⚡ IMPACTO** que indica el frame exacto del golpeo.
  - El slider se posiciona automáticamente en el frame de impacto al abrir la vista 3D.
  - `futbol_landmarks.js` — bloque `// ── Visor 3D ──` (~270 líneas):
    - `POSE_CONNECTIONS_33`: 34 pares de índices estándar de MediaPipe Pose.
    - `_cargarThreeDeps3D()`: carga Three.js 0.160.0 + OrbitControls con fallback a 3 CDN (esm.sh → unpkg → jsdelivr).
    - `_init3D()`: escena, cámara PerspectiveCamera(45°), WebGLRenderer antialiasing, 33 esferas (articulaciones) + 34 huesos (Line).
    - `_renderFrame3D(frame)`: actualiza posiciones a partir de landmarks `{x,y,z}` normalizados.
    - `_dispose3D()`: limpia renderer, controls, ResizeObserver y cancelAnimationFrame.
    - `mostrar3D / mostrar2D`: alterna entre ambas vistas.
    - `window.futbolLandmarksPreview.set3DFrames(frames, frameImpacto)`: API pública.
  - `futbol.js` — llama a `set3DFrames()` con `resultado.landmarks_frames` y `resultado.frame_impacto` tras cada análisis.
  - `futbol.html` — estructura HTML del reproductor 3D añadida dentro de `#preview-landmarks`.
  - `analitica.css` — añadido alias `#slider-3d`, regla `#preview-3d-controls { display:flex }` y `#preview-view-3d { height:300px }`.

- **Forzar cámara horizontal en módulo fútbol** (`futbol.js`):
  - Variable `enModoPortrait` que se actualiza en `loadedmetadata` y `resize` del elemento vídeo.
  - Función `comprobarOrientacion()`: muestra/oculta el overlay `#alerta-orientacion`, deshabilita el botón de grabación y detiene la grabación activa si el dispositivo se gira a vertical durante la misma.

- **Forzar cámara horizontal en módulo salto** (`camara.js`):
  - Misma lógica `enModoPortrait` + `comprobarOrientacion()` integrada en `actualizarEstadoBotonDeteccion()`.

- **Overlay de orientación** — visible en ambos módulos cuando la cámara está en vertical:
  - HTML añadido en `salto.html` y `futbol.html`: `<div id="alerta-orientacion">` con icono y texto explicativo.
  - CSS en `salto.css`: `.alerta-orientacion` (overlay oscuro, icono animado, texto amarillo).

### Corregido

- **`<body class="salto-page">`** en `futbol.html` → corregido a `class="futbol-page"` (los breakpoints CSS `.futbol-page.capture-horizontal` no se aplicaban).
- **Script `usuario_activo.js` faltante** en `futbol.html` → añadido el `<script>` entre `api-client.js` y `api_futbol.js`.
- **Código muerto en `api_futbol.js`** (~240 líneas eliminadas): funciones de panel de analítica (`_graficaTendenciaFutbol`, `_renderGraficaCorrFutbol`, `limpiarAnaliticaPanelFutbol`, `getFutbolMetricaAnalitica`, etc.) que referenciaban IDs del DOM inexistentes.
- **Bug: `animLoop` leak** (`futbol_landmarks.js`) — cada llamada a `_iniciarReproductor3D` creaba un nuevo `requestAnimationFrame` sin cancelar el anterior. Corregido con `state3D.animLoopId` y `cancelAnimationFrame` en `_dispose3D` y al inicio de cada llamada.
- **Bug: video invisible tras segundo análisis** (`futbol_landmarks.js`) — si el usuario había cambiado a Vista 3D y llegaba un nuevo análisis, `mostrarPreview` hacía visible el wrapper exterior pero `#preview-2d-wrap` seguía `display:none`. Corregido llamando a `mostrar2D()` al inicio de `mostrarPreview`.
- **Bug: grabación continúa al girar a vertical** (`futbol.js`) — `comprobarOrientacion` desactivaba el botón pero no paraba el `MediaRecorder`. Corregido con `if (enModoPortrait && grabando) { detenerGrabacion(); }`.

---

## [2026-05-07] — Sesión 1: Módulo fútbol, alineación canvas y biomecánica

### Añadido

- **Módulo fútbol completo** — backend Python/Flask en `modules/futbol/backend/` (puerto 5002):
  - Pipeline MediaPipe Pose: extracción de 33 landmarks por frame, normalización `{x, y, z, visibility}`.
  - `impacto_service.py`: detección del frame de impacto por pico de velocidad angular del pie.
  - `cinematico_service.py`: curvas angulares, fases del gesto (preparación → impacto → seguimiento), velocidades articulares.
  - `apoyo_service.py`: estabilidad temporal del tronco y pierna de apoyo durante el golpeo.
  - `calculo_service.py`: ángulos puntuales en el impacto, score compuesto ponderado (velocidad 40 % + estabilidad 25 % + confianza 20 % + cadera 15 %).
  - `interpretacion_service.py`: alertas biomecánicas y clasificación de la técnica.
  - `video_anotado_service.py`: genera MP4 con overlay de esqueleto, ángulos y evento de impacto.
  - `futbol_controller.py`: acepta parámetro `incluir_landmarks=true` → incluye `landmarks_frames` en la respuesta (necesario para visor 3D).

- **Frontend módulo fútbol** — `futbol.html`, `futbol.js`, `futbol_landmarks.js`, `api_futbol.js`:
  - Overlay MediaPipe en tiempo real sobre la vista de cámara.
  - Detección heurística del balón por diferencia de frames con suavizado temporal.
  - Envío del vídeo al backend, representación de resultados biomecánicos.
  - Preview del vídeo analizado con esqueleto superpuesto (mismo patrón que el módulo salto).

### Corregido

- **Desalineación canvas/landmark** — el canvas superpuesto al vídeo no coincidía con el encuadre real en dispositivos móviles. Corregido con:
  - `.camera-wrapper { max-width: 500px; margin: 0 auto }` en `salto.css`.
  - `#canvas-esqueleto { position: absolute; top: 0; left: 0; width: 100%; height: 100% }`.
  - Los landmarks ahora se renderizan en coordenadas del vídeo real (`videoWidth` × `videoHeight`) antes de escalar al display.

- **4 bugs biomecánicos en `futbol_controller.py`**:
  1. Velocidad del pie calculada sobre coordenadas normalizadas sin escalar a píxeles reales → resultado incorrecto en píxeles por segundo.
  2. Frame de impacto buscaba el máximo de velocidad sobre todos los frames incluyendo frames sin pose detectada (visibility < 0.5) → falsos positivos.
  3. Score compuesto podía superar 100 por suma de pesos incorrecta cuando algún servicio devolvía `None`.
  4. `analitica_service` acumulaba datos de sesiones anteriores si el objeto se reutilizaba entre peticiones sin reiniciar el estado.
