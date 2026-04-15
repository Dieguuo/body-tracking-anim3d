# Flujo de datos

## Módulo 1 — Sensor de distancia

### Paso a paso

1. **Arduino** genera un pulso en `trigPin (9)` y mide el eco en `echoPin (10)`.
2. Realiza **5 mediciones**, calcula la media y descarta valores fuera de 2–400 cm.
3. Envía por serial:
   ```
   Distancia: 23.45 cm
   ```
4. **`SensorSerial.leer_linea()`** lee la línea, la decodifica y extrae el número con regex.  
   Devuelve un objeto `Medicion(raw, valor)`.
5. **`DistanciaController._bucle_lectura()`** corre en un hilo daemon y actualiza  
   `_ultima_medicion` de forma thread-safe (con `threading.Lock`).
6. **Flask `GET /distancia`** consulta `get_ultima_medicion()` y responde JSON:
   ```json
   { "valor": 23.45, "unidad": "cm", "raw": "Distancia: 23.45 cm", "timestamp": "2026-03-18T10:30:00+00:00" }
   ```
7. El **frontend** (`integration/web/arduino.html`)
   hace `fetch` al endpoint cada segundo y actualiza el DOM con el valor recibido.

---

## Módulo 2 — Salto (vertical y horizontal)

### Paso a paso

1. El usuario **graba un vídeo** del salto desde el móvil (cámara lateral, cuerpo completo visible).
2. El vídeo se envía al backend como **`POST /api/salto/calcular`** (multipart/form-data).
3. **`VideoProcessor.procesar()`** (Model) abre el vídeo con OpenCV y lo recorre frame a frame:
   - Convierte cada frame a RGB.
   - Lo pasa por **MediaPipe PoseLandmarker** (`num_poses=2`) para obtener 33 landmarks anatómicos.
   - Si se detectan varias poses (ej. persona + reflejo), selecciona la **silueta más grande** (mayor distancia cabeza-pies en píxeles).
   - Extrae las coordenadas (X, Y) de talones y puntas de los pies, más la altura de la persona en píxeles.
   - Devuelve una lista de `FramePies` (un objeto por frame).
4. **`CalculoService`** (Service) recibe la lista de frames y aplica las fórmulas:
   - Primero detecta despegue y aterrizaje: suaviza la señal Y de los talones con **media móvil adaptada al FPS**, calcula un baseline de reposo (mediana de los frames iniciales) y marca como "en aire" los frames donde Y cae por debajo de `baseline - umbral`. El umbral es dinámico por tipo de salto:
     - *Vertical*: `max(1.2, altura_ref × 0.004)` — los pies suben mucho.
     - *Horizontal*: `max(8.0, altura_ref × 0.02)` — umbral más alto para superar el ruido natural de MediaPipe (±5-7 px), evitando confundir micro-variaciones de postura con vuelo real.
   - Se selecciona el segmento de vuelo más significativo (profundidad × duración). Los límites de validación temporal son generosos (5s vertical, 8s horizontal) para tolerar vídeos en slow-motion.
   - **Corrección de slow-motion**: tras detectar la ventana de vuelo, `_detectar_factor_slowmo()` ajusta una parábola a la trayectoria Y de la cadera, compara la aceleración aparente con la gravedad real (9.81 m/s²) y calcula `factor = sqrt(g / g_aparente)`. Si el factor > 1.3, se corrige el FPS: `fps_real = fps_video × factor`. Todos los cálculos posteriores usan `fps_real`.
   - **Salto vertical** (método híbrido): combina dos fórmulas:
     - *Cinemática*: `h = (1/8) × g × t²` (tiempo de vuelo corregido).
     - *Píxeles calibrados*: calibra con `S = Hr / Hp` y mide `(Y_suelo - Y_pico) × S`.
     - Si ambas están disponibles, resultado = promedio ponderado (60 % píxeles, 40 % cinemática).
   - **Salto horizontal**: usa la altura real del usuario para calibrar `S = Hr / Hp` (metros/píxel) y calcula `D_real = Dp × S` con el desplazamiento horizontal en píxeles.
5. **`SaltoController.procesar_salto()`** (Controller) orquesta modelo y servicio, validando los datos de entrada. Si se detecta un salto válido (despegue + aterrizaje), **enriquece** el resultado con análisis avanzado (Fases 6-7) usando el FPS corregido por slow-motion.
6. **Flask `POST /api/salto/calcular`** devuelve JSON:
   ```json
   {
     "tipo_salto": "vertical",
     "distancia": 34.12,
     "unidad": "cm",
     "confianza": 0.98,
     "frame_despegue": 42,
     "frame_aterrizaje": 58,
     "tiempo_vuelo_s": 0.5333,
     "angulo_rodilla_deg": 162.3,
     "angulo_cadera_deg": 171.5,
     "potencia_w": 3182.5,
     "asimetria_pct": 8.3,
     "metodo": "hibrido",
     "factor_slowmo": 1.0,
     "dist_por_pixeles": 36.45,
     "dist_por_cinematica": 30.67,
     "estabilidad_aterrizaje": { "oscilacion_px": 3.45, "tiempo_estabilizacion_s": 0.267, "estable": true },
     "amortiguacion": { "angulo_rodilla_aterrizaje_deg": 155.2, "flexion_maxima_deg": 118.7, "rango_amortiguacion_deg": 36.5, "alerta_rigidez": false },
     "asimetria_recepcion_pct": 6.2,
     "curvas_angulares": { "frame_inicio": 27, "frame_fin": 73, "rodilla_deg": [...], "cadera_deg": [...] },
     "fases_salto": [ { "fase": "preparatoria", "frame_inicio": 27, "frame_fin": 35 }, "..." ],
     "velocidades_articulares": { "vel_rodilla_deg_s": [...], "pico_vel_rodilla": 485.2, "..." },
     "resumen_gesto": { "rom_rodilla_deg": 73.8, "rom_cadera_deg": 45.2, "ratio_excentrico_concentrico": 1.14, "..." }
   }
   ```
7. Si se envió `id_usuario` en la petición, el resultado se **persiste automáticamente** en la tabla `saltos` de MySQL y la respuesta incluye `id_salto`.
8. El archivo de vídeo temporal se **elimina automáticamente** tras el procesamiento.

---

## Módulo 2 — Gestión de usuarios y saltos (CRUD + BD)

### Paso a paso

1. **`POST /api/usuarios`** recibe JSON con `alias`, `nombre_completo`, `altura_m` y opcionalmente `peso_kg`.
2. **`UsuarioModel.crear()`** ejecuta un INSERT parametrizado en la tabla `usuarios`.
3. El pool de conexiones (`db.py`) obtiene una conexión, ejecuta la query, hace commit y devuelve la conexión al pool.
4. El usuario puede registrar saltos manualmente (`POST /api/saltos`) o automáticamente (al calcular vía vídeo con `id_usuario`).

### Flujo de progreso y comparativa

```
Frontend pide GET /api/usuarios/<id>/progreso
      │
SaltoModel.contar_por_tipo()  →  SELECT COUNT(*) GROUP BY tipo_salto
      │
comparativa_service.calcular_progreso()  →  JSON con conteo + faltan
      │
Si completo (≥4 vertical Y ≥4 horizontal):
      │
Frontend pide GET /api/usuarios/<id>/comparativa
      │
SaltoModel.obtener_por_usuario_y_tipo()  →  SELECT ... WHERE tipo_salto = ?
      │
comparativa_service.calcular_comparativa()  →  mejor/peor/media/último/evolución
      │
JSON con estadísticas por tipo
```

---

## Módulo 2 — Analítica avanzada (fatiga y tendencia)

### Fatiga intra-sesión

```
Frontend pide GET /api/usuarios/<id>/fatiga?tipo=vertical
      │
SaltoModel.obtener_por_usuario_y_tipo()  →  SELECT ... WHERE tipo_salto = ?
      │
analitica_service.calcular_fatiga_intra_sesion()
      │
  1. Agrupa saltos por sesión (separación máxima de 2 h entre consecutivos)
  2. Toma la sesión más reciente
  3. Regresión lineal sobre las distancias
  4. Calcula caída porcentual (primer salto vs último)
      │
JSON: pendiente, numero_saltos, caida_porcentual, fatiga_significativa, sesion
```

### Tendencia histórica

```
Frontend pide GET /api/usuarios/<id>/tendencia?tipo=vertical
      │
SaltoModel.obtener_por_usuario_y_tipo()  →  SELECT ... WHERE tipo_salto = ?
      │
analitica_service.calcular_tendencia_historial()
      │
  1. Convierte fechas a semanas desde el primer salto
  2. Regresión lineal sobre todo el historial
  3. Calcula pendiente (cm/semana), R² y predicción a 4 semanas
  4. Clasifica estado: mejorando / estancado / empeorando
      │
JSON: pendiente_cm_semana, r2, prediccion_4_semanas, estado, historial[]
```

---

## Módulo 2 — Enriquecimiento biomecánico y cinemático (Fases 6-7)

### Paso a paso

Tras calcular la distancia del salto, si se detectó un despegue y aterrizaje válidos, el controlador enriquece el resultado:

```
SaltoController._enriquecer_con_analisis(resultado, frames, fps)
      │
      ├── AterrizajeService.analizar_estabilidad()
      │       Ventana de 30 frames post-aterrizaje
      │       Centro de masa (Y promedio caderas) → std(Y) = oscilación
      │       Derivada de Y → primer frame estable (< 0.5 px/frame)
      │       → { oscilacion_px, tiempo_estabilizacion_s, estable }
      │
      ├── AterrizajeService.analizar_amortiguacion()
      │       Ángulo de rodilla en frame de aterrizaje (BiomecanicaService)
      │       Flexión máxima post-aterrizaje → rango = contacto − máxima
      │       → { angulo_rodilla_aterrizaje_deg, flexion_maxima_deg, rango_amortiguacion_deg, alerta_rigidez }
      │
      ├── AterrizajeService.analizar_simetria_recepcion()
      │       ASI de talones en frame de aterrizaje
      │       → asimetria_recepcion_pct (float %)
      │
      ├── CinematicoService.curvas_angulares()
      │       Ángulo de rodilla y cadera en cada frame (despegue−15 .. aterrizaje+15)
      │       Suavizado con media móvil de 3 frames
      │       → { indices, timestamps_s, rodilla_deg[], cadera_deg[] }
      │
      ├── CinematicoService.detectar_fases()
      │       Segmenta el gesto en 4 fases automáticamente
      │       → [ { fase, frame_inicio, frame_fin }, ... ]
      │
      ├── CinematicoService.velocidades_articulares()
      │       Derivada del ángulo × fps → °/s, detección de pico
      │       → { vel_rodilla_deg_s[], vel_cadera_deg_s[], pico_vel_rodilla, pico_vel_cadera }
      │
      └── CinematicoService.resumen_gesto()
              Pico flexión/extensión, ROM, ratio excéntrico/concéntrico
              → { pico_flexion_rodilla, pico_extension_rodilla, rom_rodilla_deg, rom_cadera_deg, ratio_excentrico_concentrico }
```

Todos estos campos se añaden al `ResultadoSalto` y se devuelven en el JSON de respuesta.

---

## Módulo 2 — Vídeo anotado con overlay (Fase 8.3)

### Paso a paso

```
Frontend pide POST /api/salto/video-anotado  (multipart con vídeo + tipo_salto + altura)
      │
app.py valida archivo + parámetros
      │
SaltoController.procesar_salto()  →  Obtiene frames de despegue/aterrizaje/pico
      │
video_anotado_service.generar_video_anotado(ruta_entrada, ruta_salida, frames_eventos)
      │
  1. Abre el vídeo original con OpenCV
  2. Crea un PoseLandmarker de MediaPipe para detectar landmarks en cada frame
  3. Por cada frame:
     a. Detecta landmarks y selecciona la persona principal (silueta más grande)
     b. Dibuja esqueleto (líneas verdes) y puntos articulares (círculos rojos)
     c. Calcula y muestra ángulos de rodilla izq/der como texto (RI / RD)
     d. Si es frame de evento (despegue/aterrizaje/pico): banner semitransparente
     e. Dibuja trayectoria del centro de masa (línea naranja)
  4. Escribe el vídeo anotado como MP4 (codec mp4v)
      │
Flask lee el archivo en memoria y devuelve un Response con los bytes
(evita PermissionError en Windows por archivo abierto durante streaming)
      │
Limpieza (finally): elimina vídeo original y anotado del disco con try/except OSError
```
