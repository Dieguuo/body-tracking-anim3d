# Historial tecnico — 2026-05-04

## Resumen

- Se replico el sistema de usuarios del modulo salto en el modulo futbol.
- Se agrego soporte de guardado opcional de videos en la base de datos.
- Se creo biblioteca web de videos para futbol con streaming.

## Cambios principales

- Backend futbol: nuevos endpoints CRUD de usuarios y golpeos, streaming de video.
- Modelo `golpes_futbol` con metadatos y blobs de video.
- Frontend futbol: tabla de usuarios, formulario inline, y enlace a biblioteca.
- Documentacion actualizada para el flujo de futbol y API.

## Notas tecnicas

- El guardado de video es opcional y depende de `guardar_video_bd`.
- Los endpoints `/api/usuarios` y `/api/videos` viven en el backend futbol (puerto 5002).
