# Manual de Usuario — Anim3D Tracking

Guía paso a paso para usar la aplicación web de medición física.

---

## Índice

1. [Requisitos previos](#1-requisitos-previos)
2. [Arrancar la aplicación](#2-arrancar-la-aplicación)
3. [Pantalla principal (Landing)](#3-pantalla-principal)
4. [Módulo Cámara / Salto](#4-módulo-cámara--salto)
5. [Módulo Cámara / Futbol](#5-módulo-cámara--futbol)
6. [Módulo Sensor Arduino](#6-módulo-sensor-arduino)
7. [Acceso desde el móvil](#7-acceso-desde-el-móvil)
8. [Solución de problemas](#8-solución-de-problemas)
9. [API REST — Usuarios, Saltos y Comparativa](#9-api-rest--usuarios-saltos-y-comparativa)

---

## 1. Requisitos previos

| Elemento | Detalle |
|----------|---------|
| **Python** | 3.10 o superior |
| **MySQL** | 8.0 o superior (base de datos `bd_anim3d_saltos`) |
| **Navegador** | Chrome, Edge o Firefox (actualizado) |
| **Arduino** | Solo si se va a usar el módulo Sensor (HC-SR04 conectado por USB) |
| **Cámara** | Solo si se va a grabar un salto desde el navegador |

### Instalación de dependencias

```powershell
cd ruta\del\proyecto
.\.venv\Scripts\Activate.ps1      # Activar el entorno virtual
pip install -r requirements.txt
```

### Inicializar la base de datos

```powershell
mysql -u root -p < scripts\init_db.sql
```

---

## 2. Arrancar la aplicación

### Opción rápida (recomendada)

Doble clic en **`scripts\run_all.bat`**. Se abrirán tres ventanas de terminal automáticamente.

### Opción manual — HTTPS (recomendada)

Abrir tres terminales y ejecutar en cada una:

| Terminal | Comando | Puerto |
|----------|---------|--------|
| Backend Salto | `cd modules\salto\backend` → `python app.py` | 5001 |
| Backend Sensor | `cd modules\sensor\backend` → `python app.py` | 5000 |
| Frontend Web | `cd integration\web` → `python -m http.server 8080` | 8080 |

Una vez arrancado, abrir en el navegador: **http://localhost:8080**

---

## 3. Pantalla principal

Al abrir la app se muestra el **landing** con dos tarjetas:

| Tarjeta | Descripción | Enlace |
|---------|-------------|--------|
| **Cámara / Salto** | Analiza saltos con IA mediante vídeo | `salto.html` |
| **Sensor Arduino** | Medición por ultrasonidos en tiempo real | `arduino.html` |

Pulsa sobre cualquiera de las tarjetas para acceder al módulo.

---

## 4. Módulo Cámara / Salto

### ¿Qué hace?

Analiza un vídeo de salto (vertical u horizontal) y calcula la distancia recorrida usando inteligencia artificial (MediaPipe).

### Paso a paso

#### 1. Configurar el tipo de salto

- En el desplegable **Tipo de salto**, seleccionar:
  - **Salto Horizontal** — para saltos de longitud
  - **Salto Vertical** — para saltos de altura

#### 2. Introducir tu altura y peso

- En el campo **"Altura (ej: 1.75)"**, escribir tu estatura en metros. Este dato es **obligatorio** y se usa para calibrar la medición.
- En el campo **"Peso kg (opcional)"**, introducir tu peso corporal. Es opcional, pero si se rellena permite calcular la **potencia pico** del salto (ecuación de Sayers).

#### 3. Grabar o subir el vídeo

**Opción A — Grabar con la cámara:**

1. El navegador pedirá permiso para acceder a la cámara. **Aceptar**.
2. Pulsar **"Grabar Salto"**. Aparecerá un indicador rojo de grabación.
3. Realizar el salto frente a la cámara.
4. Pulsar **"Detener"** para finalizar la grabación.
5. El botón mostrará **"Procesando..."** mientras se envía el vídeo al servidor.

**Opción B — Subir vídeo existente:**

1. Pulsar **"Subir vídeo de la galería"**.
2. Seleccionar un archivo de vídeo (.mp4, .webm, .mov, .avi).
3. El botón mostrará **"Enviando..."** durante la subida.

#### 4. Ver los resultados

Tras el análisis aparece un panel de resultados con:

| Campo | Significado |
|-------|-------------|
| **Distancia (cm)** | Distancia del salto calculada |
| **Confianza** | Porcentaje de fiabilidad de la medición (0–100 %) |
| **Tiempo Vuelo** | Segundos que el sujeto estuvo en el aire |
| **F. Despegue** | Número de frame donde se detectó el despegue |
| **F. Aterrizaje** | Número de frame donde se detectó el aterrizaje |
| **Áng. Rodilla** | Ángulo de la rodilla en el frame de despegue (grados) |
| **Áng. Cadera** | Ángulo de la cadera en el frame de despegue (grados) |
| **Potencia** | Potencia pico estimada en watts (requiere peso del usuario) |
| **Asimetría** | Índice de asimetría bilateral (%). Rojo si > 15 % |

Además de los datos básicos, aparecen **paneles avanzados** cuando se detecta un salto válido:

##### Panel de biomecánica del aterrizaje

| Campo | Significado |
|-------|-------------|
| **Oscilación CM** | Variabilidad del centro de masa tras aterrizar (px). Menor = más estable |
| **T. Estabilización** | Tiempo en segundos hasta que el cuerpo se estabiliza |
| **Estable** | Sí/No — indica si se alcanzó la estabilización en la ventana de análisis |
| **Rod. Aterrizaje** | Ángulo de rodilla en el frame de aterrizaje (grados) |
| **Flex. Máxima** | Flexión máxima de rodilla post-aterrizaje (amortiguación) |
| **Amortiguación** | Rango de flexión = rod. aterrizaje − flex. máxima. Alerta si < 20° |
| **Asim. Recepción** | Asimetría bilateral en el aterrizaje (%). Alerta si > 15% |

> **Alertas:** si la amortiguación es menor de 20° aparece un aviso de "Recepción rígida". Si la asimetría de recepción supera el 15%, aparece un aviso de "Desequilibrio".

##### Panel de resumen del gesto

| Campo | Significado |
|-------|-------------|
| **ROM Rodilla** | Rango de movimiento total de la rodilla durante el salto (grados) |
| **ROM Cadera** | Rango de movimiento total de la cadera durante el salto (grados) |
| **Ratio Exc/Con** | Ratio entre la duración de la fase excéntrica y la concéntrica |
| **Pico Vel. Rodilla** | Velocidad angular máxima de la rodilla (°/s) |

##### Timeline interactivo

Barra temporal con colores que representan las 4 fases del salto:

| Color | Fase | Descripción |
|-------|------|-------------|
| Violeta | Preparatoria | Contramovimiento (flexión excéntrica) |
| Cian | Impulsión | Extensión concéntrica hasta el despegue |
| Verde | Vuelo | Fase aérea |
| Naranja | Recepción | Desde el aterrizaje hasta la estabilización |

Al hacer clic en un segmento se muestra el rango de frames de esa fase.

##### Gráficas de curvas articulares

Dos gráficas Chart.js que muestran la evolución del ángulo articular a lo largo del tiempo:
- **Ángulo de rodilla vs tiempo** (grados)
- **Ángulo de cadera vs tiempo** (grados)

Cada gráfica marca con colores de fondo las fases del salto y señala los eventos clave (despegue, aterrizaje).

##### Descarga de vídeo anotado

Botón **"Descargar vídeo anotado"** que solicita al backend un vídeo con overlay:
- Esqueleto de landmarks dibujado sobre cada frame
- Ángulos de rodilla en tiempo real
- Marcadores de eventos (DESPEGUE, ATERRIZAJE, PICO)
- Trayectoria del centro de masa

El vídeo se descarga como archivo `.mp4`.

##### Panel landmarks 2D/3D

Cuando hay landmarks disponibles, aparece un panel de esqueleto frame a frame con:

- Slider de navegación por frame.
- Vista **2D** en canvas.
- Vista **3D** con rotación/zoom.
- Etiqueta de tiempo por frame.

#### 5. Repetir

Pulsar **"Nuevo Salto"** para volver a la vista de cámara y hacer otro intento.

### Consejos para mejores resultados

- Graba de cuerpo entero, con la cámara fija y perpendicular al salto.
- La iluminación debe ser buena y uniforme.
- Evita que haya otras personas en el encuadre.
- Idealmente el fondo debe ser liso (una pared, por ejemplo).

---

## 5. Módulo Cámara / Fútbol

### ¿Qué hace?

Analiza la técnica de golpeo de balón usando inteligencia artificial (MediaPipe Pose). Calcula ángulos articulares, velocidad del pie en el impacto, estabilidad del tronco, detecta la pierna de golpeo y genera alertas biomécanicas accionables.

---

### Posición de cámara — **importante para resultados correctos**

El sistema analiza el movimiento en **2D** (plano de la imagen). Una posición incorrecta de la cámara produce mediciones inválidas.

**Configuración correcta (modo horizontal/paisaje):**

```
         ←——— 4–6 metros ———→
[CÁMARA] ════════════ [JUGADOR] →→ (dirección del tiro)
```

| Requisito | Detalle |
|-----------|---------|
| **Plano** | Cámara perpendicular (90°) a la trayectoria del tiro |
| **Distancia** | 4–6 metros para ver el cuerpo completo |
| **Altura** | A nivel cadera–rodilla (~0.8–1.0 m del suelo) |
| **Encuadre** | Cabeza y ambos pies visibles en todo momento |
| **Eje** | El jugador se desplaza de izquierda a derecha (o al revés) |
| **Evitar** | Vista frontal o diagonal — distorsiona todos los ángulos |

---

### Paso a paso

#### 1. Seleccionar modo de grabación

En el desplegable **Modo** (encima de la cámara) elige:

| Modo | Descripción |
|------|-------------|
| **Tiro individual** | Analiza un tiro aislado |
| **Tiros comparativa (4 tiros)** | El sistema agrupa 4 tiros consecutivos y muestra una tabla comparativa automática |

#### 2. Seleccionar o crear usuario

- Busca tu nombre en la tabla de usuarios o créate un perfil nuevo (alias, nombre, altura, peso).
- Con usuario activo, el golpeo se guarda en la base de datos.
- Sin usuario, el análisis se muestra pero no se persiste.

#### 3. Grabar o subir el vídeo

**Opción A — Grabar con la cámara:**

1. El navegador pedirá permiso de cámara. **Aceptar**.
2. Pulsa **"Iniciar grabación"**. Aparece el icono rojo de grabación activa.
3. Realiza el golpeo frente a la cámara.
4. Pulsa de nuevo para detener la grabación.
5. El sistema procesa automáticamente el vídeo.

**Opción B — Subir vídeo existente:**

1. Pulsa **"Subir vídeo de la galería"**.
2. Selecciona un archivo (.mp4, .webm, .mov, .avi, máx. 100 MB).

#### 4. Guardar datos y vídeo

Antes de grabar, en **"¿Guardar vídeo en BD?"** elige:

| Opción | Resultado |
|--------|-----------|
| **Sí, guardar vídeo + datos** | Guarda las métricas Y el archivo de vídeo en MySQL |
| **No, solo guardar datos** | Guarda solo las métricas (recomendado para ahorrar espacio) |

#### 5. Ver resultados

Tras el análisis aparece un panel con todas las métricas del golpeo:

##### Métricas principales

| Campo | Significado |
|-------|-------------|
| **Pierna de apoyo** | Pierna que permanece en el suelo durante el golpeo |
| **Pierna de golpeo** | Pierna que impacta el balón (detectada automáticamente) |
| **Áng. Cadera** | Ángulo de la cadera de la pierna de golpeo en el frame de impacto (grados) |
| **Áng. Rodilla** | Ángulo de la rodilla de la pierna de golpeo en el impacto (grados) |
| **Áng. Tobillo** | Ángulo del tobillo de la pierna de golpeo en el impacto (grados) |
| **Estabilidad tronco** | Score 0–100 de la estabilidad lateral del tronco durante el gesto (100 = perfecto) |
| **Confianza** | Porcentaje de frames en los que MediaPipe detectó correctamente la pose |
| **Vel. pie (m/s)** | Velocidad del pie de golpeo en el momento del impacto (m/s) |
| **Frame impacto** | Número de frame donde se detectó el impacto |
| **Asimetría (%)** | Diferencia media entre lado izquierdo y derecho de la postura. Alerta si > 15% |
| **Apoyo (score)** | Estabilidad angular de la rodilla de apoyo durante el impacto (0–100) |
| **Clasificación** | Categoría del golpeo: `tecnica_estable`, `inestable`, `asimetrico`, `tecnico_lento`, `potente_estable`, `fatigado` |

##### Score compuesto (0–100)

Puntuación global de la ejecución ponderando velocidad (40%), estabilidad (25%), confianza (20%) y ángulo de cadera (15%).

| Rango | Interpretación |
|-------|----------------|
| 80–100 | Ejecución óptima |
| 60–79 | Ejecución correcta con margen de mejora |
| 40–59 | Técnica mejorable |
| < 40 | Requiere corrección |

##### Alertas biomécanicas

El sistema genera alertas automáticas cuando detecta desviaciones técnicas:

| Alerta | Condición | Severidad |
|--------|-----------|-----------|
| Rodilla excesivamente extendida | Áng. rodilla > 165° en el impacto | Media |
| Armado corto | Áng. cadera < 130° antes del impacto | Media |
| Tronco inestable | Estabilidad tronco < 60 | Alta |
| Pierna de apoyo inestable | Score apoyo < 50 | Alta |
| Postura asimétrica | Asimetría > 15% | Media |
| Velocidad del pie baja | Vel. pie < 8 m/s | Media |
| Detección baja | Confianza < 60% | Baja |

##### Fases del gesto

El sistema detecta automáticamente 4 fases:

| Fase | Descripción |
|------|-------------|
| **Aproximación** | Carrera previa al golpeo |
| **Armado** | Flexion máxima de cadera antes del impacto |
| **Impacto** | Ventana de frames alrededor del contacto con el balón |
| **Follow-through** | Extensión tras el impacto |

##### Gráficas de curvas angulares

Dos gráficas Chart.js muestran la evolución de ángulos frame a frame:
- **Cadera, Rodilla y Tobillo vs. tiempo** (grados)
- **Velocidades articulares** (grados/segundo)

#### 6. Vídeo anotado

Pulsa **"Ver vídeo anotado"** para generar un MP4 con overlay:
- Esqueleto de landmarks dibujado sobre cada frame.
- Ángulos de rodilla y cadera en tiempo real.
- Marcador del frame de impacto.

#### 7. Biblioteca de vídeos

- Pulsa **"Abrir biblioteca de vídeos"** para ver el historial de golpeos guardados.
- Puedes filtrar por usuario y reproducir los vídeos anotados anteriores.
- En modo comparativa, se muestra una tabla con los 4 tiros de cada sesión.

---

### Consejos para mejores resultados

- Graba de cuerpo entero, con la cámara fija y perpendicular al tiro.
- Asegúrate de que ambos pies y la cabeza son visibles en todo momento.
- Iluminación uniforme y fondo liso (pared o césped homogéneo).
- Evita que haya otras personas en el encuadre.
- Si la confianza es < 60%, repite la grabación con mejores condiciones de luz.
- Velocidades < 5 m/s suelen indicar un encuadre incorrecto o que el balón no se golpeó.

---

## 6. Módulo Sensor Arduino

### ¿Qué hace?

Muestra en tiempo real la distancia medida por un sensor ultrasónico HC-SR04 conectado al Arduino.

### Requisitos de hardware

- Arduino con sensor HC-SR04 conectado y sketch cargado.
- Arduino conectado por USB al ordenador.
- Backend del sensor ejecutándose (`python app.py` en `modules/sensor/backend`).

### Paso a paso

#### 1. Conectar

Pulsar **"Conectar sensor"**. La app empezará a leer datos cada segundo.

#### 2. Leer la medición

| Elemento | Descripción |
|----------|-------------|
| **Badge de estado** | Verde = "Conectado" · Rojo = "Desconectado" |
| **Distancia medida** | Valor en centímetros, actualizado cada segundo |
| **Última lectura** | Hora exacta de la última medición recibida |

#### 3. Detener

Pulsar **"Detener"** para dejar de consultar al sensor.

> **Nota:** Si el badge se queda en rojo tras pulsar "Conectar sensor", verifica que el backend está arrancado en el puerto 5000 y que el Arduino está conectado por USB.

---

## 7. Acceso desde el móvil

Si quieres grabar un salto con la cámara del móvil:

1. El ordenador y el móvil deben estar en la **misma red WiFi**.
2. En el ordenador, averigua tu IP local:
   ```powershell
   ipconfig
   ```
   Busca la dirección IPv4 (ej: `192.168.1.42`).
3. En el móvil, abre el navegador y escribe: `http://192.168.1.42:8080`
4. Si la cámara no se activa, puede ser porque el navegador exige HTTPS. Solución rápida en Chrome Android:
   - Ir a `chrome://flags`
   - Buscar **"Insecure origins treated as secure"**
   - Añadir `http://192.168.1.42:8080`
   - Reiniciar Chrome

---

## 8. Solución de problemas

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| "Error al conectar con localhost:5001" | Backend de salto no está arrancado | Ejecutar `python app.py` en `modules/salto/backend` |
| "Error al conectar con localhost:5000" | Backend del sensor no está arrancado | Ejecutar `python app.py` en `modules/sensor/backend` |
| La camara no se activa | No se dieron permisos / no hay HTTPS | Aceptar permisos del navegador. Desde movil, ver seccion 7 |
| "Introduce una altura válida" | Campo de altura vacío o con valor ≤ 0 | Escribir la estatura en metros (ej: 1.75) |
| "Extensión no permitida" | Formato de vídeo no soportado | Usar .mp4, .webm, .avi o .mov |
| Badge rojo en sensor | Arduino no conectado o backend caído | Verificar USB + que el backend esté corriendo |
| Los resultados no parecen correctos | Mala grabación o poca iluminación | Repetir grabación siguiendo los consejos de la sección 4 |

---

## 9. API REST — Usuarios, Saltos y Comparativa

El backend del módulo salto (puerto 5001) expone, además del endpoint de cálculo, una API CRUD completa para gestionar usuarios y saltos en base de datos MySQL.

### 9.1 Usuarios

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/usuarios` | Lista todos los usuarios |
| `POST` | `/api/usuarios` | Crea un usuario (JSON: `alias`, `nombre_completo`, `altura_m`, `peso_kg` opcional) |
| `GET` | `/api/usuarios/<id>` | Obtiene un usuario por ID |
| `PUT` | `/api/usuarios/<id>` | Actualiza un usuario (JSON: mismos campos) |
| `DELETE` | `/api/usuarios/<id>` | Elimina un usuario y todos sus saltos (CASCADE) |

### 9.2 Saltos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/saltos` | Lista todos los saltos |
| `POST` | `/api/saltos` | Registra un salto manualmente (JSON: `id_usuario`, `tipo_salto`, `distancia_cm`, `metodo_origen`) |
| `GET` | `/api/saltos/<id>` | Obtiene un salto por ID |
| `PUT` | `/api/saltos/<id>` | Actualiza un salto (JSON: `tipo_salto`, `distancia_cm`, `metodo_origen`; opcionales: `tiempo_vuelo_s`, `confianza_ia`) |
| `DELETE` | `/api/saltos/<id>` | Elimina un salto |
| `GET` | `/api/usuarios/<id>/saltos` | Lista los saltos de un usuario |

### 9.3 Progreso y comparativa

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/usuarios/<id>/progreso` | Cuántos saltos tiene y cuántos le faltan (mín. 4+4) |
| `GET` | `/api/usuarios/<id>/comparativa` | Estadísticas por tipo (mejor, peor, media, último, evolución). Devuelve 403 si no cumple el mínimo |

### 9.4 Guardado automatico desde el calculo

El endpoint `POST /api/salto/calcular` acepta opcionalmente:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id_usuario` | int | Si se envía, el resultado se guarda automáticamente en BD |
| `metodo_origen` | string | `"ia_vivo"`, `"video_galeria"` o `"sensor_arduino"` (por defecto: `video_galeria`) |
| `guardar_video_bd` | bool | Si es `true` y se guarda salto, persiste el vídeo en BD |
| `incluir_landmarks` | bool | Si es `true`, la respuesta puede incluir `landmarks_frames` para el visor 2D/3D |

La respuesta incluirá `id_salto` si el guardado fue exitoso.

### 9.5 Base de datos

MySQL con base de datos `bd_anim3d_saltos`. Dos tablas:

- **`usuarios`** — `id_usuario`, `alias` (UNIQUE), `nombre_completo`, `altura_m`, `peso_kg`, `fecha_registro`
- **`saltos`** — `id_salto`, `id_usuario` (FK), `tipo_salto`, `distancia_cm`, `tiempo_vuelo_s`, `confianza_ia`, `metodo_origen`, `fecha_salto`, `video_blob`, `video_nombre`, `video_mime`

La conexión se configura en `modules/salto/backend/config.py` (`DB_CONFIG`).

### 9.6 Analitica avanzada

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/usuarios/<id>/fatiga?tipo=vertical` | Fatiga intra-sesión: pendiente, nº saltos, caída %, alerta si >10 % |
| `GET` | `/api/usuarios/<id>/tendencia?tipo=vertical` | Tendencia histórica: pendiente cm/semana, R², predicción 4 semanas, estado (mejorando/estancado/empeorando) |

Ambos endpoints aceptan `?tipo=vertical` o `?tipo=horizontal` (por defecto: `vertical`).

### 9.7 Video anotado

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/salto/video-anotado` | Procesa un vídeo y devuelve una versión anotada con overlay de landmarks, ángulos y eventos |

**Form-data:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `video` | archivo | Siempre | Vídeo .mp4 / .webm / .avi / .mov |
| `tipo_salto` | string | Siempre | `"vertical"` o `"horizontal"` |
| `altura_real_m` | float | Siempre | Altura real del usuario en metros |

**Respuesta:** descarga directa del vídeo anotado como `.mp4`.

---

### 9.8 Futbol — usuarios, golpeos y videos

El backend del modulo futbol (puerto 5002) expone endpoints equivalentes para usuarios y guardado de golpeos.

#### Usuarios

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `GET` | `/api/usuarios_futbol` | Lista usuarios (soporta `paginado=1`) |
| `POST` | `/api/usuarios_futbol` | Crea usuario (`alias`, `nombre_completo`, `altura_m`, `peso_kg` opcional) |
| `GET` | `/api/usuarios_futbol/<id>` | Obtiene usuario |
| `PUT` | `/api/usuarios_futbol/<id>` | Actualiza usuario |
| `DELETE` | `/api/usuarios_futbol/<id>` | Elimina usuario y sus golpeos (CASCADE) |

#### Golpeos

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `POST` | `/api/futbol/analizar` | Analiza video y opcionalmente guarda en BD. Devuelve metricas + curvas + fases + alertas + clasificacion |
| `POST` | `/api/futbol/video-anotado` | Devuelve MP4 con overlay (esqueleto, angulos, banner de impacto, trayectoria del pie) |
| `GET` | `/api/golpeos` | Lista golpeos guardados |
| `GET` | `/api/golpeos/<id>` | Obtiene un golpeo |
| `GET` | `/api/golpeos/<id>/curvas` | Curvas angulares por frame |
| `GET` | `/api/golpeos/<id>/landmarks` | Landmarks por frame (visor) |
| `GET` | `/api/golpeos/<id>/alertas` | Alertas almacenadas |
| `DELETE` | `/api/golpeos/<id>` | Elimina un golpeo |

#### Analitica por jugador

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `GET` | `/api/usuarios_futbol/<id>/fatiga?metrica=velocidad_pie_ms` | Fatiga intra-sesion (ventana 2h): pendiente, caida % |
| `GET` | `/api/usuarios_futbol/<id>/tendencia?metrica=&semanas=4` | Regresion lineal sobre historial. Estado: mejorando/estancado/empeorando |
| `GET` | `/api/usuarios_futbol/<id>/comparativa?n=4` | Ultimas N patadas con metricas clave |

#### Videos

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `GET` | `/api/videos` | Biblioteca de videos guardados (filtro `id_usuario`) |
| `GET` | `/api/videos/<id>/stream` | Streaming del video guardado |

#### Guardado automatico desde el analisis

El endpoint `POST /api/futbol/analizar` acepta:

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `id_usuario` | int | Si se envia, el resultado se guarda automaticamente |
| `guardar_bd` | bool | Fuerza el guardado del golpeo en BD |
| `guardar_video_bd` | bool | Si es `true`, guarda el video en BD |
| `metodo_origen` | string | `ia_vivo` o `video_galeria` |
| `incluir_landmarks` | bool | Si es `true`, incluye landmarks en la respuesta |
