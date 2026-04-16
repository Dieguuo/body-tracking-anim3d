# Anim3D — Módulo de Análisis de Saltos

Módulo integrable para captura, procesamiento y visualización de **saltos verticales y horizontales** mediante vídeo e IA (MediaPipe).

```
Vídeo / Sensor Arduino → Python (Flask API) → Análisis biomecánico → Frontend web
```

Para instrucciones de integración en otra aplicación web, ver [`deploy/README_INTEGRACION.md`](deploy/README_INTEGRACION.md).

---

## Módulos

| Módulo | Descripción |
|--------|-------------|
| **Salto** | Analiza vídeo con MediaPipe, calcula salto vertical/horizontal, biomecánica, cinemática, comparativas |
| **Sensor Arduino** | Mide distancia con HC-SR04, expone datos vía API REST |
| **Base de datos** | MySQL — CRUD usuarios/saltos, progreso y analítica avanzada |
| **Frontend web** | Interfaz unificada (landing + salto + registro + vídeos + sensor) |

---

## Estructura del proyecto

```
body-tracking-anim3d/
│
├── README.md
├── requirements.txt
├── .env.example
│
├── modules/
│   ├── sensor/
│   │   ├── README.md
│   │   └── backend/             ← Flask API (GET /distancia)
│   │       ├── app.py
│   │       ├── main.py          ← Entry point consola (sin web)
│   │       ├── config.py
│   │       ├── controllers/
│   │       ├── models/
│   │       └── views/
│   │
│   └── salto/
│       ├── README.md
│       └── backend/             ← Flask API + MediaPipe + MySQL
│           ├── app.py
│           ├── config.py
│           ├── pose_landmarker_lite.task
│           ├── controllers/
│           ├── models/
│           ├── services/
│           └── utils/
│
├── integration/
│   ├── README.md
│   └── web/                     ← Frontend web
│       ├── index.html
│       ├── salto.html
│       ├── registro.html
│       ├── videos.html
│       ├── arduino.html
│       ├── css/style.css
│       └── js/
│           ├── config.js        ← ★ Configuración de URLs (window.ANIM3D_CONFIG)
│           ├── api-client.js
│           ├── api_salto.js
│           ├── api_sensor.js
│           ├── app.js
│           ├── camara.js
│           ├── registro.js
│           └── videos.js
│
├── scripts/
│   ├── init_db.sql              ← Inicialización de base de datos
│   └── README.md
│
├── deploy/
│   ├── CONTENIDO.md             ← Manifiesto de entrega
│   └── README_INTEGRACION.md    ← Guía completa de integración
│
└── uploads/
```

---

## Requisitos

- Python 3.10+
- MySQL 8.0+
- HTTPS (obligatorio para `getUserMedia`)

```bash
pip install -r requirements.txt
mysql -u root -p < scripts/init_db.sql
```

## Configuración

Copiar `.env.example` a `.env` y ajustar (ver [.env.example](.env.example)):

```env
DB_PASSWORD=tu_contraseña
CORS_ORIGINS=https://midominio.com
SALTO_PORT=5001
SENSOR_PORT=5000
```

## Arranque

```bash
# Backend salto (puerto 5001)
cd modules/salto/backend
python app.py

# Backend sensor (puerto 5000, requiere Arduino conectado)
cd modules/sensor/backend
python app.py
```

El frontend se sirve como contenido estático vía proxy inverso o servidor web.
Ver [deploy/README_INTEGRACION.md](deploy/README_INTEGRACION.md) para la configuración completa.

---

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [deploy/README_INTEGRACION.md](deploy/README_INTEGRACION.md) | Guía de integración, endpoints API, proxy nginx, checklist |
| [deploy/CONTENIDO.md](deploy/CONTENIDO.md) | Manifiesto de archivos del módulo |
| [modules/salto/README.md](modules/salto/README.md) | Documentación del módulo de saltos |
| [modules/sensor/README.md](modules/sensor/README.md) | Documentación del módulo sensor |