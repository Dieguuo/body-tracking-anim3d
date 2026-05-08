# body-tracking-anim3d

Plataforma web modular para captura, procesamiento y visualización de **mediciones físicas en tiempo real**.

📖 **[Manual de usuario](MANUAL_USUARIO.md)** · 📋 **[Changelog](CHANGELOG.md)**

El proyecto integra múltiples fuentes de datos (Arduino, sensores móviles) bajo una misma arquitectura:

```
Dispositivo físico → Python (backend) → Flask (API REST) → Interfaz web
```

Cada funcionalidad se desarrolla como un **módulo independiente**. Los módulos se unen en la fase de integración final bajo una única app web.

Documentación detallada en [`docs/`](docs/).

---

## Módulos del proyecto

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| **Módulo 1 — Sensor Arduino** | ✅ Completado | Mide distancia con HC-SR04, expone los datos via API REST |
| **Módulo 2 — Salto con móvil** | ✅ Backend completado | Analiza vídeo con MediaPipe, calcula salto vertical/horizontal, análisis biomecánico completo |
| **Módulo 3 — Futbol con móvil** | ✅ Backend inicial | Analiza vídeo con MediaPipe, calcula métricas de golpeo |
| **Base de datos** | ✅ Unificada (`bd_anim3d`) | MySQL — esquema único compartido por salto y futbol. Ver [`scripts/README_BBDD_UNIFICADA.md`](scripts/README_BBDD_UNIFICADA.md) |
| **Integración web** | ✅ Completada | Frontend web unificado (landing + salto + futbol + sensor) |

---

## Estructura del proyecto

```
body-tracking-anim3d/
│
├── README.md
├── requirements.txt
│
├── docs/
│   ├── arquitectura.md          ← Diagrama de capas y tecnologías
│   ├── flujo_datos.md           ← Paso a paso del dato desde el dispositivo al navegador
│   ├── fases_proyecto.md        ← Estado de cada fase
│   └── decisiones_tecnicas.md   ← Justificaciones de diseño
│
├── modules/
│   ├── sensor/                  ← Módulo 1 (completado)
│   │   ├── README.md
│   │   ├── arduino/
│   │   │   └── sensor_distancia/
│   │   │       ├── sensor_distancia.ino
│   │   │       └── README.md
│   │   └── backend/             ← Python MVC + Flask API (GET /distancia)
│   │       ├── app.py
│   │       ├── main.py          ← Entry point consola (sin web)
│   │       ├── config.py
│   │       ├── controllers/
│   │       ├── models/
│   │       └── views/
│   │
│   └── salto/                   ← Módulo 2 (backend completado)
│       ├── README.md
│       ├── backend/             ← Python MVC + Flask API + MediaPipe + MySQL
│       │   ├── app.py           ← Entry point web (cálculo + CRUD usuarios/saltos)
│       │   ├── config.py        ← Constantes + DB_CONFIG
│       │   ├── pose_landmarker_lite.task
│       │   ├── controllers/     ← salto_controller + usuario_controller + salto_db_controller
│       │   ├── models/          ← video_processor + db + usuario_model + salto_model
│       │   └── services/        ← calculo + biomecanica + aterrizaje + cinematico + video_anotado + analitica + comparativa
│       └── mobile/              # Reservado — cliente móvil
│
│   └── futbol/                  ← Módulo 3 (backend inicial)
│       ├── README.md
│       ├── backend/             ← Python MVC + Flask API + MediaPipe + MySQL
│       └── mobile/              # Reservado — cliente móvil
│
├── integration/
│   ├── README.md
│   └── web/                     ← Frontend web unificado
│       ├── index.html           ← Landing con cards de módulos
│       ├── salto.html           ← Grabación + análisis de salto
│       ├── futbol.html          ← Grabación + análisis de golpeo
│       ├── arduino.html         ← Lectura sensor en tiempo real
│       ├── css/style.css
│       └── js/
│           ├── app.js           ← Animaciones del landing
│           ├── camara.js        ← Grabación vídeo / subida archivo
│           ├── api_salto.js     ← Envío a API salto + resultados
│           ├── api_futbol.js    ← Envío a API futbol + resultados
│           ├── futbol.js        ← UI y grabación del módulo futbol
│           └── api_sensor.js    ← Polling a API sensor
│
├── scripts/
│   ├── run_all.bat              ← Arranca todo con un doble-clic (HTTPS por defecto)
│   ├── https_server.py          ← Servidor estático HTTPS para integration/web
│   └── generate_cert.py         ← Genera certificado local para localhost/LAN
│
├── tests/                       # Reservado
│
└── img/                         # imágenes, capturas, etc.
```

---

## Cómo ejecutar

### Prerrequisitos

```powershell
# Desde la raíz del proyecto
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Arranque rápido (recomendado, HTTPS)

Doble clic en `scripts\run_all.bat` y abre `https://localhost:8443`.

Si no tienes certificado o cambiaste de red:

```powershell
.\.venv\Scripts\python.exe scripts\generate_cert.py
```

### Arranque manual

**Backend salto (puerto 5001):**
```powershell
cd modules\salto\backend
python app.py
```

**Backend futbol (puerto 5002):**
```powershell
cd modules\futbol\backend
python app.py
```

**Backend sensor (puerto 5000, requiere Arduino conectado):**
```powershell
cd modules\sensor\backend
python app.py
```

**Frontend web HTTPS (puerto 8443):**
```powershell
cd .
python scripts\https_server.py
```

Abrir `https://localhost:8443` en el navegador.

### Modo HTTP (legacy / compatibilidad)

También se puede ejecutar en HTTP para pruebas locales antiguas:

**Frontend web HTTP (puerto 8080):**
```powershell
cd integration\web
python -m http.server 8080
```

Abrir `http://localhost:8080` en el navegador.

Nota importante para HTTP: los backends arrancan en HTTPS automáticamente si existen `certs/cert.pem` y `certs/key.pem`. Para trabajar todo en HTTP, arranca sin certificados locales.

### Modo consola del sensor (sin web, para test rápido)

```powershell
cd modules\sensor\backend
python main.py
```

---

## Arquitectura del módulo sensor

```
Arduino (HC-SR04)
      │  Serial USB · 9600 baudios · cada 500 ms
      ▼
SensorSerial          (Model)       — lee y parsea líneas del puerto serie
      │
DistanciaController   (Controller)  — hilo daemon + estado thread-safe
      │
app.py / Flask        (API)         — GET /distancia → JSON
      │
frontend/app.js       (Frontend)    — fetch cada 1 s → actualiza DOM
```

---

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [docs/arquitectura.md](docs/arquitectura.md) | Diagrama de capas y tecnologías |
| [docs/flujo_datos.md](docs/flujo_datos.md) | Paso a paso del dato desde el dispositivo al navegador |
| [docs/fases_proyecto.md](docs/fases_proyecto.md) | Estado de cada fase del proyecto |
| [docs/decisiones_tecnicas.md](docs/decisiones_tecnicas.md) | Justificaciones de diseño (hilos, locks, parseo, MVC, BD, biomecánica) |
| [docs/futbol.md](docs/futbol.md) | Descripción del módulo de futbol |
| [docs/manual_usuario.md](docs/manual_usuario.md) | Guía de uso paso a paso para el usuario final |
