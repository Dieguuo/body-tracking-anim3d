# Checklist de regresión cruzada — Módulos Fútbol & Salto

> **Objetivo:** Validar que los cambios en un módulo no rompen al otro tras la
> unificación del esquema (`bd_anim3d`), del helper de usuario activo
> (`window.UsuarioActivo`) y de los contratos REST canónicos (`/api/usuarios`).

Versión: 2026-05-06 · Aplicar al menos antes de cada release y tras cualquier
cambio en `models/db.py`, `controllers/usuario_controller.py`, `init_db_unificada.sql`,
`integration/web/js/usuario_activo.js`, `integration/web/js/registro*.js`,
`config.py :: FEATURES_VERSION` o el endpoint `/api/usuarios_futbol/*`.

---

## 0. Preparación

- [ ] Backend `salto` arrancando en :5000 sin errores en consola
- [ ] Backend `futbol` arrancando en :5002 sin errores en consola
- [ ] BD `bd_anim3d` accesible; tablas `usuarios`, `gestos`, `gestos_futbol`,
      `gestos_salto`, `gestos_curvas`, `gestos_alertas`, `gestos_videos` presentes
- [ ] Vista `v_golpeos` incluye columna `features_version`
- [ ] Migración `scripts/migrate_features_version.sql` aplicada (si BD pre-existente)

## 1. Usuario activo compartido (frontend)

- [ ] Registrar un usuario nuevo desde `salto.html` → `sessionStorage.idUser` se rellena
- [ ] Abrir `futbol.html` en otra pestaña → reconoce automáticamente el mismo usuario
- [ ] `window.UsuarioActivo.obtener()` devuelve `{idUsuario, alias, alturaM, ...}` en ambos módulos
- [ ] Eliminar usuario activo desde `salto.html` también lo despeja en `futbol.html` (tras refrescar)
- [ ] Cambiar usuario activo en `futbol.html` no rompe `getUsuarioActivo()` de `api_salto.js`

## 2. CRUD canónico vs. legacy

- [ ] `GET /api/usuarios` (sin params) → array de usuarios
- [ ] `GET /api/usuarios?paginado=1&limit=10` → objeto con `items`, `total`, `has_more`
- [ ] `GET /api/usuarios_futbol?paginado=1&limit=10` → objeto con **ambos** `usuarios` e `items`
      (compatibilidad legacy + canónica)
- [ ] Respuestas de `/api/usuarios_futbol/*` incluyen cabeceras:
  - `Deprecation: version="2026-08-01"`
  - `Sunset: Sat, 01 Aug 2026 00:00:00 GMT`
  - `Link: </api/usuarios>; rel="successor-version"`
- [ ] Crear usuario duplicado por alias → `409 Conflict` con mensaje claro
- [ ] Logs del servidor muestran `[USUARIO] Alta:`, `[USUARIO] Edicion:`, `[USUARIO] Eliminacion:`

## 3. Persistencia de gestos (esquema unificado)

- [ ] Procesar un golpeo desde `futbol.html`:
  - [ ] Inserta fila en `gestos` con `modulo='futbol'`
  - [ ] Inserta fila en `gestos_futbol` con `features_version='v1'` (o el valor actual de `FEATURES_VERSION`)
  - [ ] Si hay alertas, fila(s) en `gestos_alertas`
- [ ] Procesar un salto desde `salto.html`:
  - [ ] Inserta fila en `gestos` con `modulo='salto'`
  - [ ] Inserta fila en `gestos_salto`
- [ ] `SELECT COUNT(*) FROM v_golpeos WHERE id_usuario = <test>;` coincide con golpeos creados

## 4. Analítica e independencia de módulos

- [ ] `GET /api/usuarios/<id>/fatiga?metrica=velocidad_pie_ms` (futbol) responde 200
- [ ] `GET /api/usuarios/<id>/tendencia?metrica=velocidad_pie_ms` responde 200
- [ ] `GET /api/usuarios/<id>/comparativa` responde 200 con datos comparativos
- [ ] `GET /api/usuarios/<id>/alertas_tendencia` responde 200
- [ ] `GET /api/usuarios/<id>/analitica_avanzada` responde 200
- [ ] Endpoints equivalentes en `salto` siguen funcionando sin cambios
- [ ] Crear gestos en uno no contamina el otro (filtro por `modulo` correcto)

## 5. Eliminación en cascada

- [ ] Borrar usuario con golpeos asociados → CASCADE limpia `gestos`, `gestos_futbol`,
      `gestos_curvas`, `gestos_alertas`, `gestos_videos`
- [ ] Repetir con un usuario que tenga saltos → CASCADE limpia `gestos_salto`

## 6. UI / UX

- [ ] Toasts de error/éxito coherentes en ambos módulos
- [ ] Panel analítica de fútbol oculta gracefully cuando no hay usuario activo
- [ ] Panel analítica de salto idem
- [ ] Selector de pierna/lado de salto persiste correctamente entre sesiones

## 7. Versionado de features

- [ ] Cambiar `FUTBOL_FEATURES_VERSION=v2` en entorno → nuevos gestos persisten `v2`
- [ ] Gestos antiguos retienen `v1` y siguen apareciendo en analítica
- [ ] (Opcional) Filtrar analítica por `features_version` no rompe nada

## 8. Regresión cuando se modifica un módulo

Tras tocar **fútbol**:
- [ ] Salto sigue arrancando y completa un análisis básico end-to-end
- [ ] Salto sigue listando, creando y borrando usuarios

Tras tocar **salto**:
- [ ] Fútbol sigue arrancando y completa un análisis básico end-to-end
- [ ] Fútbol sigue listando, creando y borrando usuarios

Tras tocar **scripts SQL** o **modelo común**:
- [ ] Re-ejecutar el checklist completo

---

## Resultado

| Sección | Estado | Notas |
|---|---|---|
| 0. Preparación | ☐ | |
| 1. Usuario activo | ☐ | |
| 2. CRUD canónico vs legacy | ☐ | |
| 3. Persistencia gestos | ☐ | |
| 4. Analítica | ☐ | |
| 5. Cascade | ☐ | |
| 6. UI/UX | ☐ | |
| 7. Features version | ☐ | |
| 8. Regresión cruzada | ☐ | |

**Validador:** _____________ · **Fecha:** _____________ · **Commit:** _____________
