# Ejecución del Proyecto: Web y Backend de Salto

Esta guía detalla los pasos necesarios para iniciar el entorno de desarrollo local, activando tanto el motor de visión artificial (backend) como la interfaz de usuario (frontend).

## 1. Iniciar el Backend (Motor de IA)

El servidor Python es responsable de procesar los vídeos utilizando MediaPipe y devolver las mediciones. Es necesario arrancarlo en primer lugar.

1. Abrir una terminal.
2. Navegar al directorio del backend:

```bash
cd modules/salto/backend
```

3. Ejecutar el script principal:

```bash
python app.py
```

**Nota:** La terminal debe indicar que el servicio está activo y escuchando en el puerto 5001.

## 2. Iniciar el Frontend (Interfaz Web)

La página web necesita su propio servidor de archivos estáticos para cargar los recursos (HTML, CSS, JS) y permitir la conexión desde otros dispositivos en la red.

1. Abrir una nueva terminal (es imprescindible mantener la del backend ejecutándose en segundo plano).
2. Navegar al directorio donde se encuentra la web:

```bash
cd integration/web
```

3. Levantar el servidor frontend:

**HTTPS (recomendado) — ejecutar desde la raíz del proyecto:**
```bash
python scripts/https_server.py
```

**HTTP (sin cámara en móvil) — ejecutar desde integration/web:**
```bash
python -m http.server 8080
```

## 3. Acceder a la Aplicación

El método de acceso varía dependiendo de si se utiliza el mismo equipo de desarrollo o un dispositivo externo.

### Pruebas desde el mismo ordenador

Abrir cualquier navegador web y escribir la siguiente dirección:

https://localhost:8443

> Si se usa HTTP: `http://localhost:8080`

### Pruebas desde un dispositivo móvil (Recomendado para usar la cámara)

1. El teléfono móvil y el ordenador principal deben estar conectados a la misma red WiFi.
2. Averiguar la dirección IP local del ordenador (por ejemplo, mediante el comando `ipconfig` en Windows o `ifconfig` en macOS/Linux). Suelen tener el formato `192.168.1.X`.
3. Abrir el navegador en el teléfono móvil y escribir la IP seguida del puerto:

https://192.168.1.X:8443

> Aceptar el aviso de certificado autofirmado. Si se usa HTTP en vez de HTTPS, usar `http://192.168.1.X:8080` (la cámara puede no funcionar).

## Resolución de Problemas (Troubleshooting)

### Pantalla negra en la cámara (Dispositivos Móviles)

Por políticas de seguridad, los navegadores bloquean la cámara en conexiones no seguras (`http://` con IPs locales). Para sortear esta restricción en entornos de desarrollo utilizando Android/Chrome:

1. Escribir `chrome://flags/#unsafely-treat-insecure-origin-as-secure` en la barra de direcciones del navegador móvil.
2. Cambiar el menú desplegable resaltado a **Enabled**.
3. En el cuadro de texto inferior, introducir la dirección completa utilizada para acceder (ej. `http://192.168.1.130:8080`).
4. Pulsar el botón de reinicio del navegador que aparecerá en la parte inferior de la pantalla.

## Interfaz Gráfica

A continuación se muestra el diseño de las pantallas principales de la aplicación:

| Pantalla de Inicio | Cámara en Vivo  |
| :---: | :---: |
| ![Inicio](../img/capturas/inicio.jpeg) | ![Cámara Salto](../img/capturas/salto.jpeg) |
| **Resultados del Análisis** | **Monitor del Sensor Ultrasónico** |
| ![Resultados](../img/capturas/resultados.jpeg) | ![Monitor Sensor](../img/capturas/sensor.jpeg) |
