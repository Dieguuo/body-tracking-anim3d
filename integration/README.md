# Ejecución del Proyecto

Esta guía detalla los pasos necesarios para iniciar el entorno de desarrollo local.

## Arranque rápido (recomendado)

Hacer doble clic en:

```
scripts\run_all.bat
```

Esto arranca automáticamente los tres servicios:

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| Backend Salto | 5001 | API de análisis de saltos (MediaPipe) |
| Backend Sensor | 5000 | API del sensor Arduino (requiere Arduino conectado) |
| Frontend Web | 8080 | Interfaz web unificada |

Después, abrir `http://localhost:8080` en el navegador.

## Arranque manual (si se prefiere)

### 1. Backend del salto (puerto 5001)

```bash
cd modules/salto/backend
python app.py
```

### 2. Backend del sensor (puerto 5000, opcional)

Requiere Arduino con HC-SR04 conectado por USB.

```bash
cd modules/sensor/backend
python app.py
```

### 3. Frontend web (puerto 8080)

```bash
cd integration/web
python -m http.server 8080
```

## Acceder a la Aplicación

El método de acceso varía dependiendo de si se utiliza el mismo equipo de desarrollo o un dispositivo externo.

### Pruebas desde el mismo ordenador

Abrir cualquier navegador web y escribir la siguiente dirección:

http://localhost:8080

### Pruebas desde un dispositivo móvil (Recomendado para usar la cámara)

1. El teléfono móvil y el ordenador principal deben estar conectados a la misma red WiFi.
2. Averiguar la dirección IP local del ordenador (por ejemplo, mediante el comando `ipconfig` en Windows o `ifconfig` en macOS/Linux). Suelen tener el formato `192.168.1.X`.
3. Abrir el navegador en el teléfono móvil y escribir la IP seguida del puerto:

http://192.168.1.X:8080

## Resolución de Problemas (Troubleshooting)

### Pantalla negra en la cámara (Dispositivos Móviles)

Por políticas de seguridad, los navegadores bloquean la cámara en conexiones no seguras (`http://` con IPs locales). Para sortear esta restricción en entornos de desarrollo utilizando Android/Chrome:

1. Escribir `chrome://flags/#unsafely-treat-insecure-origin-as-secure` en la barra de direcciones del navegador móvil.
2. Cambiar el menú desplegable resaltado a **Enabled**.
3. En el cuadro de texto inferior, introducir la dirección completa utilizada para acceder (ej. `http://192.168.1.130:8080`).
4. Pulsar el botón de reinicio del navegador que aparecerá en la parte inferior de la pantalla.
