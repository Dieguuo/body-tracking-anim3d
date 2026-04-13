# Fases del proyecto

## Fase 1 — Módulo sensor de distancia (completada)

- [x] Sketch Arduino con HC-SR04 (promedio de 5 lecturas, filtro 2–400 cm)
- [x] Backend Python — estructura MVC (Model, View, Controller)
- [x] API REST Flask — `GET /distancia` con `valor`, `unidad`, `raw`, `timestamp`
- [x] Frontend web del módulo (integrado en `integration/web/arduino.html`) con polling al endpoint

## Fase 2 — Módulo de salto vertical y horizontal (en progreso)

- [x] Backend MVC funcional (`modules/salto/backend/`)
- [x] Procesamiento de vídeo con MediaPipe PoseLandmarker (Tasks API)
- [x] Algoritmo de salto vertical — método híbrido: cinemática (`h = (1/8) × g × t²`) + píxeles calibrados (`(Y_suelo - Y_pico) × S`), promedio ponderado 60/40
- [x] Algoritmo de salto horizontal — calibración geométrica: `D_real = Dp × (Hr / Hp)`
- [x] `altura_real_m` obligatorio para ambos tipos de salto (necesario para calibración)
- [x] API REST expuesta (`POST /api/salto/calcular`) en puerto 5001
- [x] Frontend web del salto integrado en `integration/web/salto.html`
- [ ] Cliente móvil para grabar y enviar vídeo (`modules/salto/mobile/`) — **pendiente, carpeta vacía**

## Fase 3 — Integración y UI unificada (completada)

Prerequisito: Fases 1 y 2 completadas.

- [x] Frontend web unificado (`integration/web/`) con landing + módulos
- [x] Página de salto (`salto.html`) con cámara, grabación y resultados
- [x] Página de sensor Arduino (`arduino.html`) con lectura en tiempo real
- [x] Script único de arranque (`scripts/run_all.bat`)
- [x] Eliminados frontends individuales y scripts obsoletos
- [ ] Decidir si se necesita `integration/backend/` (gateway/orquestador)
- [x] Base de datos MySQL — tablas `usuarios` y `saltos` (relación 1:N)
- [x] CRUD REST para usuarios y saltos
- [x] Persistencia automática del resultado de cálculo (si se envía `id_usuario`)
- [x] Regla de negocio: mínimo 4 saltos verticales + 4 horizontales para comparativa
- [x] Endpoint de progreso (`GET /api/usuarios/<id>/progreso`)
- [x] Endpoint de comparativa (`GET /api/usuarios/<id>/comparativa`)
- [x] Estadísticas calculadas al vuelo (mejor, peor, media, último, evolución)
- [ ] Deploy o empaquetado final

## Fase 4 — Seguridad, validaciones y hardening

- [x] Eliminada contraseña hardcoded de `config.py` — obligatorio `.env`
- [x] Cabeceras de seguridad HTTP (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`)
- [x] XSS corregido — `innerHTML` con datos de usuario reemplazado por DOM seguro (`textContent`)
- [x] Errores de BD sanitizados — `IntegrityError` ya no expone detalles del schema
- [x] Validación de altura 0.50–2.50 m (frontend y backend)
- [x] Validación de longitud máxima de alias (50) y nombre (120) en backend
- [x] Validación de tamaño de archivo >100 MB en frontend (antes del upload)
- [x] `print()` de arranque sustituidos por `logging.info()`
- [x] Índice `idx_saltos_usuario` en `init_db.sql`
- [x] Indicador de carga al subir vídeo (con timeout de seguridad)
- [x] Script `setup.bat` para onboarding de colaboradores
- [x] `run_all.bat` con pre-checks (venv, .env, imports)
- [ ] Autenticación de usuarios (JWT o sesiones)
- [ ] Protección CSRF para endpoints de escritura
- [ ] Rate limiting en endpoints POST/DELETE

## Fase 5 — Biomecánica y análisis avanzado de saltos

Prerequisito: Fase 2 completada (landmarks + historial de saltos en BD).

### 5.1 Potencia de Sayers

- [x] Añadir campo `peso_kg` a tabla `usuarios` (ALTER TABLE, no destructivo)
- [x] Actualizar formulario de registro (frontend) con campo peso opcional
- [x] Actualizar endpoints POST/PUT de usuarios para aceptar `peso_kg`
- [x] Calcular potencia tras cada salto vertical: `P = 60.7 × h_cm + 45.3 × peso_kg − 2055`
- [x] Devolver `potencia_w` en la respuesta JSON del salto
- [x] Mostrar potencia en el panel de resultados del frontend

### 5.2 Ángulos articulares en el despegue

- [x] Extraer landmarks de cadera (23/24), rodilla (25/26) y tobillo (27/28) en el frame de despegue
- [x] Calcular ángulo de rodilla: `θ = arctan2` entre vectores cadera→rodilla y tobillo→rodilla
- [x] Calcular ángulo de cadera: entre vectores hombro→cadera y rodilla→cadera
- [x] Crear `biomecanica_service.py` con funciones de trigonometría puras
- [x] Devolver `angulo_rodilla_deg` y `angulo_cadera_deg` en la respuesta JSON
- [x] Mostrar ángulos en panel de resultados (dato técnico adicional)

### 5.3 Asimetría bilateral

- [x] Comparar desplazamiento Y del talón izquierdo vs derecho durante el despegue
- [x] Calcular índice de asimetría: `ASI = (|izq − der| / max(izq, der)) × 100`
- [x] Devolver `asimetria_pct` en la respuesta JSON del salto
- [x] Alerta visual si asimetría > 15% (indicador de riesgo de lesión)

### 5.4 Detección de fatiga intra-sesión

- [x] Agrupar saltos por sesión (saltos del mismo usuario en un rango de 2 horas)
- [x] Calcular pendiente de regresión lineal sobre las distancias de la sesión
- [x] Endpoint `GET /api/usuarios/<id>/fatiga` que devuelva: pendiente, nº saltos, caída porcentual
- [x] Alerta en frontend si pendiente negativa significativa (>10% de caída)

### 5.5 Curva de progresión con tendencia

- [x] Endpoint `GET /api/usuarios/<id>/tendencia?tipo=vertical` con regresión sobre historial completo
- [x] Devolver: pendiente (cm/semana), R², predicción a 4 semanas, estado (mejorando/estancado/empeorando)
- [x] Gráfica de evolución en frontend (canvas o librería ligera tipo Chart.js)

---

## Fase 6 — Biomecánica completa del aterrizaje

Prerequisito: Fase 5 completada (ángulos articulares + asimetría ya implementados).

Objetivo: pasar de analizar solo el despegue a cubrir **todo el ciclo del salto**, especialmente la recepción, que es donde se producen las lesiones.

### 6.1 Estabilidad de aterrizaje

- [x] Detectar el rango de frames post-aterrizaje (desde `frame_aterrizaje` hasta estabilización)
- [x] Calcular oscilación del centro de masa (varianza de Y del promedio de caderas, landmarks 23/24) en los N frames tras aterrizar
- [x] Calcular tiempo hasta estabilización: nº de frames hasta que la derivada de Y vuelve a ~0
- [x] Devolver `estabilidad_aterrizaje` en la respuesta JSON (objeto con `oscilacion_px`, `tiempo_estabilizacion_s`, `estable: bool`)
- [x] Mostrar métrica de estabilidad en el panel de resultados del frontend

### 6.2 Análisis de amortiguación

- [x] Calcular ángulo de rodilla en el frame de aterrizaje (reutilizar `BiomecanicaService`)
- [x] Calcular flexión máxima de rodilla en los frames posteriores al aterrizaje (pico de amortiguación)
- [x] Calcular rango de amortiguación: diferencia entre ángulo al contacto y flexión máxima
- [x] Devolver `amortiguacion_deg` (rango de flexión) y `angulo_rodilla_aterrizaje_deg` en JSON
- [x] Alerta si amortiguación < 20° (recepción rígida, riesgo de lesión)

### 6.3 Simetría en la recepción

- [x] Comparar desplazamiento Y de talón izquierdo vs derecho en el momento del aterrizaje (misma lógica que ASI de despegue)
- [x] Comparar ángulo de rodilla izquierda vs derecha en el aterrizaje
- [x] Devolver `asimetria_recepcion_pct` en JSON
- [x] Alerta visual si asimetría de recepción > 15%

## Fase 7 — Análisis cinemático temporal del gesto

Prerequisito: Fase 6 completada (fases del salto bien delimitadas).

Objetivo: pasar de **métricas puntuales** (un ángulo en un frame) a **curvas temporales** que describan cómo se comportan las articulaciones durante todo el movimiento.

### 7.1 Curvas angulares completas

- [x] Calcular ángulo de rodilla en cada frame del salto (desde N frames antes del despegue hasta N frames después del aterrizaje)
- [x] Calcular ángulo de cadera en cada frame del salto
- [x] Suavizar curvas con media móvil (3–5 frames) para filtrar ruido de MediaPipe
- [x] Devolver arrays `curva_rodilla_deg[]` y `curva_cadera_deg[]` en la respuesta JSON (o en endpoint separado)

### 7.2 Detección automática de fases del salto

- [x] Fase preparatoria (excéntrica): desde inicio hasta el mínimo de flexión de rodilla antes del despegue
- [x] Fase de impulsión (concéntrica): desde el mínimo de flexión hasta el despegue
- [x] Fase de vuelo: desde despegue hasta aterrizaje (ya detectada)
- [x] Fase de recepción: desde aterrizaje hasta estabilización (Fase 6.1)
- [x] Devolver `fases[]` con frame de inicio y fin de cada fase

### 7.3 Velocidades articulares

- [x] Calcular velocidad angular de rodilla (derivada del ángulo entre frames consecutivos × fps)
- [x] Calcular velocidad angular de cadera
- [x] Detectar pico de velocidad de extensión (momento de máxima potencia articular)
- [x] Suavizar con media móvil para reducir ruido
- [x] Devolver `vel_rodilla_deg_s[]` y `vel_cadera_deg_s[]`

### 7.4 Métricas resumen del gesto

- [x] Pico de flexión de rodilla (valor y frame)
- [x] Pico de extensión de rodilla (valor y frame)
- [x] Rango de movimiento total (ROM) de rodilla y cadera
- [x] Ratio tiempo excéntrico / tiempo concéntrico
- [x] Devolver como objeto `resumen_gesto` en JSON

## Fase 8 — Visualización técnica 2D

Prerequisito: Fase 7 completada (curvas angulares + fases disponibles).

Objetivo: representar visualmente el análisis sin necesidad de un visor 3D. Máximo valor con mínima complejidad.

### 8.1 Timeline interactivo del salto

- [x] Barra temporal con los frames del salto y eventos marcados (preparación, despegue, pico, aterrizaje, estabilización)
- [x] Clic en un evento → resaltar el frame y sus métricas
- [x] Superponer curvas de ángulo de rodilla y cadera sobre la línea temporal
- [x] Integrar en el panel de resultados de `salto.html`

### 8.2 Gráficas de curvas articulares

- [x] Gráfica de ángulo de rodilla vs tiempo (Chart.js o similar)
- [x] Gráfica de ángulo de cadera vs tiempo
- [x] Marcar fases del salto con colores de fondo
- [x] Opción de comparar dos intentos superpuestos en la misma gráfica

### 8.3 Vídeo anotado con overlay

- [x] Procesar vídeo en backend con OpenCV: dibujar landmarks sobre los fotogramas
- [x] Superponer ángulos articulares como texto sobre la imagen
- [x] Marcar frames clave con indicadores visuales (despegue, pico, aterrizaje)
- [x] Devolver vídeo procesado como descarga o stream
- [x] Dibujar trayectoria de talones / centro de masa

### 8.4 Biblioteca de vídeos guardados

- [x] Crear menú separado `videos.html` para no saturar la pantalla principal
- [x] Filtrar vídeos por usuario y tipo de salto
- [x] Separar vídeos individuales y comparativas (grupos de 4)
- [x] Mostrar fecha de cada vídeo
- [x] Reproducción con pausa y seek (HTML5 + controles ±10 s)

## Fase 9 — Alertas inteligentes e interpretación automática

Prerequisito: Fases 6–7 completadas (métricas completas disponibles).

Objetivo: que los datos no solo se muestren, sino que **cuenten algo útil** al usuario. Capa de interpretación basada en reglas heurísticas.

### 9.1 Alertas biomecánicas por salto

- [x] "Amortiguación insuficiente" (heurística inicial)
- [x] "Extensión de cadera limitada" si ángulo de cadera < umbral en el despegue
- [x] "Desequilibrio en la recepción" (proxy por asimetría disponible)
- [x] "Recepción inestable" (heurística inicial)
- [x] Devolver array `alertas[]` con código, mensaje y severidad en JSON
- [x] Mostrar alertas en el panel de resultados con colores y texto de severidad

### 9.2 Alertas de tendencia entre sesiones

- [x] Alerta si asimetría empeora en las últimas 3 sesiones
- [x] Alerta si potencia cae de forma sostenida (estimación sobre últimas 5 sesiones)
- [x] Alerta si patrón de fatiga se repite (caída >10% en sesiones consecutivas)
- [x] Integrar alertas de tendencia en el panel de analítica del frontend

### 9.3 Observaciones automáticas

- [x] Generar texto descriptivo por salto con reglas heurísticas
- [x] Comparar salto actual vs media histórica del usuario (distancia)
- [x] Clasificar salto como: equilibrado / asimétrico / fatigado / técnicamente correcto
- [x] Mostrar observaciones junto al panel de resultados

## Fase 10 — Estadísticas avanzadas y correlaciones

Prerequisito: volumen de datos suficiente en BD (múltiples usuarios con historial).

Objetivo: extraer patrones y relaciones entre variables que no son evidentes a simple vista.

### 10.1 Panel de evolución ampliado

- [x] Gráfica de evolución de potencia estimada a lo largo del tiempo
- [x] Gráfica de evolución de asimetría a lo largo del tiempo
- [x] Comparativa visual entre sesiones (superponer métricas de dos sesiones)
- [x] Selector de métricas para la gráfica (distancia, potencia estimada)

### 10.2 Correlaciones y patrones

- [x] Correlación peso vs potencia vs distancia (scatter plot)
- [x] Correlación asimetría vs estabilidad de aterrizaje
- [x] Detección de estancamiento: meseta en la curva de rendimiento (varianza baja en últimas N sesiones)
- [x] Detección de mejora significativa (test estadístico simple sobre últimas sesiones vs anteriores)

### 10.3 Rankings y comparativas

- [x] Ranking de mejores sesiones por distancia media
- [x] Comparativa entre tipos de salto (vertical vs horizontal) del mismo usuario
- [x] Predicción de rendimiento afinada (regresión con más variables: peso, potencia, tendencia)

---

## Fase 11 — Visualización 3D interactiva

Prerequisito: Fases 7–8 completadas (curvas cinemáticas + timeline funcional).

> **Nota:** esta fase se abordó una vez que el análisis biomecánico y la visualización 2D estaban sólidos.

### 11.1 Persistencia de los 33 landmarks completos (completada)

- [x] Extracción de los 33 landmarks de MediaPipe (x, y, z, visibility) en cada frame procesado
- [x] Almacenamiento en columna `curvas_json` de la tabla `saltos` como array `landmarks_frames`
- [x] Nuevo endpoint `GET /api/salto/<id>/landmarks` que devuelve los 33 landmarks frame a frame
- [x] Inclusión opcional de landmarks en la respuesta de `POST /api/salto/calcular` (parámetro `incluir_landmarks=true`)
- [x] Buffer local en frontend (`landmarksFramesLocalBuffer`) como fallback si el backend no devuelve landmarks

### 11.2 Visor 2D de esqueleto con Canvas (completada)

- [x] Panel `#panel-landmarks` en `salto.html` con canvas 2D (`#landmarks-canvas-2d`)
- [x] Función `_dibujarFrame2D()` que renderiza los 33 joints (círculos naranja) y bones (líneas cyan)
- [x] Mapa de conexiones `POSE_CONNECTIONS_33` con los 33 puntos del esqueleto MediaPipe
- [x] Slider de frames para navegar frame a frame con indicador de timestamp
- [x] Opacidad de joints basada en la visibilidad/confianza del landmark
- [x] Mensaje "Sin landmarks" si un frame no tiene datos

### 11.3 Visor 3D interactivo con Three.js (completada)

- [x] Escena Three.js con cámara perspectiva (45° FOV), luces ambiental + direccional
- [x] OrbitControls para rotación, pan y zoom con ratón
- [x] 33 esferas (joints) + cilindros/líneas (bones) como geometría del esqueleto
- [x] Función `_renderFrame3D()` que convierte coordenadas normalizadas a espacio 3D (x, y invertido, z negado)
- [x] Carga de Three.js por CDN con fallback triple (esm.sh → unpkg → jsdelivr)
- [x] Toggle 2D/3D con botones `#btn-landmarks-2d` / `#btn-landmarks-3d`
- [x] `_disposeThreeViewer()` para limpieza de recursos WebGL al cambiar de modo
- [x] Auto-resize con `ResizeObserver` para layout responsive
- [x] Fallback automático a 2D si WebGL no está disponible

### 11.4 Animación del salto (completada)

- [x] Botones play/pause (`▶`/`⏸`) con `_startAnimation()` / `_stopAnimation()` basados en `setInterval`
- [x] Control de velocidad con ciclo ×0.25 → ×0.5 → ×1 (botón `#btn-landmarks-speed`)
- [x] Intervalo de animación calculado a partir de timestamps reales de los frames y velocidad seleccionada
- [x] Indicador de fase actual (preparación → impulsión → vuelo → recepción) sincronizado con la animación (`#landmarks-fase-actual`)
- [x] Helper `_getFaseParaFrame()` que busca la fase correspondiente a un frame en `datos.fases_salto`
- [x] Esquema de colores por fase: azul (preparación), amarillo (impulsión), verde (vuelo), rojo (recepción)
- [x] Loop automático: al llegar al último frame, vuelve al primero

### 11.5 Overlays biomecánicos en 2D y 3D (completada)

- [x] Checkbox para activar/desactivar overlay de ángulos articulares (`#chk-landmarks-angulos`)
- [x] Arcos de ángulo de rodilla (landmarks 23→25→27 y 24→26→28) dibujados sobre canvas 2D con `_dibujarArcoAngulo2D()`
- [x] Arcos de ángulo de cadera (landmarks 11→23→25 y 12→24→26) con valor numérico en grados
- [x] Cálculo de ángulos con `_anguloEntreLandmarks()` (producto escalar + arccos)
- [x] Checkbox para trayectoria del centro de masa (`#chk-landmarks-trayectoria`)
- [x] Trayectoria CM en 2D: trail (promedio Y de caderas 23+24) sobre todos los frames con `_dibujarTrayectoriaCM2D()`
- [x] Indicador del CM actual como punto blanco sobre la trayectoria
- [x] Checkbox para colores por fase (`#chk-landmarks-fases`)
- [x] Color de esqueleto dinámico en 2D (`_getBoneColorForFase()`) y 3D (material de joints y bones) según la fase activa
- [x] Panel de métricas sincronizado al frame actual (`_actualizarMetricas()`)
  - Ángulo de rodilla medio (izq + der / 2) en tiempo real
  - Ángulo de cadera medio en tiempo real
  - Nombre y color de la fase actual
- [x] Panel de métricas auto-visible cuando cualquier overlay está activo

### 11.6 Comparativa de saltos en el visor (completada)

- [x] Selector de salto a comparar (`#select-landmarks-comparar`) poblado dinámicamente con `_poblarSelectorComparacion()`
- [x] Carga de landmarks del salto de comparación desde `GET /api/salto/<id>/landmarks` con caché en `landmarksCache`
- [x] Esqueleto ghost en 2D: `_dibujarFrameGhost2D()` con opacidad 35% y color rosa (`#ff8cff`)
- [x] Esqueleto ghost en 3D: `_renderFrameGhost3D()` con joints y bones translúcidos (40% opacidad, rosa)
- [x] Mapeo proporcional de frames entre salto principal y comparación (`_mapCompareFrame()`)
- [x] Limpieza de geometría ghost con `_removeCompareGhost()` al cambiar o quitar la comparación
- [x] Integración en `_actualizarFrameLandmarks()`: ghost se renderiza automáticamente en cada cambio de frame
- [x] Filtrado: el salto actual no aparece en el selector de comparación

## Fase 12 — Corrección de slow-motion y robustez del pipeline

Prerequisito: Fases 2 y 11 completadas (procesamiento de vídeo + visualización funcionales).

Objetivo: que el sistema produzca resultados correctos con vídeos grabados en cámara lenta (slow-motion), sin intervención manual del usuario.

### 12.1 Detección automática de slow-motion (completada)

- [x] Nuevo método `_detectar_factor_slowmo()` en `CalculoService` que ajusta una parábola a la trayectoria Y de la cadera durante la fase de vuelo
- [x] Extracción de aceleración aparente: `a_aparente = 2 × coef_cuadrático × escala × fps²`
- [x] Comparación con la gravedad real: `factor = sqrt(9.81 / g_aparente)`
- [x] Rango de aplicación: factor > 1.3 para evitar falsos positivos; límite máximo 12.0
- [x] Corrección automática de FPS: `fps_real = fps_video × factor`
- [x] Aplicado en `calcular_vertical()` y `calcular_horizontal()` (todos los cálculos de tiempo usan `fps_real`)
- [x] `factor_slowmo` añadido a `ResultadoSalto` y devuelto en la respuesta JSON
- [x] El controlador usa `fps_real` para el enriquecimiento biomecánico y cinemático (Fases 6-7)
- [x] Logging diagnóstico con prefijo `[SLOWMO]` para depuración

### 12.2 Validación de vuelo tolerante a slow-motion (completada)

- [x] Límites de tiempo de vuelo ampliados para no rechazar vuelos de vídeos en slow-motion
- [x] Salto horizontal: máximo 8.0 s aparentes (antes 2.0 s)
- [x] Salto vertical: máximo 5.0 s aparentes (antes 2.0 s)
- [x] La corrección temporal precisa se aplica después con `_detectar_factor_slowmo()`

### 12.3 Descarga de vídeo anotado en Windows (completada)

- [x] Corregido `PermissionError` al descargar vídeo anotado en Windows (`send_file` mantenía el archivo abierto mientras `finally` intentaba borrarlo)
- [x] Solución: leer el vídeo anotado en memoria antes de responder, permitiendo la limpieza de archivos temporales sin conflicto
- [x] Limpieza de archivos con `try/except OSError` para evitar errores silenciosos

### 12.4 Corrección del umbral de detección de vuelo en salto horizontal (completada)

- [x] Diagnóstico del problema: salto horizontal devolvía ~336 cm en lugar de ~240 cm
- [x] Causa raíz identificada: el umbral de Y para considerar "en aire" era de 0.99 px (`max(0.9, altura_ref × 0.0025)`), insuficiente para filtrar el ruido natural de MediaPipe (±5-7 px estando de pie)
- [x] Consecuencia: el detector marcaba frame 16→120 como vuelo (104 de 121 frames = casi todo el vídeo), incluyendo la caminata antes y después del salto
- [x] Corrección: nuevo umbral `max(8.0, altura_ref × 0.02)` ≈ 8 px, que supera el ruido de postura y solo detecta elevaciones reales de los pies
- [x] Resultado verificado: despegue frame 19 → aterrizaje frame 84 (ventana correcta del salto), distancia corregida de 336 cm a ~240 cm
- [x] Factor slow-motion también corregido en consecuencia: de 6.688 a 3.233 (parábola más limpia al tener la ventana de vuelo correcta)
- [x] El umbral de salto vertical se mantiene inalterado (`max(1.2, altura_ref × 0.004)`)
