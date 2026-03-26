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

## Suavizado de señal y margen ciego en la detección de vuelo

En pruebas con vídeos reales, la derivada cruda de la coordenada Y de  
los talones presentaba micro-vibraciones que generaban falsos despegues  
o aterrizajes prematuros.

Se aplican dos mejoras antes de buscar el despegue/aterrizaje:

1. **Media móvil de 3 frames** sobre la señal Y antes de calcular la  
   derivada, eliminando ruido de alta frecuencia.
2. **Margen ciego de 5 frames** (`MIN_FRAMES`): tras detectar un despegue,  
   se ignoran los siguientes 5 frames antes de buscar el aterrizaje.  
   Esto evita que una fluctuación al inicio de la fase de ascenso se  
   confunda con un aterrizaje.

Además, para **salto horizontal** el umbral se reduce a `UMBRAL × 0.3`  
(0.9 px/frame), ya que el desplazamiento vertical es mucho menor que  
en un salto vertical y un umbral alto no detectaría la fase de vuelo.

## Filtrado de reflejos con `num_poses=2` y selección por tamaño

En vídeos grabados junto a superficies reflectantes (muebles, espejos,  
ventanas), MediaPipe puede detectar el reflejo de la persona como una  
pose adicional. Si solo se detecta una pose (`num_poses=1`), MediaPipe  
puede priorizar el reflejo (que apenas se mueve) sobre la persona real,  
produciendo desplazamientos casi nulos (~1 cm).

Solución: se configura `num_poses=2` y en `_extraer_pies()` se itera  
todas las poses detectadas, seleccionando la **silueta más grande**  
(mayor distancia cabeza-pies en píxeles). El reflejo, al estar más  
lejos de la cámara, siempre tiene una silueta más pequeña y se descarta.

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

## Recreación del PoseLandmarker por vídeo

MediaPipe en `RunningMode.VIDEO` exige timestamps monotónicamente  
crecientes. Si se reutiliza la misma instancia para un segundo vídeo,  
los timestamps vuelven a 0 y el landmarker falla.

Solución: `VideoProcessor._crear_landmarker()` crea una instancia  
nueva en cada llamada a `procesar()`, y se cierra con `close()` en  
un bloque `finally` al terminar. Esto también elimina estado compartido  
entre peticiones, haciendo el procesador thread-safe.

## Límite de tamaño de archivo (`MAX_CONTENT_LENGTH`)

Sin límite, un usuario podría subir un archivo de varios GB y agotar  
disco o memoria del servidor. Se configura `MAX_CONTENT_LENGTH` en  
Flask (100 MB por defecto, configurable en `config.py` con  
`MAX_UPLOAD_MB`). Flask rechaza automáticamente con 413 las peticiones  
que excedan el límite.

## Protección contra `fps=0`

Un vídeo corrupto o mal codificado puede reportar `fps=0` a través de  
OpenCV, lo que causaría divisiones por cero en los cálculos de tiempo  
de vuelo. Se comprueba `fps <= 0` en `VideoProcessor.procesar()` y se  
devuelve una lista vacía antes de procesar frames.

---

## Decisiones de la base de datos y reglas de negocio

## MySQL con `mysql-connector-python` y pool de conexiones

Se eligió MySQL (InnoDB) como SGBD relacional por su soporte nativo de  
claves foráneas, transacciones ACID y `ON DELETE CASCADE`. La librería  
`mysql-connector-python` es el conector oficial de Oracle, sin dependencias  
externas en C.

Se usa un **pool de 5 conexiones** (`MySQLConnectionPool`) con inicialización  
lazy (se crea al primer uso). Un context manager (`get_connection()`) obtiene  
una conexión del pool, hace commit automático al salir o rollback si hay  
excepción, y devuelve la conexión al pool. Esto evita abrir/cerrar conexiones  
en cada petición y elimina fugas de conexiones.

## Queries parametrizadas (protección contra SQL injection)

Todas las consultas usan `%s` como placeholder y pasan los valores como  
tupla. MySQL Connector escapa automáticamente los parámetros, previniendo  
inyección SQL en todos los endpoints.

## Blueprints Flask para organizar rutas

Los endpoints de usuarios y saltos se implementan como `Blueprint` de Flask,  
registrados en `app.py`. Esto mantiene cada controller en su propio archivo  
sin acoplar las rutas al punto de entrada principal.

## Serialización de Decimal y datetime

MySQL Connector devuelve columnas `DECIMAL` como `decimal.Decimal` y  
columnas `DATETIME` como `datetime.datetime`, que no son serializables  
por `json.dumps`. La función `_serializar()` en cada controller convierte  
`Decimal` a `float` y `datetime` a cadena ISO 8601 antes de devolver JSON.

## Guardado automático en BD desde el endpoint de cálculo

El endpoint existente `POST /api/salto/calcular` acepta opcionalmente  
`id_usuario` en el form-data. Si se proporciona y el cálculo tiene  
resultado > 0, se persiste el salto automáticamente en la tabla `saltos`.  
Si el guardado falla (ej. usuario inexistente, BD caída), se registra un  
warning en log pero se devuelve el resultado igualmente — el cálculo  
nunca falla por problemas de BD.

## Regla de negocio: mínimo 4 saltos por tipo

Se exige un mínimo de **4 saltos verticales y 4 saltos horizontales**  
por usuario antes de poder acceder a la comparativa. Esta regla vive  
en `comparativa_service.py` como constante `MINIMO_SALTOS_POR_TIPO = 4`,  
no en la base de datos. Esto permite cambiar el mínimo sin alterar el  
esquema SQL.

El endpoint `/progreso` informa del estado actual sin restricción.  
El endpoint `/comparativa` devuelve **403** si no se cumple el mínimo,  
indicando cuántos saltos faltan por tipo.

## Estadísticas calculadas al vuelo (sin tabla de caché)

Las estadísticas de la comparativa (mejor, peor, media, último, evolución)  
se calculan en Python cada vez que se consulta el endpoint. Con pocos  
saltos por usuario (decenas, no miles), el coste es despreciable frente  
a una consulta SQL. Esto evita mantener una tabla `estadisticas`  
sincronizada y elimina el riesgo de datos obsoletos.

## Comparativa intra-usuario (no ranking)

La comparativa compara los saltos de un mismo usuario consigo mismo:  
verticales con verticales, horizontales con horizontales. No hay  
leaderboard ni ranking entre usuarios. Cada tipo de salto tiene sus  
propias estadísticas independientes.
