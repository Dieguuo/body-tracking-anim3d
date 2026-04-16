# Integración Web

Frontend web del módulo Anim3D. Contiene las páginas HTML, CSS y JS.

Para instrucciones completas de integración, ver [deploy/README_INTEGRACION.md](../deploy/README_INTEGRACION.md).

## Estructura

```
web/
├── index.html       ← Landing con cards de módulos
├── salto.html       ← Grabación + análisis de salto
├── registro.html    ← Registro y gestión de usuarios
├── videos.html      ← Biblioteca de vídeos guardados
├── arduino.html     ← Lectura sensor en tiempo real
├── css/style.css
└── js/
    ├── config.js    ← ★ Configuración de URLs (window.ANIM3D_CONFIG)
    ├── api-client.js
    ├── api_salto.js
    ├── api_sensor.js
    ├── app.js
    ├── camara.js
    ├── registro.js
    └── videos.js
```

## Arranque del backend

```bash
# Backend salto (puerto 5001)
cd modules/salto/backend
python app.py

# Backend sensor (puerto 5000)
cd modules/sensor/backend
python app.py
```

El frontend se sirve como contenido estático vía proxy inverso.
Ver [deploy/README_INTEGRACION.md](../deploy/README_INTEGRACION.md) para la configuración de nginx.
