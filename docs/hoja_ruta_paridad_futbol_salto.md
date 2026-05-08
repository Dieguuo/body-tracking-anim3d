# Hoja de ruta: paridad funcional Futbol ↔ Salto

**Rama activa:** `modulo-futbol`  
**BD unificada:** `bd_anim3d` ✅ aplicada  
**Última revisión:** 2026-05-06

---

## Objetivo

Llevar el módulo de futbol al mismo nivel de producto que el módulo de salto en:

- Cobertura funcional de backend y frontend.
- Profundidad de analítica (adaptada a tiros con balón, no a saltos).
- Calidad de UX (flujo de usuario, tablas, comparativas, visualización).
- Robustez operativa (validaciones, cache, consistencia API, CORS, errores).

---

## Estado actual verificado en código

### Lo que ya funciona en Futbol ✅

- Análisis de golpeo: ángulos, estabilidad, velocidad pie, frame impacto, clasificación.
- Guardado de golpeos y vídeo en BD; biblioteca con stream y seek.
- CRUD de usuarios con validación completa de `altura_m`.
- BD unificada — usuario creado en futbol visible en salto y viceversa.
- Fatiga intra-sesión, tendencia básica y comparativa de últimas 4 patadas.
- Cache-busting `?v=20260506c` en `futbol.html` y `salto.html`.
- `registro.js` apunta al backend de salto (`/api/usuarios`); ya no depende del backend de futbol.

### Brechas confirmadas

| # | Severidad | Área | Detalle |
|---|-----------|------|---------|
| B1 | 🔴 Roto | API frontend | `api_futbol.js` llama `/api/usuarios_futbol/<id>/fatiga\|tendencia\|comparativa` (rutas inline en `app.py`). El `usuario_controller.py` de futbol no expone esos paths bajo `/api/usuarios/<id>/...` — funciona por el blueprint legacy, romperá si se limpia `app.py` |
| B2 | 🔴 Ausente | Backend | No existe `PUT /api/golpeos/<id>` — imposible corregir un golpeo guardado |
| B3 | 🔴 Ausente | Backend | `usuario_controller.py` de futbol solo tiene `/api/usuarios/<id>/golpeos`; faltan `fatiga`, `tendencia`, `comparativa`, `alertas_tendencia`, `analitica_avanzada` |
| B4 | 🟡 Parcial | Servicios | `analitica_service.py` de futbol tiene solo 3 funciones básicas; salto tiene 10+ (asimetría, correlaciones, estancamiento, predicción, rankings) |
| B5 | 🟡 Ausente | Modelo | `futbol_model.py` no tiene `obtener_historial_analitica_usuario()` ni `obtener_historial_analitica_global()` que necesita el panel avanzado |
| B6 | 🟡 Ausente | Frontend | `futbol.html` no tiene panel de analítica avanzada (correlaciones, alertas inter-sesión, ranking de sesiones, predicción) |
| B7 | 🟢 Menor | Frontend | `futbol_videos.html` scripts sin `?v=...` cache-busting |
| B8 | 🟢 Deuda | Backend | Rutas de analítica legacy viven en `app.py` junto con la lógica de análisis; deberían estar en blueprints |

---

## Principios de implementación

1. No romper lo que ya funciona — compatibilidad temporal antes de deprecar.
2. Priorizar consistencia de contrato API entre módulos.
3. Reducir rutas legacy en lugar de ampliar deuda técnica.
4. Cada fase termina con pruebas manuales y criterios de aceptación claros.

---

## Fase 0 — Base estable y observabilidad

**Estado:** ✅ completado  
**Esfuerzo estimado:** 0,5 día

### Tareas

| Tarea | Archivo | Estado |
|-------|---------|--------|
| `setUsuarioActivo` no se llama en cada repintado de fila | `registro.js`, `registro_futbol.js` | ✅ hecho |
| `crearUsuario` devuelve siempre `id_usuario` numérico | `registro.js` | ✅ hecho |
| `id_usuario` se envía como número en `formData`, no como objeto | `api_salto.js` | ✅ hecho |
| `actualizarUsuario(id, data)` firma correcta en `registro.js` | `registro.js` | ✅ hecho |
| Cache-busting `?v=...` en `futbol_videos.html` | `futbol_videos.html` | ✅ hecho |
| Logs estructurados backend: alta/edición/eliminación usuario | `usuario_controller.py` (futbol) | ✅ hecho |
| Logs estructurados backend: guardado golpeo + fallos BD | `futbol_db_controller.py` | ✅ hecho |

### Criterio done

- Crear usuario desde futbol y desde salto lo refleja en ambas tablas UI.
- Analizar un vídeo con usuario activo no produce errores en consola ni en backend.
- En logs backend se identifica la causa de cualquier error en menos de 1 minuto.

---

## Fase 1 — Paridad de contrato API

**Estado:** no iniciado  
**Esfuerzo estimado:** 1,5 días

### 1.1 — Mover analítica base al `usuario_controller.py` de futbol

Añadir endpoints en `modules/futbol/backend/controllers/usuario_controller.py`:

```
GET /api/usuarios/<id>/fatiga
GET /api/usuarios/<id>/tendencia
GET /api/usuarios/<id>/comparativa
```

Eliminar esas rutas de `app.py` (actualmente inline bajo `/api/usuarios_futbol/<id>/...`).

### 1.2 — Actualizar `api_futbol.js`

```js
// Antes:
`/api/usuarios_futbol/${id}/fatiga`
// Después:
`/api/usuarios/${id}/fatiga`
```

Aplicar el mismo cambio a `tendencia` y `comparativa`.

### 1.3 — Añadir `PUT /api/golpeos/<id>`

En `modules/futbol/backend/controllers/futbol_db_controller.py`, equivalente a `PUT /api/saltos/<id>` de salto.  
Campos editables: `pierna_golpeo`, `metodo_origen`, notas. No permite editar métricas calculadas por IA.

### 1.4 — Verificar alineación de respuesta paginada

`/api/usuarios_futbol` legacy devuelve `{ usuarios, total }`.  
`/api/usuarios` devuelve `{ items, total, limit, offset, has_more }`.  
Comprobar que ningún path de frontend consume el formato antiguo.

### Criterio done

- Todos los endpoints de analítica de futbol están en `usuario_controller.py`.
- `app.py` solo contiene `analizar_golpeo`, `video_anotado` y arranque.
- `api_futbol.js` no referencia ninguna ruta `/api/usuarios_futbol/<id>/...`.
- `PUT /api/golpeos/<id>` responde 200 con el golpeo actualizado.

---

## Fase 2 — Analítica avanzada backend

**Estado:** no iniciado  
**Esfuerzo estimado:** 2,5 días

### 2.1 — Ampliar `futbol_model.py`

```python
def obtener_historial_analitica_usuario(self, id_usuario: int, limit: int = 200) -> list[dict]:
    """Golpeos ordenados ASC para analítica temporal (sin landmarks/curvas)."""

def obtener_historial_analitica_global(self, limit: int = 500) -> list[dict]:
    """Todos los golpeos para correlaciones y rankings globales."""
```

### 2.2 — Ampliar `analitica_service.py` de futbol

Adaptar de `salto/backend/services/analitica_service.py` con métricas de golpeo:

| Función en salto | Equivalente en futbol | Métrica principal |
|---|---|---|
| `calcular_alertas_tendencia` | `calcular_alertas_tendencia_golpeo` | `velocidad_pie_ms` |
| `calcular_evolucion_asimetria` | `calcular_evolucion_pierna_dominante` | ratio pierna_golpeo vs apoyo |
| `calcular_comparativa_sesiones` | `calcular_comparativa_sesiones_golpeo` | velocidad + estabilidad + ángulos |
| `calcular_correlaciones` | `calcular_correlaciones_golpeo` | velocidad↔estabilidad, cadera↔clasificación |
| `detectar_estancamiento_mejora` | igual (reutilizable) | `velocidad_pie_ms` |
| `ranking_mejores_sesiones` | `ranking_sesiones_golpeo` | score compuesto (ver Fase 4) |
| `prediccion_multivariable` | `prediccion_velocidad_golpeo` | regresión lineal, horizonte 4 semanas |

### 2.3 — Nuevos endpoints en `usuario_controller.py` de futbol

```
GET /api/usuarios/<id>/alertas_tendencia
GET /api/usuarios/<id>/analitica_avanzada
```

Estructura del payload de `analitica_avanzada`:

```json
{
  "id_usuario": 1,
  "alias": "jugador1",
  "estado": "mejorando",
  "alertas_tendencia": [...],
  "comparativa_sesiones": {...},
  "correlaciones": {...},
  "estancamiento_mejora": {...},
  "rankings": { "top_sesiones": [...] },
  "prediccion": { "semanas": 4, "valores": [...] }
}
```

### Criterio done

- `GET /api/usuarios/1/analitica_avanzada` devuelve todos los bloques sin error para un usuario con ≥4 golpeos.
- `GET /api/usuarios/1/alertas_tendencia` devuelve lista (puede ser vacía) sin error.

---

## Fase 3 — Paridad UX en `futbol.html`

**Estado:** no iniciado  
**Esfuerzo estimado:** 2,5 días

### 3.1 — Panel analítica avanzada

Añadir en `futbol.html` tras el panel de comparativa actual (oculto hasta ≥4 golpeos):

```
[Panel analítica avanzada]
  ├── Badge estado: "Mejorando" / "Estancado" / "Empeorando"
  ├── Alertas de tendencia (lista desplegable)
  ├── Correlaciones clave (2-3 frases interpretadas)
  ├── Ranking de sesiones (tabla top-5 por score compuesto)
  └── Predicción 4 semanas (gráfico Chart.js — línea + banda de confianza)
```

### 3.2 — Modo comparativa consecutiva in-session

Al guardar el golpeo N (N≥2 en la misma sesión), activar tabla comparativa inline de los últimos N intentos de la sesión, equivalente conceptual al de salto entre intentos.

### 3.3 — Cache-busting `futbol_videos.html`

```html
<script src="js/config.js?v=20260506c"></script>
<script src="js/api_futbol.js?v=20260506c"></script>
<script src="js/futbol_videos.js?v=20260506c"></script>
```

### Criterio done

- Un jugador con 6 tiros ve estado, tendencia, alertas y comparativa sin leer documentación.
- El panel avanzado no aparece si hay menos de 4 golpeos (mensaje informativo).

---

## Fase 4 — Calidad del modelo de dominio futbol

**Estado:** no iniciado  
**Esfuerzo estimado:** 1,5 días

### 4.1 — Score compuesto de tiro (0–100)

Añadir en `modules/futbol/backend/config.py`:

```python
SCORE_PESOS_GOLPEO = {
    "velocidad_pie_ms":   0.35,
    "estabilidad_tronco": 0.25,
    "angulo_rodilla_deg": 0.20,   # proximidad al óptimo ~90°
    "confianza_ia":       0.20,
}
```

Calcular y persistir en `gestos_futbol.score_compuesto` al guardar cada golpeo.

### 4.2 — Normalizar clasificaciones

Mapear la salida de la IA a un ENUM estable antes de persistir en `gestos_futbol.clasificacion`:

```
tecnica_estable | potencia_alta | potencia_baja | riesgo_lesion | desconocido
```

Implementar en `biomecanica_service.py` con tabla de mapeo configurable.

### 4.3 — Curvas/landmarks bajo demanda (ya parcialmente hecho)

Confirmar que `GET /api/golpeos/<id>` **no incluye** curvas ni landmarks por defecto.  
Los endpoints `/curvas` y `/landmarks` ya existen; verificar que `guardar_golpeo` no infla el payload de retorno.

### Criterio done

- Misma entrada de vídeo produce la misma clasificación en ejecuciones distintas.
- `score_compuesto` aparece en la respuesta del análisis y en el historial del usuario.
- `GET /api/golpeos/<id>` no incluye curvas/landmarks si no se piden explícitamente.

---

## Fase 5 — Cierre de deuda técnica y documentación

**Estado:** ✅ completado (2026-05-07)  
**Esfuerzo estimado:** 1 día

| Tarea | Detalle | Estado |
|-------|---------|--------|
| Limpiar `app.py` de futbol | Solo `analizar_golpeo`, `video_anotado` y arranque. Todo lo demás en blueprints | ✅ |
| Deprecar `/api/usuarios_futbol` | Cabeceras `Deprecation` + `Sunset: 2026-08-01` + `Link` en CRUD y analítica legacy. Logs `[USUARIOS_FUTBOL]`. Paginación y validaciones alineadas al canónico | ✅ |
| `modules/futbol/README.md` | Actualizado al esquema unificado, rutas legacy y `FEATURES_VERSION` | ✅ |
| `scripts/README_BBDD_UNIFICADA.md` | Cubre `migrate_features_version.sql` y `usuarios_futbol_controller` | ✅ |
| Helper compartido `window.UsuarioActivo` | `integration/web/js/usuario_activo.js` consumido por futbol/salto | ✅ |
| Versionado de features | `config.FEATURES_VERSION` + columna `gestos_futbol.features_version` + migración idempotente | ✅ |
| Checklist de regresión cruzada | `docs/checklist_regresion_cruzada_futbol_salto.md` | ✅ |

### Criterio done

- Documentación de futbol refleja 1:1 lo que el backend realmente expone.
- Nuevo miembro del equipo puede levantar y validar ambos módulos en < 1 hora.
- `app.py` de futbol tiene menos de 80 líneas.

---

## Matriz de pruebas mínima

### Usuarios (obligatorias antes de cualquier merge)

```
✓ Crear usuario desde futbol → visible en tabla de salto.html
✓ Crear usuario desde salto  → visible en tabla de futbol.html
✓ Editar alias/altura en un módulo → refleja en el otro
✓ Eliminar usuario → sin golpeos/saltos huérfanos en BD
```

### Análisis futbol

```
✓ Análisis en vivo con usuario activo → golpeo guardado, id_usuario correcto en BD
✓ Subida de vídeo con usuario activo → id_usuario correcto, reproducción en biblioteca OK
✓ Sin usuario activo → mensaje claro en UI, no 500 ni spinner infinito
✓ id_usuario inválido → 400/404 con mensaje, sin stacktrace expuesto
```

### Analítica

```
✓ Usuario con < 4 golpeos → panel avanzado oculto o mensaje "faltan datos"
✓ Usuario con ≥ 4 golpeos → /analitica_avanzada responde 200 con todos los bloques
✓ /alertas_tendencia responde 200 (lista puede ser vacía)
✓ /fatiga, /tendencia, /comparativa responden 200
```

### Robustez

```
✓ CORS desde https://localhost:8443 y http://localhost:8080
✓ Backend caído → mensaje legible en UI en < 3 segundos
✓ Archivo de vídeo > MAX_UPLOAD_MB → 413 con mensaje claro
```

---

## Plan de ejecución (2–3 semanas)

```
Semana 1
  ├── Fase 0: cache-busting + logs estructurados         0,5 día
  ├── Fase 1: rutas limpias + PUT /api/golpeos/<id>      1,5 días
  └── Validación cruzada futbol↔salto                    0,5 día

Semana 2
  ├── Fase 2: servicios analíticos avanzados backend     2,5 días
  └── Fase 3.1–3.2: panel avanzado UI + comparativa      2 días

Semana 3
  ├── Fase 3.3: cache-busting futbol_videos              0,5 día
  ├── Fase 4: score compuesto + clasificaciones          1,5 días
  ├── Fase 5: limpieza + documentación                   1 día
  └── Regresión final completa                           0,5 día
```

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Cambio de contrato rompe integraciones actuales | Mantener ruta legacy con `Deprecation` header durante 30 días antes de eliminar |
| Payloads grandes de landmarks sobrecargan frontend | Respuesta resumida por defecto; curvas/landmarks solo bajo endpoint específico |
| Divergencia futura entre módulos | Contrato compartido documentado en `README_BBDD_UNIFICADA.md`; checklist de regresión obligatorio |
| Score compuesto inestable por cambios de modelo IA | Versionar pesos en `config.py`; score recalculable on-demand sin regrabar vídeo |

---

## Entregables al finalizar

- Módulo futbol con paridad funcional real respecto a salto (adaptada a tiros con balón).
- API consistente entre módulos: mismo contrato de usuarios, paginación y analítica.
- UI coherente: paneles, estados y comparativas comparables entre módulos.
- `app.py` de futbol limpio y blueprints completos.
- Documentación actualizada y checklist de regresión operativo.
