# Decisiones técnicas

## Hilo daemon para lectura serial

El bucle de lectura del Arduino corre en un `threading.Thread(daemon=True)`.  
Esto permite que Flask ocupe el hilo principal sin bloquear la lectura serial.  
El hilo daemon se termina automáticamente al cerrar el proceso.

## `threading.Lock` para estado compartido

`_ultima_medicion` es escrita por el hilo de lectura y leída por Flask en threads  
separados. El lock garantiza que nunca se lee un estado parcialmente escrito.

## `debug=False` en Flask

El modo debug de Flask relanza el proceso con un reloader, destruyendo el hilo daemon  
antes de que pueda leer datos. Por eso se fuerza `debug=False`.

## Parseo con regex en lugar de `float(linea)`

El Arduino puede enviar `"Distancia: 23.45 cm"` o simplemente `"23.45"`.  
`re.search(r"[-+]?\d*\.?\d+", linea)` cubre ambos casos sin cambiar el sketch.

## MVC estricto

- El **modelo** (`sensor_serial.py`) no sabe nada de vistas ni de HTTP.  
- La **vista** (`consola_view.py`) solo imprime; no accede al serial.  
- El **controlador** orquesta ambos y es el único que conoce el flujo.

## Estructura modular (`modules/<nombre>/`)

Cada funcionalidad (sensor, salto, futuros) vive en su propia carpeta dentro  
de `modules/`, con `arduino/`, `backend/` y `frontend/` propios. Cada módulo  
puede arrancarse y probarse de forma autónoma sin depender del resto.

`integration/` reúne los módulos en una única interfaz web (Fase 3).

---

## Decisiones del módulo salto

## MediaPipe PoseLandmarker (Tasks API) en lugar de `mp.solutions.pose`

MediaPipe >= 0.10.x eliminó `mp.solutions.pose`. Se usa la nueva Tasks API  
(`mediapipe.tasks.python.vision.PoseLandmarker`) con `RunningMode.VIDEO`  
y el modelo `pose_landmarker_lite.task` descargado localmente.

## Detección de despegue/aterrizaje por derivada de Y

En vídeo, el eje Y crece hacia abajo. Cuando el pie sube (despegue), la  
coordenada Y disminuye bruscamente (derivada negativa). Cuando aterriza,  
aumenta bruscamente (derivada positiva).

Se usa un umbral configurable (`UMBRAL_DERIVADA_Y = 3.0 px/frame`) para  
filtrar ruido y detectar solo transiciones reales.

## Separación Model / Service / Controller

- **Model** (`video_processor.py`): solo accede al vídeo y a MediaPipe.  
  No sabe de fórmulas ni de HTTP.
- **Service** (`calculo_service.py`): solo hace cálculos matemáticos puros.  
  No accede a vídeo ni a red.
- **Controller** (`salto_controller.py`): orquesta modelo y servicio.  
  Valida datos de entrada y devuelve el resultado.

Esto permite testear las fórmulas sin necesitar un vídeo real.

## Interpolación lineal para frames sin detección

MediaPipe no detecta landmarks en todos los frames (oclusión, desenfoque).  
Los valores `None` se interpolan linealmente antes de calcular la derivada,  
evitando saltos falsos en la señal.

## Archivo temporal con UUID + limpieza automática

Los vídeos subidos se guardan con nombre `uuid4.hex + extensión` para  
evitar colisiones. Se eliminan en un bloque `finally` tras el procesamiento,  
garantizando limpieza incluso si hay error.

## Puertos independientes por módulo

Cada módulo corre en su propio puerto (sensor → 5000, salto → 5001).  
Esto permite arrancar ambos simultáneamente sin conflicto y facilita la  
futura integración desde un gateway único.

## Método híbrido para salto vertical (cinemática + píxeles calibrados)

Originalmente el salto vertical usaba solo la fórmula cinemática  
`h = (1/8) × g × t²`. En pruebas con vídeos reales a 30 FPS, la  
resolución temporal era insuficiente: pocos frames de diferencia entre  
despegue y aterrizaje producían errores grandes (ej. 8 cm en un salto  
real de ~35 cm).

Se añadió un segundo método: **desplazamiento vertical en píxeles**  
calibrado con la altura real del usuario (`S = Hr / Hp`). Mide  
directamente cuánto subieron los pies respecto al suelo en el frame  
de mayor elevación.

Ambos métodos se combinan en un **promedio ponderado** (60 % píxeles,  
40 % cinemática) cuando los dos están disponibles. Si solo uno funciona  
(ej. no hay detección de altura en píxeles), se usa ese solo.

Esto también hace que `altura_real_m` sea **obligatorio para ambos tipos  
de salto** (vertical y horizontal), ya que ambos necesitan la calibración  
píxel → metro.

La respuesta JSON del salto vertical incluye `metodo` (`"hibrido"`,  
`"pixeles"` o `"cinematica"`), `dist_por_pixeles` y `dist_por_cinematica`  
para transparencia y depuración.
