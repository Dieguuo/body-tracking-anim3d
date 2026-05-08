# Resumen de refactorización CSS y ajustes de interfaz

Fecha: 2026-05-08

## Objetivo
Separar el CSS monolítico de `integration/web/css/style.css` en módulos más pequeños, mantener `style.css` como punto de entrada único y corregir problemas de espaciado y solapes en las vistas de salto y fútbol.

## Arquitectura final
- `integration/web/css/style.css`: loader único con `@import` de los módulos.
- `integration/web/css/global.css`: variables, reset y estilos base compartidos.
- `integration/web/css/botones.css`: botones, acciones, estados `hover` y `recording`.
- `integration/web/css/componentes.css`: toasts, inputs, tablas, cajas de datos y formularios reutilizables.
- `integration/web/css/salto.css`: vista de salto, cámara, resultados y bloque de comparativa.
- `integration/web/css/sensor.css`: vista del sensor / Arduino.
- `integration/web/css/analitica.css`: paneles de métricas, gráficas, timeline y landmarks.
- `integration/web/css/videos.css`: biblioteca de vídeos, grids, filtros y tarjetas.
- `integration/web/css/videos_galeria.css`: lógica visual específica de la galería unificada.

## Cambios realizados
- Se eliminó el contenido monolítico de `style.css` y se dejó solo como loader.
- Se movieron los estilos a archivos por responsabilidad sin cambiar sus propiedades.
- Se mantuvo la referencia HTML a un único CSS principal: `css/style.css`.
- Se retiró el enlace directo a `videos_galeria.css` en `videos.html`.
- Se creó una copia histórica del antiguo CSS en `integration/web/css/style_legacy_original.css`.
- Se ajustó el espaciado entre campos y tablas en componentes compartidos para evitar solapes en `salto` y `futbol`.

## Ajuste visual reciente
- Aumentado el espacio entre inputs, tablas y filas de acciones en formularios de usuario.
- Aumentado el `gap` de las filas de campos y el margen superior de la tabla de usuarios.
- Aumentado el espaciado entre bloques de métricas y filas de acciones reutilizables.

## Validación
- Se comprobó la sintaxis de los archivos CSS tocados y no se detectaron errores.
- `videos.html` ya no carga el CSS de la galería por separado.

## Notas
- No se extrajeron estilos específicos de fútbol porque el monolito original no contenía un bloque claramente separado para esa vista.
- La separación actual mantiene el comportamiento visual y mejora la mantenibilidad.
