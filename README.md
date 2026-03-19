# proyecto-medicion

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
| **Módulo 1 — Sensor Arduino** | ✅ Fase 1 completada | Mide distancia con HC-SR04, expone los datos via API REST |
| **Módulo 2 — Salto con móvil** | 🚧 Fase 2 en progreso | Analiza vídeo con MediaPipe, calcula salto vertical/horizontal |
| **Integración final** | 🔒 Fase 3 reservada | Dashboard web unificado que consume todos los módulos |

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
│   └── decisiones_tecnicas.md  ← Justificaciones de diseño
│
├── modules/
│   ├── sensor/                  ← Módulo 1 (Fase 1, activo)
│   │   ├── README.md
│   │   ├── arduino/
│   │   │   └── sensor_distancia/
│   │   │       ├── sensor_distancia.ino
│   │   │       └── README.md
│   │   ├── backend/             ← Python MVC + Flask API
│   │   │   ├── app.py           ← Entry point web (GET /distancia)
│   │   │   ├── main.py          ← Entry point consola (sin web)
│   │   │   ├── config.py        ← Constantes centralizadas
│   │   │   ├── controllers/
│   │   │   ├── models/
│   │   │   ├── views/
│   │   │   ├── services/        # Reservado
│   │   │   └── utils/           # Reservado
│   │   └── frontend/            ← Interfaz web del módulo sensor
│   │       ├── index.html
│   │       ├── js/app.js
│   │       └── css/styles.css
│   │
│   └── salto/                   ← Módulo 2 (Fase 2, backend activo)
│       ├── README.md
│       ├── backend/             ← Python MVC + Flask API + MediaPipe
│       │   ├── app.py           ← Entry point web (POST /api/salto/calcular)
│       │   ├── config.py        ← Constantes centralizadas
│       │   ├── pose_landmarker_lite.task  ← Modelo MediaPipe
│       │   ├── controllers/
│       │   ├── models/
│       │   ├── services/
│       │   └── utils/           # Reservado
│       └── mobile/              # Reservado — cliente móvil
│
├── integration/                 ← Fase 3: dashboard web unificado (reservado)
│   ├── README.md
│   ├── backend/                 # Reservado — orquestador/gateway si se necesita
│   └── frontend/                # Reservado — SPA o dashboard que une todos los módulos
│
├── scripts/
│   ├── run_backend.bat / .sh    ← Arranca la API Flask del módulo sensor
│   └── run_frontend.bat / .sh   ← Sirve el frontend del módulo sensor
│
└── tests/                       ← Reservado — pruebas unitarias e integración
```

---

## Cómo ejecutar (Módulo sensor — Fase 1)

### Prerrequisitos

```powershell
# Desde la raíz del proyecto
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 1. Backend — API Flask

```powershell
# Opción A — script automático (Windows)
scripts\run_backend.bat

# Opción B — manual
cd modules\sensor\backend
python app.py
```

Endpoint disponible en `http://localhost:5000/distancia`:

```json
{
  "valor": 23.45,
  "unidad": "cm",
  "raw": "Distancia: 23.45 cm",
  "timestamp": "2026-03-18T10:30:00.123456+00:00"
}
```

Si el Arduino aún no ha enviado datos:

```json
{ "error": "Sin datos disponibles aún" }   ← HTTP 503
```

### 2. Frontend — Interfaz web del sensor

```powershell
# Opción A — script automático (Windows)
scripts\run_frontend.bat

# Opción B — manual
cd modules\sensor\frontend
python -m http.server 8080
```

Abre `http://localhost:8080` en el navegador.

---

## Cómo ejecutar (Módulo salto — Fase 2)

### Backend — API Flask + MediaPipe

```powershell
cd modules\salto\backend
python app.py
```

Endpoint disponible en `http://localhost:5001/api/salto/calcular`:

```
POST /api/salto/calcular
Content-Type: multipart/form-data

  video:          archivo .mp4 / .webm / .avi / .mov
  tipo_salto:     "vertical" | "horizontal"
  altura_real_m:  float (solo para horizontal, ej. 1.75)
```

Respuesta JSON:

```json
{
  "tipo_salto": "vertical",
  "distancia": 45.5,
  "unidad": "cm",
  "confianza": 0.98,
  "frame_despegue": 42,
  "frame_aterrizaje": 58,
  "tiempo_vuelo_s": 0.5333
}
```

> **Nota:** El módulo sensor corre en puerto 5000 y el de salto en 5001. Ambos pueden ejecutarse simultáneamente.

### 3. Modo consola (sin web, para test rápido)

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

| Capa | Archivo | Responsabilidad |
|------|---------|-----------------|
| Model | `models/sensor_serial.py` | Conexión serial, listado de puertos, parseo de líneas, dataclass `Medicion` |
| View | `views/consola_view.py` | Salida por consola — sin lógica de negocio |
| Controller | `controllers/distancia_controller.py` | Flujo de lectura, hilo daemon, acceso thread-safe a la última medición |
| Config | `config.py` | `DEFAULT_BAUD_RATE`, `SERIAL_TIMEOUT`, `FLASK_PORT` |
| Entry point web | `app.py` | Flask: inicia el hilo de lectura y expone `GET /distancia` |
| Entry point consola | `main.py` | Modo debug sin web |

---

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [docs/arquitectura.md](docs/arquitectura.md) | Diagrama de capas y tecnologías |
| [docs/flujo_datos.md](docs/flujo_datos.md) | Paso a paso del dato desde el Arduino al navegador |
| [docs/fases_proyecto.md](docs/fases_proyecto.md) | Estado de cada fase del proyecto |
| [docs/decisiones_tecnicas.md](docs/decisiones_tecnicas.md) | Justificaciones de diseño |
