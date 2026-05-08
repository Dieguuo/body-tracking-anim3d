# Manual de Usuario — body-tracking-anim3d

Plataforma web para análisis biomecánico de movimiento deportivo mediante visión artificial.

---

## Índice

1. [Requisitos](#1-requisitos)
2. [Arrancar la aplicación](#2-arrancar-la-aplicación)
3. [Pantalla principal (Landing)](#3-pantalla-principal-landing)
4. [Módulo Salto](#4-módulo-salto)
5. [Módulo Fútbol](#5-módulo-fútbol)
6. [Módulo Sensor](#6-módulo-sensor)
7. [Visor 3D (Salto y Fútbol)](#7-visor-3d-salto-y-fútbol)
8. [Preguntas frecuentes](#8-preguntas-frecuentes)

---

## 1. Requisitos

### Sistema

| Requisito | Mínimo |
|-----------|--------|
| SO | Windows 10 / 11 |
| Python | 3.10 o superior |
| MySQL | 8.0 |
| Navegador | Chrome 110+ / Edge 110+ (WebGL y MediaPipe) |
| Cámara | Cualquier cámara compatible con el navegador |

> **Nota:** Firefox no está soportado para los módulos de cámara en tiempo real (restricciones de MediaPipe WASM).

### Primera vez

Si es la primera vez que arrancas el proyecto:

```powershell
# 1. Activar entorno virtual
.\.venv\Scripts\Activate.ps1

# 2. Instalar dependencias
pip install -r requirements.txt

# 3. Crear la base de datos (MySQL debe estar corriendo)
mysql -u root -p < scripts\init_db.sql

# 4. Generar el certificado HTTPS local
.\.venv\Scripts\python.exe scripts\generate_cert.py
```

---

## 2. Arrancar la aplicación

### Opción rápida (recomendada)

Doble clic en:

```
scripts\run_all.bat
```

Abre 4 ventanas automáticamente (backend salto, backend fútbol, backend sensor y el servidor web HTTPS) y abre el navegador en:

```
https://localhost:8443
```

> El navegador mostrará un aviso de certificado no reconocido. Pulsa **"Avanzado → Continuar"**. Es un certificado local autofirmado, completamente seguro para desarrollo.

### Opción manual (si algún servicio ya está corriendo)

```powershell
# Backend salto (puerto 5001)
cd modules\salto\backend
python app.py

# Backend fútbol (puerto 5002)
cd modules\futbol\backend
python app.py

# Backend sensor (puerto 5000)
cd modules\sensor\backend
python app.py

# Frontend web HTTPS (puerto 8443)
python scripts\https_server.py
```

### Desde móvil (misma red WiFi)

```powershell
# Genera el certificado con la IP de tu máquina
.\.venv\Scripts\python.exe scripts\generate_cert.py
```

Luego abre en el móvil:

```
https://<IP_DE_TU_PC>:8443
```

Donde `<IP_DE_TU_PC>` es la dirección que aparece al ejecutar `ipconfig` (interfaz WiFi).

---

## 3. Pantalla principal (Landing)

Al acceder a `https://localhost:8443` verás las tarjetas de los tres módulos disponibles:

| Tarjeta | Descripción |
|---------|-------------|
| **Salto** | Análisis biomecánico de salto vertical y horizontal |
| **Fútbol** | Análisis de técnica de golpeo de balón |
| **Sensor** | Lectura en tiempo real del sensor de distancia Arduino |

Haz clic en la tarjeta del módulo que quieras usar.

---

## 4. Módulo Salto

Analiza la calidad del salto (vertical u horizontal) con overlay en tiempo real del esqueleto corporal.

### 4.1 Seleccionar usuario

Antes de grabar, selecciona tu perfil de usuario en el desplegable de la parte superior. Si no tienes perfil, ve a la sección **Registro** (enlace en el menú) y crea uno.

### 4.2 Posicionamiento de la cámara

> **La cámara debe estar en posición horizontal (apaisada).**

Si la cámara está en vertical, aparecerá un aviso de pantalla bloqueando el botón hasta que gires el dispositivo.

- Coloca el móvil o cámara de lado, a **2–3 metros de distancia** del saltador.
- La cámara debe quedar a **altura de cintura** aproximadamente.
- Asegúrate de que **todo el cuerpo** es visible en el encuadre.

### 4.3 Grabar el salto

1. Espera a que el overlay del esqueleto (líneas verdes) aparezca sobre tu cuerpo en la vista de cámara. Esto indica que la IA está activa.
2. Pulsa **"Iniciar Detección"**.
3. Realiza el salto.
4. La grabación se detiene automáticamente al detectar el aterrizaje, o puedes pulsar el botón de parar manualmente.

### 4.4 Analizar el vídeo

Una vez grabado el vídeo, pulsa **"Analizar"**. El backend procesará el vídeo y en unos segundos aparecerán:

- **Distancia del salto** (cm)
- **Score biomecánico** (0–100)
- **Métricas de aterrizaje**: estabilidad, simetría de recepción, amortiguación
- **Fase del salto**: despegue, vuelo y aterrizaje detectados automáticamente
- **Ángulos articulares**: rodilla, cadera, tobillo en el punto crítico
- **Alertas**: si se detecta alguna técnica incorrecta (p. ej. "Rodilla en valgo")

### 4.5 Vista de replay con landmarks

Debajo de los resultados encontrarás la sección **"Reproducción con landmarks"** con dos pestañas:

- **Vista 2D**: reproduce el vídeo analizado con el esqueleto superpuesto.
- **Vista 3D**: abre el visor interactivo Three.js (ver sección [7. Visor 3D](#7-visor-3d-salto-y-fútbol)).

---

## 5. Módulo Fútbol

Analiza la técnica de golpeo de balón: velocidad del pie, ángulos articulares en el impacto, estabilidad del tronco y pierna de apoyo.

### 5.1 Seleccionar usuario

Igual que en el módulo Salto, selecciona tu perfil en el desplegable superior antes de grabar.

### 5.2 Posicionamiento de la cámara

> **La cámara debe estar en posición horizontal (apaisada).**

Si la cámara está en vertical, aparecerá el mismo aviso de bloqueo que en el módulo Salto.

- Coloca la cámara **lateral al jugador**, a **3–4 metros** de distancia.
- El balón y el pie de golpeo deben quedar en el encuadre.
- Altura recomendada: **cadera del jugador**.

### 5.3 Grabar el golpeo

1. Espera a que el overlay del esqueleto sea visible en la vista de cámara.
2. Pulsa **"Iniciar grabación"**.
3. Realiza el golpeo al balón.
4. Pulsa **"Parar"** tras el golpeo.

### 5.4 Analizar el golpeo

Pulsa **"Analizar"** y espera los resultados:

- **Score compuesto** (0–100): combina velocidad, estabilidad, confianza y ángulo de cadera.
- **Velocidad del pie** (km/h) en el frame de impacto.
- **Frame de impacto**: fotograma exacto detectado como momento del golpe.
- **Ángulos en el impacto**: rodilla, cadera, tobillo del pie de golpeo.
- **Estabilidad del tronco** (%) durante la fase de golpeo.
- **Pierna de apoyo**: análisis de la estabilidad de la pierna no dominante.
- **Curvas angulares**: evolución de ángulos durante el gesto completo.
- **Alertas biomecánicas**: posibles errores técnicos detectados.

### 5.5 Vista de replay con landmarks

Igual que en el módulo Salto, encontrarás la sección de reproducción con las pestañas **Vista 2D** y **Vista 3D**. El botón **Vista 3D** se activa solo cuando el análisis devuelve datos de landmarks.

En la **Vista 3D** del módulo Fútbol, el slider se posiciona automáticamente en el **frame de impacto** (indicado con ⚡ en la etiqueta).

---

## 6. Módulo Sensor

Muestra en tiempo real la distancia medida por el sensor ultrasónico HC-SR04 conectado via Arduino.

### 6.1 Requisitos

- Arduino conectado por USB con el sketch `sensor_distancia.ino` cargado.
- Backend sensor corriendo (arrancado automáticamente con `run_all.bat`).

### 6.2 Uso

1. Accede a la sección **Sensor** desde el landing.
2. La página mostrará la distancia en centímetros actualizada en tiempo real.
3. También puedes acceder a la consola de datos en `arduino.html`.

---

## 7. Visor 3D (Salto y Fútbol)

Ambos módulos incluyen un visor interactivo 3D del esqueleto corporal tras el análisis.

### Cómo acceder

1. Realiza y analiza un salto o golpeo.
2. En la sección de resultados, busca **"Reproducción con landmarks"**.
3. Pulsa el botón **"Vista 3D"**.

> El botón **Vista 3D** aparece deshabilitado hasta que el análisis finaliza y devuelve los datos de landmarks.

### Controles del visor 3D

| Control | Acción |
|---------|--------|
| **Clic + arrastrar** | Rotar el esqueleto (OrbitControls) |
| **Rueda del ratón** | Zoom |
| **▶ / ⏸** | Reproducir / pausar la animación |
| **Slider** | Navegar frame a frame |
| **×1 / ×½ / ×¼** | Velocidad de reproducción |
| **Etiqueta "⚡ IMPACTO"** | Indica el frame exacto del momento de impacto (solo en fútbol) |

### Volver a Vista 2D

Pulsa el botón **"Vista 2D"** para volver al replay con el vídeo original y el esqueleto superpuesto.

---

## 8. Preguntas frecuentes

**¿Por qué el botón "Iniciar Detección" está deshabilitado?**  
Puede ser porque: (a) la IA aún está cargando — espera unos segundos; (b) no has seleccionado un usuario; (c) la cámara está en modo vertical — gira el dispositivo a horizontal.

**¿Por qué la cámara no arranca?**  
El navegador requiere HTTPS para acceder a la cámara. Asegúrate de entrar por `https://localhost:8443`, no por `http://`. Si el navegador bloquea el certificado, acepta la excepción de seguridad.

**¿El análisis es lento?**  
El procesamiento de vídeo con MediaPipe se hace en el servidor. Vídeos más largos o con más resolución tardan más. Vídeos de 5–15 segundos son suficientes para el análisis.

**El overlay del esqueleto no aparece sobre mi cuerpo en tiempo real**  
Comprueba que hay buena iluminación y que todo el cuerpo es visible. La IA necesita ver al menos el torso y los miembros inferiores para detectar la pose.

**¿Dónde se guardan los análisis?**  
Todos los análisis (saltos y golpeos) se guardan automáticamente en la base de datos MySQL si tienes un usuario seleccionado. Puedes ver el historial en la sección correspondiente de cada módulo.

**¿Puedo subir un vídeo ya grabado en lugar de grabar en directo?**  
Sí. En la sección de vídeos de cada módulo hay opción para subir un archivo de vídeo desde la galería del dispositivo para analizarlo.

**El visor 3D muestra "WebGL no disponible"**  
Tu dispositivo o navegador no soporta WebGL. Prueba con Chrome en un ordenador de escritorio. En algunos móviles muy antiguos WebGL puede estar deshabilitado.
