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

Se usa un **pool de 10 conexiones** (`MySQLConnectionPool`) con inicialización  
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

---

## Decisiones de seguridad y hardening

## Eliminación de XSS por `innerHTML`

Los campos `alias` y `nombre_completo` provienen de entrada de usuario y se
mostraban en el frontend con `innerHTML`. Un alias como
`<img onerror=alert(1)>` se ejecutaría en el navegador.

Se sustituyó `innerHTML` por construcción DOM segura (`createElement` +
`textContent`) en `api_salto.js` (comparativa) y `registro.js` (tabla de
usuarios). `textContent` escapa automáticamente cualquier HTML.

## Cabeceras de seguridad HTTP

Todas las respuestas Flask incluyen cabeceras defensivas mediante un
`@app.after_request`:

- `X-Content-Type-Options: nosniff` — impide MIME sniffing.
- `X-Frame-Options: DENY` — protege contra clickjacking.
- `X-XSS-Protection: 1; mode=block` — protección XSS del navegador.
- `Referrer-Policy: strict-origin-when-cross-origin` — limita filtración de URLs.

## Sanitización de errores de base de datos

Los `IntegrityError` de MySQL podían exponer nombres de tablas, columnas y
constraints al cliente. Ahora se devuelve un mensaje genérico
(`"Error de integridad: el usuario indicado no existe o hay un conflicto de datos"`)
sin detalles internos. El error completo se registra en logs del servidor.

## Validación de longitud en backend

Aunque el HTML limita `alias` a 50 chars y `nombre` a 100, un atacante
puede hacer peticiones directas al API. El backend ahora trunca
`alias[:50]` y `nombre[:120]` (coincidiendo con los `VARCHAR` de la BD)
antes de insertar, evitando errores de truncación de MySQL.

## Validación de rango de altura (0.50–2.50 m)

Antes se aceptaba cualquier float positivo como `altura_m`. Un valor
absurdo (ej. 0.01 o 999) distorsiona la calibración píxel→metro y todos
los cálculos de salto. Ahora se valida en backend (POST y PUT) y en
frontend (formulario de registro e inline), con el rango biológico
0.50–2.50 m.

## Validación de tamaño de archivo en frontend

El backend limita a 100 MB con `MAX_CONTENT_LENGTH`, pero sin validación
cliente el usuario esperaría todo el upload para recibir un 413. Ahora
`camara.js` comprueba `file.size` antes de enviar y muestra un aviso
inmediato si se excede.

---

## Decisiones del módulo de biomecánica y análisis avanzado (Fase 5)

## Potencia de Sayers en vez de fuerza directa

No se dispone de plataforma de fuerza, así que no se puede medir la
potencia real de despegue. La **ecuación de Sayers (1999)** es la fórmula
más utilizada en valoración deportiva para estimar la potencia pico de
miembros inferiores a partir de la altura del salto vertical y el peso
corporal:

    P (W) = 60.7 × altura_cm + 45.3 × peso_kg − 2055

Es un estándar reconocido en ciencias del deporte (validado contra
plataformas de fuerza con R² > 0.88). Solo requiere añadir `peso_kg`
al perfil del usuario — dato que ya se pide en muchas apps de fitness.
El campo es opcional (`DECIMAL(5,1) NULL`); si no está informado, la
respuesta del salto devuelve `potencia_w: null`.

## Asimetría bilateral por desplazamiento de talones

Se compara el desplazamiento vertical del talón izquierdo frente al
derecho en el frame de despegue, usando el frame 0 como referencia
de reposo. El índice ASI (Asymmetry Symmetry Index) se calcula como:

    ASI = (|izq − der| / max(izq, der)) × 100

Un valor > 15 % se señala con alerta visual en el frontend como
indicador de riesgo de lesión. Los datos de talón izquierdo/derecho
ya están disponibles en `FramePies` (landmarks 29/30 de MediaPipe).

## Ángulos articulares por trigonometría de landmarks

MediaPipe ya devuelve landmarks de cadera (23/24), rodilla (25/26) y
tobillo (27/28). El ángulo de una articulación se calcula como el ángulo
entre los dos segmentos que la forman, usando `arctan2` sobre el producto
vectorial y el producto escalar:

    θ = arctan2(|a × b|, a · b)

donde `a` = vector proximal→articulación y `b` = vector distal→articulación.

Se extraen en el frame de despegue (ya detectado por `_detectar_vuelo`).
No requiere modelo de IA adicional — es geometría pura sobre datos que
ya se procesan.

## Índice de asimetría bilateral (ASI)

El ASI compara la contribución de cada pierna al salto:

    ASI = (|izq − der| / max(izq, der)) × 100

Un ASI > 15% es un indicador reconocido de riesgo de lesión en la
literatura de biomecánica deportiva. Los datos ya están disponibles en
`FramePies` (talon_izq_y / talon_der_y), solo falta compararlos en el
frame de despegue.

## Detección de fatiga por pendiente de regresión

Si un jugador hace múltiples saltos en una sesión y los últimos producen
distancias significativamente menores, hay fatiga neuromuscular. Se
detecta calculando la pendiente de regresión lineal sobre las distancias
ordenadas cronológicamente. Una caída > 10% respecto al primer salto
de la sesión se considera significativa.

La agrupación en "sesión" se hace por ventana temporal (saltos del mismo
usuario en un rango de 2 horas), sin necesidad de que el usuario abra/
cierre sesión explícitamente.

## Curva de progresión con regresión temporal

Para responder "¿estoy mejorando?", se calcula una regresión lineal de
distancia sobre el tiempo (semanas) usando el historial completo del
usuario, separado por tipo de salto. Se devuelven:

- **Pendiente** (cm/semana): ritmo de mejora positivo o negativo
- **R²**: fiabilidad de la tendencia (>0.5 = tendencia clara)
- **Estado**: mejorando / estancado / empeorando (basado en pendiente + R²)

Esto no requiere librerías adicionales — `numpy.polyfit(x, y, 1)` es
suficiente para regresión lineal.
