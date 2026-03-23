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
   { "tipo_salto": "vertical", "distancia": 34.12, "unidad": "cm", "confianza": 0.98, "frame_despegue": 42, "frame_aterrizaje": 58, "tiempo_vuelo_s": 0.5333, "metodo": "hibrido", "dist_por_pixeles": 36.45, "dist_por_cinematica": 30.67 }
   ```
7. El archivo de vídeo temporal se **elimina automáticamente** tras el procesamiento.
