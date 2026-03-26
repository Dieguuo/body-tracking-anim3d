# Proyecto-Medición

Plataforma web modular para captura, procesamiento y visualización de **mediciones físicas en tiempo real**.

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
| **Módulo 2 — Salto con móvil** | ✅ Backend completado | Analiza vídeo con MediaPipe, calcula salto vertical/horizontal |
| **Base de datos** | ✅ Completada | MySQL — CRUD usuarios/saltos, progreso y comparativa |
| **Integración web** | ✅ Completada | Frontend web unificado (landing + salto + sensor) |

---

## Estructura del proyecto

```
proyecto-medicion/
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
│       │   └── services/        ← calculo_service + comparativa_service
│       └── mobile/              # Reservado — cliente móvil
│
├── integration/
│   ├── README.md
│   ├── backend/                 # Reservado — gateway/orquestador
│   └── web/                     ← Frontend web unificado
│       ├── index.html           ← Landing con cards de módulos
│       ├── salto.html           ← Grabación + análisis de salto
│       ├── arduino.html         ← Lectura sensor en tiempo real
│       ├── css/style.css
│       └── js/
│           ├── app.js           ← Animaciones del landing
│           ├── camara.js        ← Grabación vídeo / subida archivo
│           ├── api_salto.js     ← Envío a API salto + resultados
│           └── api_sensor.js    ← Polling a API sensor
│
├── scripts/
│   └── run_all.bat              ← Arranca todo con un doble-clic
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

### Arranque rápido (todo a la vez)

Doble clic en `scripts\run_all.bat` → abre `http://localhost:8080`.

### Arranque manual

**Backend salto (puerto 5001):**
```powershell
cd modules\salto\backend
python app.py
```

**Backend sensor (puerto 5000, requiere Arduino conectado):**
```powershell
cd modules\sensor\backend
python app.py
```

**Frontend web (puerto 8080):**
```powershell
cd integration\web
python -m http.server 8080
```

Abrir `http://localhost:8080` en el navegador.

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
| [docs/decisiones_tecnicas.md](docs/decisiones_tecnicas.md) | Justificaciones de diseño (hilos, locks, parseo, MVC, BD, reglas de negocio) |
