# Entrega de cambios — 2026-05-04

## Objetivo

Replicar el sistema de usuarios del modulo salto en el modulo futbol, con guardado opcional de videos en BD y biblioteca web.

## Backend (futbol)

- Nuevos endpoints CRUD de usuarios: `/api/usuarios`.
- Endpoints de golpeos: `/api/golpeos` y `/api/futbol/guardar`.
- Guardado automatico desde `/api/futbol/analizar` con `guardar_bd` y `guardar_video_bd`.
- Biblioteca de videos: `/api/videos` y `/api/videos/<id>/stream`.

## Base de datos

- Nueva tabla `golpes_futbol` con FK a `usuarios`.
- Columnas de video: `video_blob`, `video_nombre`, `video_mime`.

## Frontend (web)

- `futbol.html` incluye panel de usuarios con CRUD y tabla.
- Opcion para guardar video o solo datos.
- Nueva biblioteca `futbol_videos.html` con streaming.

## Archivos clave

- `modules/futbol/backend/app.py`
- `modules/futbol/backend/controllers/usuario_controller.py`
- `modules/futbol/backend/controllers/futbol_db_controller.py`
- `modules/futbol/backend/models/futbol_model.py`
- `modules/futbol/backend/models/usuario_model.py`
- `integration/web/futbol.html`
- `integration/web/futbol_videos.html`
- `integration/web/js/registro_futbol.js`
- `integration/web/js/futbol_videos.js`
- `scripts/init_db.sql`

## Pendiente / recomendaciones

- Ejecutar `scripts/init_db.sql` para crear/migrar la tabla `golpes_futbol`.
- Verificar que el backend futbol (puerto 5002) esta activo antes de usar la biblioteca.
