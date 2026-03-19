# Fases del proyecto

## Fase 1 — Módulo sensor de distancia (completada)

- [x] Sketch Arduino con HC-SR04 (promedio de 5 lecturas, filtro 2–400 cm)
- [x] Backend Python — estructura MVC (Model, View, Controller)
- [x] API REST Flask — `GET /distancia` con `valor`, `unidad`, `raw`, `timestamp`
- [x] Frontend web del módulo (`modules/sensor/frontend/`) con polling al endpoint

## Fase 2 — Módulo de salto vertical y horizontal (en progreso)

- [x] Backend MVC funcional (`modules/salto/backend/`)
- [x] Procesamiento de vídeo con MediaPipe PoseLandmarker (Tasks API)
- [x] Algoritmo de salto vertical — método híbrido: cinemática (`h = (1/8) × g × t²`) + píxeles calibrados (`(Y_suelo - Y_pico) × S`), promedio ponderado 60/40
- [x] Algoritmo de salto horizontal — calibración geométrica: `D_real = Dp × (Hr / Hp)`
- [x] `altura_real_m` obligatorio para ambos tipos de salto (necesario para calibración)
- [x] API REST expuesta (`POST /api/salto/calcular`) en puerto 5001
- [x] Página de prueba temporal (`http://localhost:5001`) para validar el backend
- [ ] Frontend web definitivo del módulo (`modules/salto/frontend/`)
- [ ] Cliente móvil para grabar y enviar vídeo (`modules/salto/mobile/`)

## Fase 3 — Integración y UI unificada (pendiente)

Prerequisito: Fases 1 y 2 completadas.

- [ ] Diseñar dashboard unificado (`integration/frontend/`)
- [ ] Decidir si se necesita `integration/backend/` (gateway/orquestador)
- [ ] Histórico de mediciones (base de datos opcional)
- [ ] Deploy o empaquetado final
