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

- [ ] Añadir campo `peso_kg` a tabla `usuarios` (ALTER TABLE, no destructivo)
- [ ] Actualizar formulario de registro (frontend) con campo peso opcional
- [ ] Actualizar endpoints POST/PUT de usuarios para aceptar `peso_kg`
- [ ] Calcular potencia tras cada salto vertical: `P = 60.7 × h_cm + 45.3 × peso_kg − 2055`
- [ ] Devolver `potencia_w` en la respuesta JSON del salto
- [ ] Mostrar potencia en el panel de resultados del frontend

### 5.2 Ángulos articulares en el despegue

- [x] Extraer landmarks de cadera (23/24), rodilla (25/26) y tobillo (27/28) en el frame de despegue
- [x] Calcular ángulo de rodilla: `θ = arctan2` entre vectores cadera→rodilla y tobillo→rodilla
- [x] Calcular ángulo de cadera: entre vectores hombro→cadera y rodilla→cadera
- [x] Crear `biomecanica_service.py` con funciones de trigonometría puras
- [x] Devolver `angulo_rodilla_deg` y `angulo_cadera_deg` en la respuesta JSON
- [x] Mostrar ángulos en panel de resultados (dato técnico adicional)

### 5.3 Asimetría bilateral

- [ ] Comparar desplazamiento Y del talón izquierdo vs derecho durante el despegue
- [ ] Calcular índice de asimetría: `ASI = (|izq − der| / max(izq, der)) × 100`
- [ ] Devolver `asimetria_pct` en la respuesta JSON del salto
- [ ] Alerta visual si asimetría > 15% (indicador de riesgo de lesión)

### 5.4 Detección de fatiga intra-sesión

- [x] Agrupar saltos por sesión (saltos del mismo usuario en un rango de 2 horas)
- [x] Calcular pendiente de regresión lineal sobre las distancias de la sesión
- [x] Endpoint `GET /api/usuarios/<id>/fatiga` que devuelva: pendiente, nº saltos, caída porcentual
- [x] Alerta en frontend si pendiente negativa significativa (>10% de caída)

### 5.5 Curva de progresión con tendencia

- [x] Endpoint `GET /api/usuarios/<id>/tendencia?tipo=vertical` con regresión sobre historial completo
- [x] Devolver: pendiente (cm/semana), R², predicción a 4 semanas, estado (mejorando/estancado/empeorando)
- [x] Gráfica de evolución en frontend (canvas o librería ligera tipo Chart.js)
