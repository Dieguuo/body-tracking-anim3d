# Módulo Fútbol — Analítica Avanzada de Golpeo

Documento de referencia de la extensión analítica del módulo `modules/futbol`,
realizada en 10 fases (F1–F10) para alcanzar la profundidad analítica del
módulo `modules/salto`.

> Asunciones de captura: cámara estática horizontal, jugador en perfil,
> sin tracking del balón (el impacto se infiere por cinemática del pie).

---

## 1. Arquitectura

```
modules/futbol/backend/
├── app.py                        # Flask app (puerto 5002)
├── controllers/
│   └── futbol_controller.py      # Orquesta el pipeline de análisis
├── models/
│   ├── futbol_model.py           # Persistencia MySQL (golpes_futbol)
│   ├── usuarios_futbol_model.py
│   └── video_processor.py        # Extracción de poses (compartido con salto)
├── services/
│   ├── impacto_service.py        # F2 — Detección impacto + velocidad pie
│   ├── cinematico_service.py     # F3 — Curvas, fases, velocidades articulares
│   ├── apoyo_service.py          # F4 — Estabilidad tronco/apoyo, asimetría
│   ├── analitica_service.py      # F5 — Fatiga, tendencia, comparativa
│   ├── interpretacion_service.py # F6 — Alertas, clasificación, observaciones
│   ├── video_anotado_service.py  # F7 — Vídeo overlay (esqueleto + impacto)
│   └── ...                       # biomecanica_service, calculo_service, etc.
└── utils/
    ├── serializers.py            # serializar_row, normalizar_float
    └── session_utils.py          # agrupar_sesiones (compartido con salto)
```

Frontend asociado:
- [integration/web/futbol.html](../../integration/web/futbol.html)
- [integration/web/js/api_futbol.js](../../integration/web/js/api_futbol.js)
- [integration/web/js/futbol.js](../../integration/web/js/futbol.js)

---

## 2. Esquema de base de datos (F1)

Migraciones idempotentes añadidas en [scripts/init_db.sql](../../scripts/init_db.sql):

| Columna             | Tipo          | Descripción                             |
| ------------------- | ------------- | --------------------------------------- |
| `velocidad_pie_ms`  | DECIMAL(6,2)  | Velocidad del pie en el impacto (m/s)   |
| `frame_impacto`     | INT           | Índice del frame de máxima velocidad    |
| `clasificacion`     | VARCHAR(50)   | Etiqueta heurística del golpeo          |
| `curvas_json`       | JSON          | Curvas angulares por frame              |
| `landmarks_json`    | JSON          | Landmarks por frame (visor)             |
| `alertas_json`      | JSON          | Lista de alertas técnicas               |

Cada `ALTER` usa `INFORMATION_SCHEMA.COLUMNS` + `PREPARE/EXECUTE`, por lo que
es seguro ejecutarlo múltiples veces.

---

## 3. Servicios de análisis

### F2 — `impacto_service.py`
- `detectar_pierna_golpeo_apoyo(frames) → (pierna_g, pierna_a, idx_impacto, vel_pico)`
  La pierna con mayor pico de velocidad horizontal del tobillo es la pierna de
  golpeo; ese frame es el de impacto.
- `calcular_velocidad_pie(frames, idx_impacto, pierna_golpeo, fps, altura_real_m=1.70)`
  Aproxima m/s a partir de píxeles usando la altura visible del jugador
  (`hombro→tobillo × 1.45`).

### F3 — `cinematico_service.py`
- `calcular_curvas_angulares(frames, pierna_golpeo)` → ángulos de **cadera,
  rodilla y tobillo** suavizados frame a frame.
- `detectar_fases(curvas, idx_impacto)` → 4 fases:
  `aproximacion → armado → impacto → follow_through`.
- `calcular_velocidades_articulares(curvas, fps)` → derivada (°/s) + pico de
  cada articulación.

### F4 — `apoyo_service.py`
- `estabilidad_tronco_temporal(frames, ancho)` → oscilación lateral del
  centro de hombros (% y score 0–100).
- `estabilidad_pierna_apoyo(frames, pierna_apoyo, idx_impacto)` → variación
  angular de la rodilla de apoyo en ventana ±10 frames.
- `asimetria_postura(frames)` → diferencia media (%) entre lado izq/der.

### F5 — `analitica_service.py`
Constantes: `CAIDA_SIGNIFICATIVA_PCT = 10.0`, `UMBRAL_ESTANCADO_MS_SEMANA = 0.05`.

- `calcular_fatiga_intra_sesion(golpeos_asc, metrica="velocidad_pie_ms")`
  Sesión = ventana de 2h (vía `agrupar_sesiones`). Devuelve pendiente y caída %.
- `calcular_tendencia(golpeos_asc, semanas_prediccion=4, metrica=...)`
  Regresión lineal pura (sin numpy). Estado: `mejorando | estancado | empeorando`.
- `calcular_comparativa(golpeos_desc, n=4)` — últimas N patadas.

### F6 — `interpretacion_service.py`
- `generar_alertas_golpeo(metricas)` — 7 códigos:
  `rodilla_extendida` (>165°), `armado_corto` (cadera<130°), `tronco_inestable`
  (<60), `apoyo_inestable` (<50), `postura_asimetrica` (>15%),
  `velocidad_pie_baja` (<8 m/s), `deteccion_baja` (confianza<0.6).
- `clasificar_golpeo(metricas, alertas, fatiga_significativa)` →
  `fatigado | asimetrico | inestable | tecnico_lento | potente_estable | equilibrado`.
- `generar_observaciones(metricas, alertas)` — frases en lenguaje natural.

### F7 — `video_anotado_service.py`
Genera MP4 con OpenCV: esqueleto (33 landmarks, 16 conexiones), 4 ángulos
articulares (RI/RD/CI/CD), banner amarillo de IMPACTO, trayectoria naranja
del tobillo de golpeo.

---

## 4. Controlador y modelo (F8)

### `FutbolController.procesar_golpeo(ruta_video, incluir_landmarks=False)`
Orquesta el pipeline completo y devuelve un dict con:
`frame_impacto`, `velocidad_pie_ms`, `velocidad_pie_px_s`, `altura_jugador_px`,
`fps`, `ancho`, `alto`, `total_frames`, `curvas`, `fases`,
`velocidades_articulares`, `apoyo`, `tronco_temporal`, `asimetria_postura_pct`,
`alertas`, `clasificacion`, `observaciones`, `_landmarks_frames` (clave privada
para persistencia).

### `FutbolModel`
- Persiste las columnas nuevas condicionalmente (sólo si existen en la tabla).
- `_obtener_columna_json(id, columna)` — helper unificado para
  `obtener_curvas / landmarks / alertas`.
- `_listar_por_usuario(id, orden)` — base común para listados ASC/DESC.
- `_parse_json(raw)` — robusto a `dict | bytes | str`.

---

## 5. API REST (F9)

Base: `http://<host>:5002`

| Método | Endpoint                                            | Descripción                                                |
| ------ | --------------------------------------------------- | ---------------------------------------------------------- |
| POST   | `/api/futbol/analizar`                              | Procesa vídeo y devuelve métricas + curvas + alertas       |
| POST   | `/api/futbol/video-anotado`                         | Devuelve MP4 con overlay (recalcula si faltan parámetros)  |
| GET    | `/api/golpeos/<id>/curvas`                          | Curvas angulares por frame                                 |
| GET    | `/api/golpeos/<id>/landmarks`                       | Landmarks por frame                                        |
| GET    | `/api/golpeos/<id>/alertas`                         | Alertas almacenadas                                        |
| GET    | `/api/usuarios_futbol/<id>/fatiga?metrica=`         | Fatiga intra-sesión (última)                               |
| GET    | `/api/usuarios_futbol/<id>/tendencia?metrica=&semanas=` | Tendencia histórica + regresión                       |
| GET    | `/api/usuarios_futbol/<id>/comparativa?n=`          | Últimas N patadas                                          |

Helpers internos en `app.py`: `_validar_usuario(id)` y
`_golpeos_serializados(id, orden)`.

---

## 6. Frontend (F10)

### [futbol.html](../../integration/web/futbol.html)
- Carga **Chart.js 4.4.0** vía CDN.
- Nuevas data-boxes: `data-velocidad-pie`, `data-frame-impacto`,
  `data-asimetria`, `data-apoyo-score`, `data-clasificacion`.
- Nuevos paneles (`display:none` por defecto):
  `panel-fases`, `panel-alertas`, `panel-curvas`, `panel-velocidades`,
  `panel-analitica`, `panel-acciones`.

### [api_futbol.js](../../integration/web/js/api_futbol.js)
Funciones añadidas:
- `obtenerCurvasGolpeo(id)`, `obtenerLandmarksGolpeo(id)`, `obtenerAlertasGolpeo(id)`
- `obtenerFatigaUsuarioFutbol(id, metrica)`
- `obtenerTendenciaUsuarioFutbol(id, metrica, semanas)`
- `obtenerComparativaUsuarioFutbol(id, n)`
- `generarVideoAnotadoFutbol(videoBlob, opciones)` — devuelve `Blob` (no JSON).

### [futbol.js](../../integration/web/js/futbol.js)
- `pintarResultados(data)` extendido con todas las nuevas métricas.
- `pintarFases`, `pintarAlertas`, `pintarCurvas`, `pintarVelocidades` —
  renderizan los nuevos paneles. Las gráficas Chart.js se destruyen antes de
  recrearse para evitar leaks.
- `cargarAnaliticaUsuario(idUsuario)` — invoca los 3 endpoints analíticos en
  paralelo y rellena la tabla comparativa.
- `generarYMostrarVideoAnotado()` — usa el `Blob` del último vídeo analizado.
- `ultimoVideoBlob` y `ultimoResultado` viven en el scope del módulo.

---

## 7. Refactors aplicados (revisión final)

| Lugar                   | Antes                                             | Después                                  |
| ----------------------- | ------------------------------------------------- | ---------------------------------------- |
| `futbol_model.py`       | 3 métodos `obtener_curvas/landmarks/alertas` casi idénticos | `_obtener_columna_json(id, col)` |
| `futbol_model.py`       | 2 métodos `obtener_por_usuario[_ordenado_asc]` con SQL duplicado | `_listar_por_usuario(id, orden)` |
| `app.py`                | 3 endpoints repetían validación + fetch + serialize | Helpers `_validar_usuario`, `_golpeos_serializados` |
| `impacto_service.py`    | Comentario decía "mediana" pero usaba `max`       | Comentario corregido (comportamiento sin cambios) |

---

## 8. Validación

Pipeline end-to-end ejecutado con datos sintéticos (30 frames, patada con
pierna derecha entre frames 14–18):

| Métrica                | Valor                                       |
| ---------------------- | ------------------------------------------- |
| Pierna golpeo          | derecha                                     |
| Frame impacto          | 14                                          |
| Velocidad del pie      | 6.1 m/s (px/s = 1560)                       |
| Altura jugador (px)    | 435                                         |
| Fases detectadas       | aproximacion, armado, impacto, follow_through |
| Pico vel. rodilla      | 220.3 °/s en frame 14                       |
| Estabilidad tronco     | score 100 (oscilación 0%)                   |
| Estabilidad apoyo      | score 100                                   |
| Asimetría              | 0.0%                                        |
| Alertas                | rodilla_extendida, armado_corto, tronco_inestable, velocidad_pie_baja, deteccion_baja |
| Clasificación          | inestable                                   |
| Fatiga (4 golpeos)     | significativa, caída 25%                    |
| Tendencia              | empeorando (R² = 0.95)                      |

---

## 9. Próximos pasos sugeridos

- Visor 3D de landmarks (reutilizar componente del módulo `salto`).
- Calibrar `altura_real_m` por usuario en lugar del default 1.70.
- Añadir tests unitarios para `analitica_service` y `cinematico_service`.
- Persistir `velocidades_articulares` para consultas históricas detalladas.
