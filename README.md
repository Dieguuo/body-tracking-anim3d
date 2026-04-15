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
| **Módulo 2 — Salto con móvil** | ✅ Backend completado | Analiza vídeo con MediaPipe, calcula salto vertical/horizontal, análisis biomecánico completo |
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
│   ├── decisiones_tecnicas.md   ← Justificaciones de diseño
│   ├── manual_usuario.md        ← Guía de uso paso a paso
│   ├── entrega_cambios_2026-04-13.md  ← Traspaso técnico de la jornada 2026-04-13
│   ├── historial_tecnico_2026-04-13.md ← Historial de cambios técnicos
│   └── checklist_validacion_salto_vh_realtime_galeria.md ← Checklist funcional
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
│       │   ├── services/        ← calculo + biomecanica + aterrizaje + cinematico + video_anotado + analitica + comparativa + interpretacion + video_library
│       │   └── utils/           ← serializers + session_utils (utilidades compartidas)
│       └── mobile/              # Reservado — cliente móvil
│
├── integration/
│   ├── README.md
│   ├── backend/                 # Reservado — gateway/orquestador
│   └── web/                     ← Frontend web unificado
│       ├── index.html           ← Landing con cards de módulos
│       ├── salto.html           ← Grabación + análisis de salto
│       ├── registro.html        ← Registro y gestión de usuarios
│       ├── videos.html          ← Biblioteca de vídeos guardados
│       ├── arduino.html         ← Lectura sensor en tiempo real
│       ├── css/style.css
│       └── js/
│           ├── app.js           ← Animaciones del landing
│           ├── camara.js        ← Grabación vídeo / subida archivo
│           ├── api_salto.js     ← Envío a API salto + resultados
│           ├── api_sensor.js    ← Polling a API sensor
│           ├── api-client.js    ← fetchJson() compartido por todas las páginas
│           ├── config.js        ← URLs de backend (auto HTTP/HTTPS)
│           ├── registro.js      ← CRUD de usuarios
│           └── videos.js        ← Biblioteca de vídeos guardados
│
├── scripts/
│   ├── run_all.bat              ← Arranca todo con un doble-clic
│   ├── setup.bat                ← Onboarding: crea venv, instala dependencias, verifica .env
│   ├── https_server.py          ← Servidor HTTPS para el frontend (puerto 8443)
│   ├── generate_cert.py         ← Generador de certificado autofirmado
│   ├── init_db.sql              ← Script SQL para crear la base de datos
│   └── debug_video.py           ← Utilidad de diagnóstico de vídeos
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

Doble clic en `scripts\run_all.bat` → abre **https://localhost:8443**.

### Arranque manual — HTTPS (recomendado)

HTTPS es necesario para usar la cámara del móvil.

```powershell
# 1. Generar certificado (solo la primera vez o si cambia la red)
python scripts\generate_cert.py

# 2. Backend salto (puerto 5001)
cd modules\salto\backend
python app.py

# 3. Backend sensor (puerto 5000, requiere Arduino conectado)
cd modules\sensor\backend
python app.py

# 4. Frontend HTTPS (puerto 8443)
python scripts\https_server.py
```

Abrir **https://localhost:8443** en el navegador (aceptar el certificado autofirmado).

### Arranque manual — HTTP (sin cámara en móvil)

```powershell
# Backend salto
cd modules\salto\backend && python app.py

# Backend sensor
cd modules\sensor\backend && python app.py

# Frontend HTTP (puerto 8080)
cd integration\web
python -m http.server 8080
```

Abrir **http://localhost:8080** en el navegador.

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
integration/web/      (Frontend)    — fetch cada 1 s → actualiza DOM
```

---

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [docs/arquitectura.md](docs/arquitectura.md) | Diagrama de capas y tecnologías |
| [docs/flujo_datos.md](docs/flujo_datos.md) | Paso a paso del dato desde el dispositivo al navegador |
| [docs/fases_proyecto.md](docs/fases_proyecto.md) | Estado de cada fase del proyecto |
| [docs/decisiones_tecnicas.md](docs/decisiones_tecnicas.md) | Justificaciones de diseño (hilos, locks, parseo, MVC, BD, biomecánica) |
| [docs/manual_usuario.md](docs/manual_usuario.md) | Guía de uso paso a paso para el usuario final || [docs/entrega_cambios_2026-04-13.md](docs/entrega_cambios_2026-04-13.md) | Traspaso técnico de cambios (2026-04-13) |
| [docs/historial_tecnico_2026-04-13.md](docs/historial_tecnico_2026-04-13.md) | Historial técnico detallado |
| [docs/checklist_validacion_salto_vh_realtime_galeria.md](docs/checklist_validacion_salto_vh_realtime_galeria.md) | Checklist de validación funcional |