# Manual de Usuario — Anim3D Tracking

Guía paso a paso para usar la aplicación web de medición física.

---

## Índice

1. [Requisitos previos](#1-requisitos-previos)
2. [Arrancar la aplicación](#2-arrancar-la-aplicación)
3. [Pantalla principal (Landing)](#3-pantalla-principal)
4. [Módulo Cámara / Salto](#4-módulo-cámara--salto)
5. [Módulo Sensor Arduino](#5-módulo-sensor-arduino)
6. [Acceso desde el móvil](#6-acceso-desde-el-móvil)
7. [Solución de problemas](#7-solución-de-problemas)

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
El frontend arranca en **HTTPS** en el puerto **8443**. Abrir: **https://localhost:8443**

> **Nota:** si es la primera vez, el navegador mostrará un aviso de certificado autofirmado. Pulsar "Avanzado" → "Continuar" para aceptarlo.

### Opción manual — HTTPS (recomendada)

Abrir tres terminales y ejecutar en cada una:

| Terminal | Comando | Puerto |
|----------|---------|--------|
| Backend Salto | `cd modules\salto\backend` → `python app.py` | 5001 |
| Backend Sensor | `cd modules\sensor\backend` → `python app.py` | 5000 |
| Frontend Web (HTTPS) | `python scripts\https_server.py` | 8443 |

Si aún no tienes certificados, genéralos primero:

```powershell
python scripts\generate_cert.py
```

Una vez arrancado, abrir en el navegador: **https://localhost:8443**

### Opción manual — HTTP (sin cámara en móvil)

Si no necesitas HTTPS (solo consultar datos, sin usar cámara desde móvil):

| Terminal | Comando | Puerto |
|----------|---------|--------|
| Backend Salto | `cd modules\salto\backend` → `python app.py` | 5001 |
| Backend Sensor | `cd modules\sensor\backend` → `python app.py` | 5000 |
| Frontend Web (HTTP) | `cd integration\web` → `python -m http.server 8080` | 8080 |

Una vez arrancado, abrir en el navegador: **http://localhost:8080**

> **Importante:** el acceso por HTTP no permite usar la cámara desde el móvil (los navegadores exigen HTTPS). Para grabar saltos desde el móvil usa la opción HTTPS.

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

#### 5. Repetir

Pulsar **"Nuevo Salto"** para volver a la vista de cámara y hacer otro intento.

### Consejos para mejores resultados

- Graba de cuerpo entero, con la cámara fija y perpendicular al salto.
- La iluminación debe ser buena y uniforme.
- Evita que haya otras personas en el encuadre.
- Idealmente el fondo debe ser liso (una pared, por ejemplo).

---

## 5. Módulo Sensor Arduino

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

## 6. Acceso desde el móvil

Si quieres grabar un salto con la cámara del móvil:

1. El ordenador y el móvil deben estar en la **misma red WiFi**.
2. En el ordenador, averigua tu IP local:
   ```powershell
   ipconfig
   ```
   Busca la dirección IPv4 (ej: `192.168.1.42`).

### Opción A — HTTPS (recomendada)

3. Genera el certificado incluyendo la IP LAN (se hace automáticamente):
   ```powershell
   python scripts\generate_cert.py
   ```
4. Arranca el frontend HTTPS: `python scripts\https_server.py`
5. En el móvil, abre el navegador y escribe: `https://192.168.1.42:8443`
6. Acepta el aviso de certificado autofirmado ("Avanzado" → "Continuar").
7. La cámara funcionará directamente porque el navegador detecta HTTPS.

### Opción B — HTTP (sin HTTPS)

3. Arranca el frontend HTTP: `cd integration\web` → `python -m http.server 8080`
4. En el móvil, abre el navegador y escribe: `http://192.168.1.42:8080`
5. Si la cámara no se activa, es porque el navegador exige HTTPS. Solución en Chrome Android:
   - Ir a `chrome://flags`
   - Buscar **"Insecure origins treated as secure"**
   - Añadir `http://192.168.1.42:8080`
   - Reiniciar Chrome

---

## 7. Solución de problemas

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| "Error al conectar con localhost:5001" | Backend de salto no está arrancado | Ejecutar `python app.py` en `modules/salto/backend` |
| "Error al conectar con localhost:5000" | Backend del sensor no está arrancado | Ejecutar `python app.py` en `modules/sensor/backend` |
| La cámara no se activa | No se dieron permisos / no hay HTTPS | Aceptar permisos del navegador. Desde móvil, usar HTTPS (ver sección 6, opción A) |
| "Introduce una altura válida" | Campo de altura vacío o con valor ≤ 0 | Escribir la estatura en metros (ej: 1.75) |
| "Extensión no permitida" | Formato de vídeo no soportado | Usar .mp4, .webm, .avi o .mov |
| Badge rojo en sensor | Arduino no conectado o backend caído | Verificar USB + que el backend esté corriendo |
| Los resultados no parecen correctos | Mala grabación o poca iluminación | Repetir grabación siguiendo los consejos de la sección 4 |

---

## 8. API REST — Usuarios, Saltos y Comparativa

El backend del módulo salto (puerto 5001) expone, además del endpoint de cálculo, una API CRUD completa para gestionar usuarios y saltos en base de datos MySQL.

### 8.1 Usuarios

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/usuarios` | Lista todos los usuarios |
| `POST` | `/api/usuarios` | Crea un usuario (JSON: `alias`, `nombre_completo`, `altura_m`, `peso_kg` opcional) |
| `GET` | `/api/usuarios/<id>` | Obtiene un usuario por ID |
| `PUT` | `/api/usuarios/<id>` | Actualiza un usuario (JSON: mismos campos) |
| `DELETE` | `/api/usuarios/<id>` | Elimina un usuario y todos sus saltos (CASCADE) |

### 8.2 Saltos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/saltos` | Lista todos los saltos |
| `POST` | `/api/saltos` | Registra un salto manualmente (JSON: `id_usuario`, `tipo_salto`, `distancia_cm`, `metodo_origen`) |
| `GET` | `/api/saltos/<id>` | Obtiene un salto por ID |
| `PUT` | `/api/saltos/<id>` | Actualiza un salto (JSON: `tipo_salto`, `distancia_cm`, `metodo_origen`; opcionales: `tiempo_vuelo_s`, `confianza_ia`) |
| `DELETE` | `/api/saltos/<id>` | Elimina un salto |
| `GET` | `/api/usuarios/<id>/saltos` | Lista los saltos de un usuario |

### 8.3 Progreso y comparativa

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/usuarios/<id>/progreso` | Cuántos saltos tiene y cuántos le faltan (mín. 4+4) |
| `GET` | `/api/usuarios/<id>/comparativa` | Estadísticas por tipo (mejor, peor, media, último, evolución). Devuelve 403 si no cumple el mínimo |

### 8.4 Guardado automático desde el cálculo

El endpoint `POST /api/salto/calcular` acepta opcionalmente:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id_usuario` | int | Si se envía, el resultado se guarda automáticamente en BD |
| `metodo_origen` | string | `"ia_vivo"`, `"video_galeria"` o `"sensor_arduino"` (por defecto: `video_galeria`) |
| `guardar_video_bd` | bool | Si es `true` y se guarda salto, persiste el vídeo en BD |

La respuesta incluirá `id_salto` si el guardado fue exitoso.

### 8.5 Base de datos

MySQL con base de datos `bd_anim3d_saltos`. Dos tablas:

- **`usuarios`** — `id_usuario`, `alias` (UNIQUE), `nombre_completo`, `altura_m`, `peso_kg`, `fecha_registro`
- **`saltos`** — `id_salto`, `id_usuario` (FK), `tipo_salto`, `distancia_cm`, `tiempo_vuelo_s`, `confianza_ia`, `metodo_origen`, `fecha_salto`, `video_blob`, `video_nombre`, `video_mime`

La conexión se configura en `modules/salto/backend/config.py` (`DB_CONFIG`).

### 8.6 Analítica avanzada

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/usuarios/<id>/fatiga?tipo=vertical` | Fatiga intra-sesión: pendiente, nº saltos, caída %, alerta si >10 % |
| `GET` | `/api/usuarios/<id>/tendencia?tipo=vertical` | Tendencia histórica: pendiente cm/semana, R², predicción 4 semanas, estado (mejorando/estancado/empeorando) |

Ambos endpoints aceptan `?tipo=vertical` o `?tipo=horizontal` (por defecto: `vertical`).

### 8.7 Vídeo anotado

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
