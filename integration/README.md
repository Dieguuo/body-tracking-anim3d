# Integration — Fase 3: App web unificada

> **Estado: Reservado.** Esta carpeta se activa en la Fase 3, cuando los módulos independientes (`sensor`, `salto`, y futuros) estén listos para unirse en una única interfaz web.

## Propósito

Construir la aplicación web final que el usuario percibe como una sola herramienta, aunque internamente consuma APIs de módulos independientes.

## Estructura prevista

```
integration/
├── frontend/    ← Dashboard o SPA que une todos los módulos
└── backend/     ← Orquestador o API gateway (solo si la complejidad lo requiere)
```

## Visión de la interfaz final

```
APP WEB FINAL
├── Vista / módulo Sensor Arduino
│   ├── distancia en tiempo real
│   └── estado de conexión
│
└── Vista / módulo Salto con móvil
    ├── cálculo de altura de salto
    └── resultado y datos asociados
```

Puede resolverse como:
- Una **SPA** con navegación entre vistas
- Un **dashboard** con paneles separados por módulo
- Una **página única** con secciones

## Qué NO hace esta carpeta ahora

Mientras los módulos están en desarrollo individual, cada módulo tiene su propio frontend en `modules/<nombre>/frontend/`. `integration/` no es el lugar para desarrollar ni probar un módulo concreto.

## Checklist Fase 3

- [ ] Módulo sensor (Fase 1) completado
- [ ] Módulo salto (Fase 2) completado
- [ ] Diseñar la UI unificada
- [ ] Decidir si `integration/backend/` es necesario
- [ ] Implementar dashboard en `integration/frontend/`
