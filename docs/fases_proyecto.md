# Fases del proyecto

## Fase 1 — Módulo sensor de distancia (completada)

- [x] Sketch Arduino con HC-SR04 (promedio de 5 lecturas, filtro 2–400 cm)
- [x] Backend Python — estructura MVC (Model, View, Controller)
- [x] API REST Flask — `GET /distancia` con `valor`, `unidad`, `raw`, `timestamp`
- [x] Frontend web del módulo (`modules/sensor/frontend/`) con polling al endpoint

## Fase 2 — Módulo de altura de salto (pendiente)

- [ ] Definir tecnología del cliente móvil
- [ ] Implementar backend (`modules/salto/backend/`)
- [ ] Implementar cliente móvil (`modules/salto/mobile/`)
- [ ] Nuevo endpoint REST (`GET /salto/altura`)
- [ ] Frontend web del módulo (`modules/salto/frontend/`)

## Fase 3 — Integración y UI unificada (pendiente)

Prerequisito: Fases 1 y 2 completadas.

- [ ] Diseñar dashboard unificado (`integration/frontend/`)
- [ ] Decidir si se necesita `integration/backend/` (gateway/orquestador)
- [ ] Histórico de mediciones (base de datos opcional)
- [ ] Deploy o empaquetado final
