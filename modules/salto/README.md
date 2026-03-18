# Módulo 2 — Cálculo de Altura de Salto

Parte del proyecto **proyecto-medicion**. Calculará la altura de un salto vertical usando los sensores del móvil (acelerómetro / giroscopio).

> **Fase 2 — No iniciado.** Se abordará tras completar la Fase 1 (módulo sensor).

## Estructura prevista

```
salto/
├── backend/     ← Python: recibe datos del móvil, calcula altura, expone API REST
├── mobile/      ← Cliente móvil que captura y envía los datos del sensor
└── README.md
```

## Endpoint previsto

```
GET /salto/altura
```

```json
{ "altura_cm": 42.3, "duracion_ms": 620 }
```

## Decisiones pendientes

- [ ] Tecnología del cliente móvil (React Native, Flutter, web app con DeviceMotion API...)
- [ ] Protocolo de envío de datos al backend (HTTP POST, WebSocket...)
- [ ] Algoritmo de cálculo de altura a partir de acelerómetro
- [ ] Implementar `modules/salto/backend/`
- [ ] Implementar `modules/salto/mobile/`
