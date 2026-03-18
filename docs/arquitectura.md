# Arquitectura del proyecto

## Flujo general

Cada módulo del proyecto sigue el mismo patrón:

```
Dispositivo físico / fuente de datos
      │  (Serial USB, HTTP, WebSocket...)
      ▼
Python Backend (Flask)
      │  HTTP REST API
      ▼
Frontend Web (HTML + JS)
```

### Módulo sensor (Fase 1)

```
Arduino (HC-SR04) → Serial USB (9600 baud) → Python MVC → Flask API → Frontend web
```

### Módulo salto (Fase 2 — previsto)

```
Móvil (acelerómetro) → HTTP/WebSocket → Python Backend → Flask API → Frontend web
```

## Capas

| Capa | Tecnología | Responsabilidad |
|------|-----------|----------------|
| Hardware | Arduino + HC-SR04 | Medir distancia física |
| Backend | Python + Flask | Leer serial, procesar datos, exponer API REST |
| Frontend (módulo) | HTML / JS | Visualizar datos del módulo individual |
| Frontend (integración) | Por definir (Fase 3) | Dashboard unificado |
| Móvil (Fase 2) | Por definir | Calcular altura de salto |

## Organización de carpetas

```
modules/
├── sensor/          ← Módulo 1: arduino/ + backend/ + frontend/
└── salto/           ← Módulo 2: backend/ + mobile/ (+ frontend/ futuro)

integration/         ← Fase 3: dashboard web unificado
```

Cada módulo incluye su propio frontend para desarrollo y pruebas autónomas.
`integration/` reúne todos los módulos en una única interfaz web en la Fase 3.

## Principios aplicados

- **MVC** en el backend Python: modelo (serial), vista (consola), controlador (flujo).
- **Separación de responsabilidades**: Arduino no conoce el backend; el backend no conoce el frontend.
- **Modularidad**: cada funcionalidad vive en `modules/<nombre>/` con arduino, backend y frontend propios.
- **Autonomía de módulo**: cada módulo puede arrancarse y probarse de forma independiente.
