# Flujo de datos — Módulo 1 (Sensor de distancia)

## Paso a paso

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
7. El **frontend** (`modules/sensor/frontend/`, corriendo en otro servidor/puerto)  
   hace `fetch` al endpoint cada segundo y actualiza el DOM con el valor recibido.
