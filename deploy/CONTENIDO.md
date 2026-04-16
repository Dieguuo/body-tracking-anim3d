# Estructura de despliegue

Este directorio define qué partes del repositorio componen el paquete integrable.
No es necesario copiar archivos aquí: sirve como **manifiesto de entrega**.

## Archivos que componen el módulo integrable

### Backend Salto (obligatorio)

```
modules/salto/backend/
├── app.py
├── config.py
├── pose_landmarker_lite.task
├── controllers/
│   ├── __init__.py
│   ├── salto_controller.py
│   ├── salto_db_controller.py
│   └── usuario_controller.py
├── models/
│   ├── __init__.py
│   ├── db.py
│   ├── salto_model.py
│   ├── usuario_model.py
│   └── video_processor.py
├── services/
│   ├── __init__.py
│   ├── analitica_service.py
│   ├── aterrizaje_service.py
│   ├── biomecanica_service.py
│   ├── calculo_service.py
│   ├── cinematico_service.py
│   ├── comparativa_service.py
│   ├── interpretacion_service.py
│   ├── video_anotado_service.py
│   └── video_library_service.py
├── utils/
│   ├── __init__.py
│   ├── serializers.py
│   └── session_utils.py
└── uploads/            ← se crea automáticamente
```

### Backend Sensor (opcional — solo si se usa Arduino)

```
modules/sensor/backend/
├── app.py
├── config.py
├── main.py
├── controllers/
│   ├── __init__.py
│   └── distancia_controller.py
├── models/
│   ├── __init__.py
│   └── sensor_serial.py
└── views/
    ├── __init__.py
    └── consola_view.py
```

### Frontend (obligatorio)

```
integration/web/
├── index.html
├── salto.html
├── registro.html
├── videos.html
├── arduino.html        ← opcional, solo si se usa sensor
├── css/
│   └── style.css
└── js/
    ├── config.js       ← ★ punto de configuración de URLs
    ├── api-client.js
    ├── api_salto.js
    ├── api_sensor.js   ← opcional, solo si se usa sensor
    ├── app.js
    ├── camara.js
    ├── registro.js
    └── videos.js
```

### Configuración

```
.env.example            ← plantilla de variables de entorno
scripts/init_db.sql     ← script para crear la base de datos
requirements.txt        ← dependencias Python
```

### Documentación de integración

```
deploy/README_INTEGRACION.md
```

## Elementos de desarrollo eliminados

Los siguientes archivos y carpetas se han eliminado del repositorio por no formar
parte del módulo integrable:

`docs/`, `tests/`, `test/`, `img/`, `certs/`,
`scripts/run_all.bat`, `scripts/setup.bat`, `scripts/https_server.py`,
`scripts/generate_cert.py`, `scripts/debug_video.py`,
`modules/salto/mobile/`, `modules/sensor/arduino/`
