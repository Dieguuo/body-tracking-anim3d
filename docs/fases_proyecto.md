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

- [ ] Detectar el rango de frames post-aterrizaje (desde `frame_aterrizaje` hasta estabilización)
- [ ] Calcular oscilación del centro de masa (varianza de Y del promedio de caderas, landmarks 23/24) en los N frames tras aterrizar
- [ ] Calcular tiempo hasta estabilización: nº de frames hasta que la derivada de Y vuelve a ~0
- [ ] Devolver `estabilidad_aterrizaje` en la respuesta JSON (objeto con `oscilacion_px`, `tiempo_estabilizacion_s`, `estable: bool`)
- [ ] Mostrar métrica de estabilidad en el panel de resultados del frontend

### 6.2 Análisis de amortiguación

- [ ] Calcular ángulo de rodilla en el frame de aterrizaje (reutilizar `BiomecanicaService`)
- [ ] Calcular flexión máxima de rodilla en los frames posteriores al aterrizaje (pico de amortiguación)
- [ ] Calcular rango de amortiguación: diferencia entre ángulo al contacto y flexión máxima
- [ ] Devolver `amortiguacion_deg` (rango de flexión) y `angulo_rodilla_aterrizaje_deg` en JSON
- [ ] Alerta si amortiguación < 20° (recepción rígida, riesgo de lesión)

### 6.3 Simetría en la recepción

- [ ] Comparar desplazamiento Y de talón izquierdo vs derecho en el momento del aterrizaje (misma lógica que ASI de despegue)
- [ ] Comparar ángulo de rodilla izquierda vs derecha en el aterrizaje
- [ ] Devolver `asimetria_recepcion_pct` en JSON
- [ ] Alerta visual si asimetría de recepción > 15%

## Fase 7 — Análisis cinemático temporal del gesto

Prerequisito: Fase 6 completada (fases del salto bien delimitadas).

Objetivo: pasar de **métricas puntuales** (un ángulo en un frame) a **curvas temporales** que describan cómo se comportan las articulaciones durante todo el movimiento.

### 7.1 Curvas angulares completas

- [ ] Calcular ángulo de rodilla en cada frame del salto (desde N frames antes del despegue hasta N frames después del aterrizaje)
- [ ] Calcular ángulo de cadera en cada frame del salto
- [ ] Suavizar curvas con media móvil (3–5 frames) para filtrar ruido de MediaPipe
- [ ] Devolver arrays `curva_rodilla_deg[]` y `curva_cadera_deg[]` en la respuesta JSON (o en endpoint separado)

### 7.2 Detección automática de fases del salto

- [ ] Fase preparatoria (excéntrica): desde inicio hasta el mínimo de flexión de rodilla antes del despegue
- [ ] Fase de impulsión (concéntrica): desde el mínimo de flexión hasta el despegue
- [ ] Fase de vuelo: desde despegue hasta aterrizaje (ya detectada)
- [ ] Fase de recepción: desde aterrizaje hasta estabilización (Fase 6.1)
- [ ] Devolver `fases[]` con frame de inicio y fin de cada fase

### 7.3 Velocidades articulares

- [ ] Calcular velocidad angular de rodilla (derivada del ángulo entre frames consecutivos × fps)
- [ ] Calcular velocidad angular de cadera
- [ ] Detectar pico de velocidad de extensión (momento de máxima potencia articular)
- [ ] Suavizar con media móvil para reducir ruido
- [ ] Devolver `vel_rodilla_deg_s[]` y `vel_cadera_deg_s[]`

### 7.4 Métricas resumen del gesto

- [ ] Pico de flexión de rodilla (valor y frame)
- [ ] Pico de extensión de rodilla (valor y frame)
- [ ] Rango de movimiento total (ROM) de rodilla y cadera
- [ ] Ratio tiempo excéntrico / tiempo concéntrico
- [ ] Devolver como objeto `resumen_gesto` en JSON

## Fase 8 — Visualización técnica 2D

Prerequisito: Fase 7 completada (curvas angulares + fases disponibles).

Objetivo: representar visualmente el análisis sin necesidad de un visor 3D. Máximo valor con mínima complejidad.

### 8.1 Timeline interactivo del salto

- [ ] Barra temporal con los frames del salto y eventos marcados (preparación, despegue, pico, aterrizaje, estabilización)
- [ ] Clic en un evento → resaltar el frame y sus métricas
- [ ] Superponer curvas de ángulo de rodilla y cadera sobre la línea temporal
- [ ] Integrar en el panel de resultados de `salto.html`

### 8.2 Gráficas de curvas articulares

- [ ] Gráfica de ángulo de rodilla vs tiempo (Chart.js o similar)
- [ ] Gráfica de ángulo de cadera vs tiempo
- [ ] Marcar fases del salto con colores de fondo
- [ ] Opción de comparar dos intentos superpuestos en la misma gráfica

### 8.3 Vídeo anotado con overlay

- [ ] Procesar vídeo en backend con OpenCV: dibujar landmarks sobre los fotogramas
- [ ] Superponer ángulos articulares como texto sobre la imagen
- [ ] Marcar frames clave con indicadores visuales (despegue, pico, aterrizaje)
- [ ] Devolver vídeo procesado como descarga o stream
- [ ] Dibujar trayectoria de talones / centro de masa

## Fase 9 — Alertas inteligentes e interpretación automática

Prerequisito: Fases 6–7 completadas (métricas completas disponibles).

Objetivo: que los datos no solo se muestren, sino que **cuenten algo útil** al usuario. Capa de interpretación basada en reglas heurísticas.

### 9.1 Alertas biomecánicas por salto

- [ ] "Amortiguación insuficiente" si rango de flexión < 20° en recepción
- [ ] "Extensión de cadera limitada" si ángulo de cadera < umbral en el despegue
- [ ] "Desequilibrio en la recepción" si asimetría de recepción > 15%
- [ ] "Recepción inestable" si tiempo de estabilización > umbral
- [ ] Devolver array `alertas[]` con código, mensaje y severidad en JSON
- [ ] Mostrar alertas en el panel de resultados con iconos y colores

### 9.2 Alertas de tendencia entre sesiones

- [ ] Alerta si asimetría empeora en las últimas 3 sesiones
- [ ] Alerta si potencia cae de forma sostenida (pendiente negativa en últimas 5 sesiones)
- [ ] Alerta si patrón de fatiga se repite (caída >10% en N sesiones consecutivas)
- [ ] Integrar alertas de tendencia en el panel de analítica del frontend

### 9.3 Observaciones automáticas

- [ ] Generar texto descriptivo por salto: "Se detecta menor extensión de cadera respecto a la media del usuario"
- [ ] Comparar métricas del salto actual vs media histórica del usuario
- [ ] Clasificar salto como: equilibrado / asimétrico / fatigado / técnicamente correcto
- [ ] Mostrar observaciones junto al panel de resultados

## Fase 10 — Estadísticas avanzadas y correlaciones

Prerequisito: volumen de datos suficiente en BD (múltiples usuarios con historial).

Objetivo: extraer patrones y relaciones entre variables que no son evidentes a simple vista.

### 10.1 Panel de evolución ampliado

- [ ] Gráfica de evolución de potencia a lo largo del tiempo
- [ ] Gráfica de evolución de asimetría a lo largo del tiempo
- [ ] Comparativa visual entre sesiones (superponer métricas de dos sesiones)
- [ ] Selector de métricas para la gráfica (distancia, potencia, asimetría, ángulos)

### 10.2 Correlaciones y patrones

- [ ] Correlación peso vs potencia vs distancia (scatter plot)
- [ ] Correlación asimetría vs estabilidad de aterrizaje
- [ ] Detección de estancamiento: meseta en la curva de rendimiento (varianza baja en últimas N sesiones)
- [ ] Detección de mejora significativa (test estadístico simple sobre últimas sesiones vs anteriores)

### 10.3 Rankings y comparativas

- [ ] Ranking de mejores sesiones por distancia media
- [ ] Comparativa entre tipos de salto (vertical vs horizontal) del mismo usuario
- [ ] Predicción de rendimiento afinada (regresión con más variables: peso, potencia, tendencia)

---

## Fase futura — Visualización 3D interactiva

Prerequisito: Fases 7–8 completadas (curvas cinemáticas + timeline funcional).

> **Nota:** esta fase se abordará cuando el análisis biomecánico y la visualización 2D estén sólidos. Un visor 3D sin datos completos detrás sería un envoltorio sin contenido.

- [ ] Esqueleto animado del salto (replay de landmarks en 3D)
- [ ] Visor interactivo con rotación/zoom (React + Three.js o similar)
- [ ] Comparación lado a lado de dos intentos
- [ ] Trayectorias y ángulos en escena 3D
- [ ] Overlay técnico sobre el modelo (ángulos, fases, alertas)
