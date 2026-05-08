# Modulo futbol

## Objetivo

Analizar la tecnica de golpeo de balon a partir de video, usando landmarks corporales,
y proporcionar analitica avanzada (curvas, fases, fatiga, tendencia, alertas).

> Documento detallado de la extension analitica:
> [`modules/futbol/ANALITICA_AVANZADA.md`](../modules/futbol/ANALITICA_AVANZADA.md)

## Flujo de datos

```
Video (movil o galeria)
      -> MediaPipe PoseLandmarker (backend)
      -> Pipeline de servicios:
            impacto_service        (frame de impacto + velocidad pie)
            cinematico_service     (curvas + fases + velocidades articulares)
            apoyo_service          (estabilidad tronco/apoyo, asimetria)
            interpretacion_service (alertas + clasificacion)
      -> API REST (JSON)
      -> Frontend: panels + Chart.js + overlay landmarks (cliente)
```

## Metricas

### Basicas (por frame de referencia)
- Angulo de cadera, rodilla y tobillo de la pierna de golpeo.
- Identificacion de pierna de apoyo y pierna de golpeo.
- Estabilidad del tronco (variacion del centro de hombros).
- Confianza de deteccion.

### Avanzadas (pipeline completo)
- `velocidad_pie_ms` y `frame_impacto` (pico de velocidad horizontal del tobillo).
- Curvas frame a frame de cadera/rodilla/tobillo.
- 4 fases del gesto: aproximacion, armado, impacto, follow-through.
- Velocidades articulares (°/s) con pico por articulacion.
- Estabilidad temporal del tronco y de la pierna de apoyo.
- Asimetria postural (% diferencia entre lado izq/der).
- 7 alertas tecnicas y clasificacion heuristica del golpeo.

## Usuarios y guardado

- CRUD de usuarios compartido con el resto del proyecto (tabla `usuarios_futbol`).
- El analisis del golpeo puede guardarse en BD cuando se selecciona un usuario.
- El video es opcional: se puede guardar solo los datos o datos + video.
- Persistencia adicional: `curvas_json`, `landmarks_json`, `alertas_json`.

## API REST (futbol)

### Usuarios

- `GET /api/usuarios_futbol` -> Lista usuarios (soporta paginado con `paginado=1`).
- `POST /api/usuarios_futbol` -> Crea usuario.
- `GET|PUT|DELETE /api/usuarios_futbol/<id>` -> CRUD completo.

### Golpeos (analisis)

- `POST /api/futbol/analizar` -> Analiza video y opcionalmente guarda en BD.
  Devuelve metricas basicas + `curvas`, `fases`, `velocidades_articulares`,
  `apoyo`, `tronco_temporal`, `alertas`, `clasificacion`, `observaciones`.
- `POST /api/futbol/video-anotado` -> Devuelve MP4 con overlay (esqueleto,
  angulos, banner de impacto, trayectoria del pie). Recalcula si no se pasa
  `frame_impacto` ni `pierna_golpeo`.
- `GET /api/golpeos` -> Lista golpeos.
- `GET /api/golpeos/<id>` -> Obtiene golpeo.
- `GET /api/golpeos/<id>/curvas` -> Curvas angulares por frame.
- `GET /api/golpeos/<id>/landmarks` -> Landmarks por frame (visor).
- `GET /api/golpeos/<id>/alertas` -> Alertas almacenadas.
- `DELETE /api/golpeos/<id>` -> Elimina golpeo.

### Analitica por jugador

- `GET /api/usuarios_futbol/<id>/fatiga?metrica=velocidad_pie_ms`
  -> Fatiga intra-sesion (ventana 2h). Devuelve pendiente y caida %.
- `GET /api/usuarios_futbol/<id>/tendencia?metrica=&semanas=4`
  -> Regresion lineal sobre historial. Estado: mejorando | estancado | empeorando.
- `GET /api/usuarios_futbol/<id>/comparativa?n=4`
  -> Ultimas N patadas con metricas clave.

### Videos

- `GET /api/videos` -> Biblioteca de videos guardados (filtro `id_usuario`).
- `GET /api/videos/<id>/stream` -> Streaming del video guardado.

## Base de datos

Tabla `golpes_futbol` (migraciones idempotentes en
[`scripts/init_db.sql`](../scripts/init_db.sql)):

Columnas base:
- `id_golpeo`, `id_usuario` (FK), `angulo_cadera_deg`, `angulo_rodilla_deg`, `angulo_tobillo_deg`.
- `estabilidad_tronco`, `pierna_golpeo`, `pierna_apoyo`, `confianza`, `metodo_origen`, `fecha_golpeo`.
- `video_blob`, `video_nombre`, `video_mime` para almacenamiento opcional de video.

Columnas de la analitica avanzada:
- `velocidad_pie_ms` DECIMAL(6,2), `frame_impacto` INT, `clasificacion` VARCHAR(50).
- `curvas_json` JSON, `landmarks_json` JSON, `alertas_json` JSON.

## Interpretacion y alertas

Codigos heuristicos generados por `interpretacion_service`:

| Codigo                | Condicion                              | Severidad |
| --------------------- | -------------------------------------- | --------- |
| `rodilla_extendida`   | angulo rodilla > 165° en impacto       | media     |
| `armado_corto`        | angulo cadera < 130° antes del impacto | media     |
| `tronco_inestable`    | score estabilidad tronco < 60          | alta      |
| `apoyo_inestable`     | score apoyo < 50                       | alta      |
| `postura_asimetrica`  | asimetria > 15 %                       | media     |
| `velocidad_pie_baja`  | velocidad pie < 8 m/s                  | media     |
| `deteccion_baja`      | confianza < 0.6                        | baja      |

Clasificacion del golpeo:
`fatigado | asimetrico | inestable | tecnico_lento | potente_estable | equilibrado`.

## Landmarks en vivo y reproduccion local

El frontend de futbol incluye un overlay en tiempo real (camara) y una previsualizacion
del video analizado con los landmarks del cuerpo y una deteccion heuristica del balon
(modulo [`integration/web/js/futbol_landmarks.js`](../integration/web/js/futbol_landmarks.js)):

- Se usa MediaPipe PoseLandmarker en el navegador (cargado por CDN) para dibujar la
  pose por frame, con delegate GPU.
- El balon se estima por movimiento entre frames (diferencia de imagen) en un canvas
  reducido a 160 px de ancho, con throttling 1/2 frames y suavizado temporal `α=0.6`.
- La heuristica se guia por los pies (landmarks 27, 28, 31, 32) cuando estan
  disponibles para descartar movimientos lejanos al jugador.
- La previsualizacion local no modifica el pipeline del backend; es solo overlay visual.
- API expuesta: `window.futbolLandmarksPreview.setVideoBlob(blob)` y `.reset()`.

Limitaciones conocidas:

- La deteccion del balon depende de luz, fondo y contraste.
- Si hay mucho movimiento en escena, la heuristica puede perder precision.
- En dispositivos lentos, el overlay puede ir a menos FPS para mantener fluidez.
- El modelo se descarga del CDN de Google (igual que en `salto`); requiere conexion la
  primera vez.

## Robustez del frontend

`integration/web/js/futbol.js` aplica:

- **Anti-race**: contador `analisisSeq` que descarta resultados/errores de analisis
  obsoletos cuando el usuario lanza varios consecutivos.
- **Reset de preview** en cada nuevo analisis (`futbolLandmarksPreview.reset()`).
- **Try/finally** en el handler del input file para que el `value = ''` siempre se
  ejecute aunque el analisis falle (permite reseleccionar el mismo archivo).
- **Gestion de instancias Chart.js**: cada grafico se destruye antes de recrearse para
  evitar leaks.

## Ampliaciones futuras

- Seguimiento avanzado del balon con modelo dedicado (mejor que heuristica).
- Visor 3D de landmarks (reutilizar componente del modulo `salto`).
- Calibracion de `altura_real_m` por usuario (ahora 1.70 m por defecto).
- Tests unitarios para `analitica_service` y `cinematico_service`.
- Persistir `velocidades_articulares` para consultas historicas detalladas.

