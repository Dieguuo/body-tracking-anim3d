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
   - Primero detecta despegue y aterrizaje: suaviza la señal Y de los talones con **media móvil de 3 frames**, calcula la derivada y busca transiciones que superen el umbral (con un **margen ciego de 5 frames** entre despegue y aterrizaje para evitar falsos positivos).
   - **Salto vertical** (método híbrido): combina dos fórmulas:
     - *Cinemática*: `h = (1/8) × g × t²` (tiempo de vuelo).
     - *Píxeles calibrados*: calibra con `S = Hr / Hp` y mide `(Y_suelo - Y_pico) × S`.
     - Si ambas están disponibles, resultado = promedio ponderado (60 % píxeles, 40 % cinemática).
   - **Salto horizontal**: usa la altura real del usuario para calibrar `S = Hr / Hp` (metros/píxel) y calcula `D_real = Dp × S` con el desplazamiento horizontal en píxeles.
5. **`SaltoController.procesar_salto()`** (Controller) orquesta modelo y servicio, validando los datos de entrada.
6. **Flask `POST /api/salto/calcular`** devuelve JSON:
   ```json
   { "tipo_salto": "vertical", "distancia": 34.12, "unidad": "cm", "confianza": 0.98, "frame_despegue": 42, "frame_aterrizaje": 58, "tiempo_vuelo_s": 0.5333, "angulo_rodilla_deg": 162.3, "angulo_cadera_deg": 171.5, "potencia_w": 3182.5, "asimetria_pct": 8.3, "metodo": "hibrido", "dist_por_pixeles": 36.45, "dist_por_cinematica": 30.67 }
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
