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
por `json.dumps`. La función `serializar_row()` en `utils/serializers.py`  
convierte `Decimal` a `float` y `datetime` a cadena ISO 8601 antes de  
devolver JSON. Los controllers la importan como alias local:  
`from utils.serializers import serializar_row as _serializar`.

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

---

## Decisiones de la biomecánica del aterrizaje y análisis cinemático (Fases 6-8)

## Centro de masa aproximado por promedio de caderas

En un análisis clínico se usaría un modelo biomecánico completo (15+
segmentos). Aquí se aproxima el centro de masa (CM) con el **promedio Y
de las caderas** (landmarks 23 y 24 de MediaPipe). Es una simplificación
aceptable para análisis 2D con cámara fija: la cadera está cerca del CM
real del cuerpo y su oscilación post-aterrizaje refleja fielmente la
estabilidad de la recepción.

## Ventana post-aterrizaje fija de 30 frames

En vídeos a 30 FPS, 30 frames equivalen a ~1 segundo. Es suficiente
para capturar la fase de recepción completa (estabilización típica en
0.3–0.8 s). Un valor mayor incluiría la siguiente preparación; uno menor
podría cortar recepción es lentas. Si el vídeo termina antes, se usa lo
disponible.

## Umbral de estabilización en derivada de Y < 0.5 px/frame

Se necesitan al menos 2 frames consecutivos con derivada menor que el
umbral para considerar que el CM se ha estabilizado. Esto evita falsos
positivos por un frame quieto aislado entre oscilaciones. El valor
0.5 px/frame se determinó empíricamente en pruebas con vídeos de saltos
reales.

## Amortiguación medida como rango de flexión de rodilla

En la literatura de biomecánica deportiva, la amortiguación en la
recepción se evalúa por cuánto flexiona la rodilla después del contacto.
Se calcula la diferencia entre el ángulo de rodilla al aterrizar y la
flexión máxima alcanzada en los frames posteriores. El umbral de 20° lo
establece `AterrizajeService` como alerta de rigidez: una recepción con
menos de 20° de rango de flexión indica impacto casi directo en las
articulaciones, factor de riesgo de lesión.

## Simetría de recepción con la misma fórmula ASI

Se reutiliza la fórmula ASI (ya implementada para el despegue en
Fase 5.3) aplicándola al frame de aterrizaje. Esto mantiene coherencia
en las métricas y no añade complejidad nueva. Los datos de ambos talones
ya están disponibles en `FramePies`.

## Curvas angulares con margen de ±15 frames

El análisis cinemático cubre desde 15 frames antes del despegue hasta
15 frames después del aterrizaje (`MARGEN_FRAMES = 15`). Incluir
frames previos al despegue captura la fase preparatoria (contramovimiento);
incluir frames post-aterrizaje captura la recepción completa. El suavizado
con media móvil de 3 frames filtra el ruido inherente a la detección de
landmarks por MediaPipe sin deformar la señal.

## Detección de fases por mínimo de flexión de rodilla

Las 4 fases del salto se segmentan automáticamente buscando el mínimo
de flexión de rodilla antes del despegue (pico del contramovimiento):

1. **Preparatoria**: desde el inicio del rango hasta el mínimo de flexión.
2. **Impulsión**: desde el mínimo de flexión hasta el despegue.
3. **Vuelo**: despegue → aterrizaje (ya detectados).
4. **Recepción**: aterrizaje → estabilización (calculada por `AterrizajeService`).

Esta segmentación no requiere clasificadores — es geometría sobre la
curva de ángulo ya calculada.

## Velocidades articulares por diferenciación finita

La velocidad angular se calcula como `Δθ × fps` (°/s) entre frames
consecutivos. No se necesitan sensores inerciales: la resolución temporal
de MediaPipe a 30 FPS es suficiente para detectar picos de velocidad
articular en movimientos explosivos como el salto.

## Ratio excéntrico/concéntrico

Se define como la duración de la fase preparatoria (excéntrica) dividida
entre la duración de la fase de impulsión (concéntrica). Un ratio > 1
indica que el sujeto tarda más en preparar que en impulsar (típico de
principiantes). Un ratio cercano a 1 indica eficiencia neuromuscular.

## Vídeo anotado con OpenCV en vez de frontend canvas

Dibujar landmarks en tiempo real con canvas/WebGL requiere enviar las
coordenadas al frontend y sincronizarlas con el vídeo. Anotar el vídeo
en backend con OpenCV es más robusto: el usuario recibe un MP4 terminado
que puede descargar, compartir y revisar offline. Se reutiliza MediaPipe
PoseLandmarker en el vídeo original (segunda pasada) para obtener los
landmarks frame a frame y dibujarlos con `cv2.line()` / `cv2.circle()`.

## Selección de persona en vídeo anotado

Al igual que en `VideoProcessor`, se detectan hasta 2 poses y se
selecciona la silueta más grande (distancia cabeza-pies). Esto garantiza
que los landmarks dibujados correspondan a la persona real y no al
reflejo, coherente con el filtrado del procesamiento original.

## Codec MP4V para el vídeo anotado

Se usa el codec `mp4v` (MPEG-4 Part 2) con extensión `.mp4`. Es
compatible con todos los navegadores y reproductores sin necesidad de
codecs adicionales. El vídeo se elimina del disco tras enviarlo al
cliente (`send_file` + limpieza en `finally`).

---

## Decisiones de la visualización 3D interactiva (Fase 11)

## Persistencia de los 33 landmarks completos

Antes solo se extraían ~9 puntos (pies, rodillas, caderas, hombros) de
los 33 que ofrece MediaPipe. Para construir un esqueleto completo se
necesitan los 33. Se modificó `video_processor.py` para extraer todos
los landmarks (x, y, z, visibility) en cada frame y almacenarlos en el
campo `FramePies.landmarks`.

Los landmarks se persisten en la columna `curvas_json` de la tabla
`saltos` como parte del objeto JSON, bajo la clave `landmarks_frames`.
Esto evita crear una tabla nueva o alterar el esquema de la BD — se
reutiliza el campo JSON existente que ya almacena curvas angulares.

## Endpoint de landmarks separado del cálculo

Se creó `GET /api/salto/<id>/landmarks` como endpoint independiente
en vez de incluir los landmarks siempre en la respuesta de
`POST /api/salto/calcular`. Razón: el array de 33 landmarks × N frames
puede pesar varios MB; incluirlo siempre penalizaría el tiempo de
respuesta cuando el frontend solo necesita las métricas.

El cálculo acepta un parámetro opcional `incluir_landmarks=true` para
casos donde se necesitan ambos datos en una sola petición (primera
visualización tras analizar).

## Buffer local como fallback de landmarks

Si el backend no devuelve landmarks (ej. vídeo procesado antes de la
actualización), el frontend usa `landmarksFramesLocalBuffer`: landmarks
capturados localmente por MediaPipe.js durante la grabación en tiempo
real. La precisión es menor (modelo lite en navegador vs modelo full en
backend) pero permite visualizar el esqueleto sin re-procesar el vídeo.

## Canvas 2D antes de Three.js

Se implementó primero un visor 2D con `<canvas>` estándar antes de
añadir Three.js. Esto permitió validar que los datos de landmarks
estaban correctos (formato, coordenadas, conexiones) sin la complejidad
de una escena 3D. El visor 2D se mantiene como fallback para
dispositivos sin WebGL.

## Mapa de conexiones POSE_CONNECTIONS_33

MediaPipe define 33 landmarks anatómicos pero no documenta un estándar
de qué pares de puntos deben conectarse visualmente. Se definió
`POSE_CONNECTIONS_33` en el frontend como array de pares [origen, destino]
siguiendo la topología del esqueleto humano:

- Cara: ojos, orejas, boca, nariz (landmarks 0–10)
- Tronco: hombros, caderas (11–12, 23–24)
- Brazos: hombro → codo → muñeca → mano (11–22)
- Piernas: cadera → rodilla → tobillo → pie (23–32)

## Three.js por CDN con fallback triple

Three.js no se empaqueta localmente para evitar añadir ~600 KB al
repositorio. Se carga por CDN con patrón singleton (`threeDepsPromise`)
y fallback en cascada: esm.sh → unpkg → jsdelivr. Si los tres fallan o
WebGL no está disponible, se muestra un mensaje y se vuelve al visor 2D
automáticamente.

Se eligió Three.js v0.160.0 (versión específica) en vez de `@latest`
para evitar roturas por cambios de API.

## Conversión de coordenadas normalizadas a espacio 3D

MediaPipe devuelve landmarks en coordenadas normalizadas (0–1). Para
Three.js se transforman:

- **X**: `(x - 0.5) × 2` → centra en el origen, rango [-1, 1]
- **Y**: `(0.5 - y) × 2` → invierte el eje (MediaPipe: Y↓, Three.js: Y↑)
- **Z**: `-(z || 0) × 2` → invierte profundidad (MediaPipe: Z hacia cámara)

Esta transformación mantiene las proporciones del cuerpo sin necesidad
de calibración.

## Limpieza de recursos WebGL con _disposeThreeViewer()

WebGL mantiene estado en la GPU. Sin liberación explícita, al cambiar
de modo (3D→2D→3D) se acumulan contextos WebGL hasta que el navegador
los rechaza (límite de ~16 contextos). `_disposeThreeViewer()` cancela
la animación, desconecta el `ResizeObserver`, libera geometrías y
materiales, elimina el renderer y limpia el DOM.

## OrbitControls en vez de controles propios

Three.js `OrbitControls` proporciona rotación, pan y zoom con ratón/
touch de forma estándar. Implementar controles propios sería más trabajo
y peor UX. Se carga desde el mismo CDN que Three.js para garantizar
compatibilidad de versión.

## Animación basada en timestamps reales (no intervalo fijo)

El intervalo entre frames de la animación se calcula a partir de los
timestamps reales del vídeo (`frame[N].timestamp_s - frame[0].timestamp_s`)
dividido entre el número de frames. Esto respeta la velocidad original del
vídeo independientemente del FPS de captura. La velocidad configurable
(×0.25, ×0.5, ×1) divide el intervalo base, produciendo una cámara lenta
proporcional al movimiento real.

Se usa `setInterval` en vez de `requestAnimationFrame` porque la animación
debe avanzar a ritmo constante del vídeo, no sincronizada con el refresco
de pantalla. `requestAnimationFrame` correría a 60 Hz incluso para vídeos
de 30 FPS, duplicando frames innecesariamente.

## Detección de fase por búsqueda directa en `fases_salto`

En lugar de recalcular la fase del salto en el frontend, `_getFaseParaFrame()`
recorre el array `fases_salto` (ya calculado por `CinematicoService` en
backend) y compara `frame_inicio` / `frame_fin` de cada fase. Esto evita
duplicar la lógica de segmentación y garantiza coherencia entre las fases
mostradas en el visor 3D y las reportadas en el análisis cinemático.

## Ángulos articulares recalculados en frontend

Los overlays de ángulos recalculan rodilla y cadera en tiempo real con
`_anguloEntreLandmarks()` (producto escalar + arccos), en vez de usar los
valores precalculados del backend (`curvas_angulares`). Razón: el backend
calcula ángulos solo en el rango `[despegue - 15, aterrizaje + 15]`,
mientras que el visor puede mostrar cualquier frame. Recalcular en frontend
con la misma fórmula trigonométrica garantiza cobertura completa.

Los valores del panel de métricas (`metRodilla`, `metCadera`) promedian
izquierda y derecha para dar un ángulo representativo sin saturar la UI
con 4 valores simultáneos.

## Centro de masa como promedio de caderas (coherente con backend)

La trayectoria del CM en el visor 2D usa el mismo criterio que
`AterrizajeService` en backend: promedio Y de landmarks 23 y 24 (caderas).
Esto mantiene coherencia con las métricas de estabilidad y oscilación
ya calculadas.

## Colores de fase sin paleta configurable

Los colores de fase (`_FASE_COLORES`) se definen como constante en el
frontend:
- **Preparatoria**: azul (`#5b8fff`)
- **Impulsión**: amarillo (`#ffe44d`)
- **Vuelo**: verde (`#59ffc7`)
- **Recepción**: rojo (`#ff6e6e`)

Se eligieron por contraste máximo entre fases adyacentes y accesibilidad
(distinguibles en daltonismo protanopia). No se exponen como configuración
porque cambiarlos requeriría actualizar también las leyendas y el CSS.

## Ghost skeleton con opacidad en vez de wireframe

El esqueleto de comparación se renderiza como una copia semitransparente
(2D: 35% opacidad, 3D: 40% opacidad) en color rosa (`#ff8cff`), en lugar
de usar wireframe o un color similar al esqueleto principal. La opacidad
reducida permite ver ambos esqueletos superpuestos sin que uno oculte al
otro, y el rosa contrasta con el verde/naranja del esqueleto principal.

## Mapeo proporcional de frames para comparación

`_mapCompareFrame()` sincroniza los dos saltos por proporción temporal
(`idx / total_main × total_compare`) en vez de por fase. Razón: la
sincronización por fase requeriría que ambos saltos tengan exactamente
las mismas fases detectadas con la misma calidad, lo cual no está
garantizado. El mapeo proporcional funciona siempre, aunque los saltos
tengan duraciones diferentes, y da un resultado visualmente coherente
(ambos esqueletos avanzan al mismo ritmo relativo).

## Geometría ghost lazy en 3D

Los 33 joints y bones del ghost 3D se crean solo cuando el usuario
selecciona un salto de comparación (`_renderFrameGhost3D()`), no al
cargar el visor. Esto evita crear 66 objetos Three.js extra por defecto.
`_removeCompareGhost()` libera toda la geometría (dispose + scene.remove)
cuando se desactiva la comparación, evitando fugas de memoria GPU.

## Prevención de event listeners duplicados con `dataset.bound`

Los controles de animación, overlays y comparación se inicializan en
`_bindLandmarksControls()`, que puede llamarse múltiples veces (cada vez
que se carga un resultado). Se usa `element.dataset.bound = '1'` como
flag para evitar registrar listeners duplicados. Este patrón es más
ligero que `removeEventListener` (que requiere guardar referencias a
funciones con nombre) y no tiene efectos secundarios.

---

## Decisiones de corrección de slow-motion y robustez del pipeline (Fase 12)

## Detección automática de slow-motion por ajuste parabólico

Los móviles modernos graban slow-motion a 120–240 FPS y el contenedor
del vídeo informa el FPS de reproducción (ej. 30 FPS), pero el movimiento
real fue capturado a una velocidad mucho mayor. Esto hace que un salto de
0.5 s reales se vea como 2–4 s en el vídeo, distorsionando todas las
métricas basadas en tiempo (tiempo de vuelo, velocidades articulares,
potencia, aceleración).

En vez de pedir al usuario que indique manualmente si el vídeo es slow-mo,
se usa la **gravedad como reloj universal**: durante la fase de vuelo,
cualquier objeto sigue una parábola con aceleración = 9.81 m/s².

El método `_detectar_factor_slowmo()`:

1. Extrae la coordenada Y de la cadera (más estable que los pies en vuelo)
   durante la ventana despegue → aterrizaje.
2. Ajusta una parábola `y = a·t² + b·t + c` con `np.polyfit(t, y, 2)`.
3. Extrae la aceleración aparente: `a_aparente = 2·|a| × escala × fps²`,
   donde `escala = altura_real_m / altura_px`.
4. Compara con la gravedad real: `factor = sqrt(9.81 / g_aparente)`.
5. Si `factor > 1.3`, se aplica la corrección: `fps_real = fps_video × factor`.

Se usa la **cadera** en vez de los pies porque durante el vuelo los pies
oscilan (patada, flexión) mientras la cadera sigue una trayectoria
balística limpia. El mínimo de 5 frames de vuelo garantiza que el ajuste
parabólico tenga sentido estadístico.

## Umbral de aplicación del factor slow-motion (1.3)

Un factor entre 0.7 y 1.3 se considera velocidad normal (variación
por ruido de landmarks, no por slow-motion real). Los móviles graban
slow-mo típicamente a 2× mínimo, así que factores < 1.3 son falsos
positivos. El límite superior de 12.0 cubre cámaras profesionales
(240 FPS reproducidas a 30 = 8×) con margen.

## Validación de vuelo generosa + corrección posterior

La detección de vuelo (`_detectar_vuelo`) ocurre **antes** de calcular
el factor de slow-motion (necesita la ventana de vuelo para ajustar la
parábola). Por eso los límites de validación temporal (5.0 s vertical,
8.0 s horizontal) son generosos: un salto de 0.5 s reales a 8× slow-mo
produce 4.0 s aparentes, que un límite de 2.0 s rechazaría. La
corrección temporal precisa se aplica después con el factor calculado.

## Corrección de FPS propagada a todos los servicios

El `factor_slowmo` se almacena en `ResultadoSalto` y el controlador
calcula `fps_real = info.fps × resultado.factor_slowmo` antes de pasar
el FPS al enriquecimiento biomecánico y cinemático (Fases 6-7). Esto
garantiza que las velocidades articulares, tiempos de estabilización y
ratios excéntrico/concéntrico se calculen con la velocidad real del
movimiento, no con la velocidad de reproducción del vídeo.

## Lectura en memoria del vídeo anotado (fix Windows)

El endpoint de vídeo anotado usaba `send_file()` de Flask, que mantiene
el archivo abierto durante el streaming de la respuesta. En Windows,
esto impide que el bloque `finally` borre el archivo temporal
(`PermissionError: [WinError 32]`).

Solución: leer el archivo completo en memoria con `open(ruta, "rb")`,
construir un `Response` con los bytes y los headers de descarga
(`Content-Disposition: attachment`), y entonces borrar los archivos
en `finally`. Para vídeos anotados cortos (típicamente < 50 MB) la
carga en memoria es aceptable y evita la complejidad de `after_this_request`
o temporizadores de limpieza.

El bloque `finally` ahora envuelve cada `os.remove()` en `try/except
OSError` para evitar que un fallo de limpieza enmascare el resultado.

## Umbral de detección de vuelo diferenciado por tipo de salto

El detector de vuelo (`_detectar_vuelo`) usa la coordenada Y de los
talones para decidir si los pies están "en el aire". Se calcula un
baseline (mediana Y en reposo) y se marca un frame como "en aire" si
`Y < baseline - umbral`.

El umbral debe ser más alto que el ruido natural de MediaPipe estando
de pie (±5-7 px) para evitar falsos positivos. Las necesidades varían
por tipo de salto:

- **Vertical**: `max(1.2, altura_ref × 0.004)` — los pies suben mucho
  (30-100+ px), así que un umbral bajo funciona bien.
- **Horizontal**: `max(8.0, altura_ref × 0.02)` — los pies se elevan
  menos (~20-350 px según la distancia), pero la fase de caminata/
  preparación genera micro-variaciones de 5-7 px que con un umbral de
  ~1 px se confunden con vuelo.

El umbral anterior para horizontal (`max(0.9, altura_ref × 0.0025)` =
~0.99 px) era insuficiente: marcaba prácticamente todo el vídeo como
vuelo (frame 16→120 de 121 frames), capturando la caminata antes y
después del salto y produciendo distancias infladas (~336 cm en lugar
de ~240 cm). El nuevo umbral de ~8 px supera el ruido natural y detecta
solo la elevación real del salto (frame 19→84).

Este cambio también mejoró la precisión del factor slow-motion (de 6.688
a 3.233), porque la ventana de vuelo más ajustada produce una parábola
más limpia para el ajuste gravitatorio.
