# Guía de integración — Módulo Anim3D Saltos

> **Objetivo**: integrar el módulo de análisis de saltos (vídeo + IA + biomecánica)
> dentro de una aplicación web existente.

---

## 1. Componentes del módulo

| Componente | Obligatorio | Descripción |
|---|---|---|
| **Backend Salto** | ✅ | API Flask + MediaPipe + MySQL. Procesa vídeos y gestiona usuarios/saltos. |
| **Frontend Web** | ✅ | Páginas HTML + JS + CSS con cámara, registro, galería y gráficos. |
| **Backend Sensor** | ✅ | API Flask + Arduino HC-SR04. Sensor de distancia por hardware. |

Ver [deploy/CONTENIDO.md](CONTENIDO.md) para el listado exacto de archivos.

---

## 2. Requisitos del entorno

| Requisito | Detalle |
|---|---|
| Python | 3.10+ |
| MySQL | 8.0+ con `bd_anim3d_saltos` (ver sección 4) |
| Navegador | Chrome/Edge/Safari con soporte `getUserMedia` |
| HTTPS | Obligatorio para acceder a la cámara (o `localhost`) |

### Dependencias Python (Backend Salto)

```
flask
flask-cors
mediapipe
opencv-python
numpy
mysql-connector-python
python-dotenv
```

### Dependencias Python (Backend Sensor — opcional)

```
flask
flask-cors
pyserial
python-dotenv
```

---

## 3. Variables de entorno

Copiar `.env.example` a `.env` y ajustar:

```env
# ── Base de datos ──
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=secreto          # ← OBLIGATORIO
DB_NAME=bd_anim3d_saltos

# ── Puertos Flask ──
SALTO_PORT=5001
SENSOR_PORT=5000

# ── CORS ──
# En producción, restringir al dominio de la app anfitriona:
CORS_ORIGINS=https://midominio.com

# ── SSL (si Flask sirve HTTPS directamente) ──
# SSL_CERT_DIR=/etc/ssl/certs
# SSL_CERT_FILE=cert.pem
# SSL_KEY_FILE=key.pem
```

> Si un proxy inverso (nginx, Caddy) termina SSL, dejar las variables `SSL_*`
> sin definir y Flask arrancará en HTTP.

---

## 4. Base de datos

Ejecutar una sola vez:

```bash
mysql -u root -p < scripts/init_db.sql
```

El script crea la base de datos `bd_anim3d_saltos` con las tablas `usuarios` y `saltos`,
e incluye migraciones idempotentes para columnas añadidas en fases posteriores.

---

## 5. Arranque del backend

> **Importante**: cada backend debe ejecutarse con el **directorio de trabajo**
> (`cwd`) en su propia carpeta. Los imports Python y la resolución del modelo
> MediaPipe dependen de ello.

```bash
cd modules/salto/backend
pip install -r ../../../requirements.txt
python app.py
# → Escucha en 0.0.0.0:5001
```

El archivo `pose_landmarker_lite.task` **debe estar en el mismo directorio** que `app.py`.

### Gunicorn / WSGI

Si se despliega con Gunicorn en lugar de `python app.py`:

```bash
cd modules/salto/backend
gunicorn --chdir . --bind 0.0.0.0:5001 app:app
```

El flag `--chdir .` asegura que el directorio de trabajo sea correcto.

Backend sensor:

```bash
cd modules/sensor/backend
pip install pyserial flask flask-cors python-dotenv
python app.py
# → Escucha en 0.0.0.0:5000
```

---

## 6. Integración del frontend (iframe + proxy inverso)

> **Decisión confirmada**: se integra vía **iframe** con **proxy inverso**.
> Esto aísla completamente el CSS y el JS del módulo respecto a la app anfitriona
> y elimina problemas de CORS.

Con proxy inverso, el frontend y el backend comparten dominio.
Configurar `window.ANIM3D_CONFIG.BACKEND_SALTO_URL = ""` (cadena vacía)
para que las peticiones sean relativas al mismo origen:

```html
<script>
  window.ANIM3D_CONFIG = {
    BACKEND_SALTO_URL: "",
    BACKEND_SENSOR_URL: ""
  };
</script>

<iframe src="/anim3d/salto.html"
        allow="camera; microphone"
        style="width: 100%; height: 100vh; border: none;">
</iframe>
```

> **Nota**: las páginas HTML del módulo cargan `config.js` que ya lee
> `window.ANIM3D_CONFIG` para resolver las URLs del backend.

### Posible cambio futuro — Embebido directo (sin iframe)

Si en el futuro se necesita integrar los HTML directamente (sin iframe):

1. Servir los archivos de `integration/web/` desde una ruta del servidor
   (por ejemplo `/anim3d/`).

2. Antes de cargar cualquier JS del módulo, definir `window.ANIM3D_CONFIG`:

```html
<script>
  window.ANIM3D_CONFIG = {
    BACKEND_SALTO_URL: "https://api.midominio.com",
    BACKEND_SENSOR_URL: "https://sensor.midominio.com"
  };
</script>
<script src="/anim3d/js/config.js"></script>
<script src="/anim3d/js/api-client.js"></script>
<script src="/anim3d/js/api_salto.js"></script>
<!-- ... resto de scripts -->
```

3. **⚠️ CSS**: el archivo `style.css` contiene selectores globales (`*`, `body`,
   `html`) que afectarán a toda la página. Opciones:
   - Envolver el contenido del módulo en un `<div class="anim3d-root">` y
     re-alcanzar los selectores manualmente.
   - Cargar el CSS en un Shadow DOM.

4. **⚠️ Variables JS**: los scripts del módulo (excepto `api_salto.js` que usa
   ES module) declaran funciones y variables en el ámbito global. Nombres que
   podrían colisionar con la app anfitriona:
   - `fetchJson` (api-client.js)
   - `formatearFecha`, `cargarBiblioteca` (videos.js)
   - `setUsuarioActivo`, `obtenerUsuarios` (registro.js)
   - `polling`, `leerSensor` (api_sensor.js)
   
   Si hay conflictos, envolver cada script en un IIFE o migrar a ES modules.
   Con iframe este problema **no aplica** (cada iframe tiene su propio `window`).

---

## 7. Referencia de la API

### 7.1 Backend Salto (21 endpoints)

#### Procesamiento de vídeo

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/salto/calcular` | Procesa vídeo y devuelve distancia, biomecánica, cinemática, alertas. |
| `POST` | `/api/salto/video-anotado` | Devuelve vídeo `.mp4` anotado con landmarks y ángulos. |
| `GET` | `/api/salto/<id>/landmarks` | Landmarks MediaPipe por frame de un salto guardado. |

#### Usuarios (CRUD + analítica)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/usuarios` | Listar usuarios. Soporta `?paginado=1&limit=&offset=&search=`. |
| `POST` | `/api/usuarios` | Crear usuario (`alias`, `nombre_completo`, `altura_m`, `peso_kg`). |
| `GET` | `/api/usuarios/<id>` | Obtener usuario. |
| `PUT` | `/api/usuarios/<id>` | Actualizar usuario. |
| `DELETE` | `/api/usuarios/<id>` | Eliminar usuario. |
| `GET` | `/api/usuarios/<id>/saltos` | Listar saltos del usuario. |
| `GET` | `/api/usuarios/<id>/progreso` | Estadísticas de progreso. |
| `GET` | `/api/usuarios/<id>/comparativa` | Comparativa vertical vs horizontal (mín. 4+4). |
| `GET` | `/api/usuarios/<id>/fatiga` | Análisis de fatiga intra-sesión. `?tipo=vertical\|horizontal` |
| `GET` | `/api/usuarios/<id>/tendencia` | Tendencia histórica. `?tipo=&metrica=distancia\|potencia_estimada` |
| `GET` | `/api/usuarios/<id>/alertas_tendencia` | Alertas de tendencia cruzada. `?tipo=` |
| `GET` | `/api/usuarios/<id>/analitica_avanzada` | Analítica multi-variable avanzada. |

#### Saltos (CRUD + vídeos)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/saltos` | Listar todos los saltos. |
| `POST` | `/api/saltos` | Registrar salto manualmente. |
| `GET` | `/api/saltos/<id>` | Obtener salto por ID. |
| `GET` | `/api/saltos/<id>/curvas` | Curvas angulares y fases del salto. |
| `PUT` | `/api/saltos/<id>` | Actualizar salto. |
| `DELETE` | `/api/saltos/<id>` | Eliminar salto. |
| `GET` | `/api/videos` | Biblioteca de vídeos guardados. `?id_usuario=&tipo=` |
| `GET` | `/api/videos/<id>/stream` | Streaming de vídeo (soporta `Range`). |

### 7.2 Backend Sensor (1 endpoint)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/distancia` | Última lectura del sensor HC-SR04. Devuelve `{valor, unidad, raw, timestamp}`. |

---

## 8. Recurso obligatorio

El archivo **`pose_landmarker_lite.task`** (~4 MB, modelo MediaPipe) es necesario
para el procesamiento de vídeo. Debe estar en `modules/salto/backend/` junto a `app.py`.

Este archivo **no se debe eliminar ni renombrar**.

---

## 8.1 Dependencias externas (CDN)

El frontend carga las siguientes librerías desde CDN. **Se requiere conexión a internet**
en el navegador del usuario para que funcionen:

| Librería | Versión | CDN | Uso |
|---|---|---|---|
| MediaPipe Tasks-Vision | 0.10.3 | `cdn.jsdelivr.net` | Detección de pose en vídeo (cámara en vivo) |
| MediaPipe WASM Runtime | 0.10.3 | `cdn.jsdelivr.net` | Runtime WebAssembly de MediaPipe |
| Chart.js | 4.4.2 | `cdn.jsdelivr.net` | Gráficas de curvas articulares |
| Three.js | 0.160.0 | `unpkg.com` / `cdn.jsdelivr.net` | Visor 3D de landmarks |
| OrbitControls | 0.160.0 | `unpkg.com` / `cdn.jsdelivr.net` | Controles de cámara 3D |

> **Entorno sin internet**: si el servidor de producción no tiene acceso a CDN,
> descargar estas librerías y servirlas localmente desde `integration/web/js/vendor/`.
> Actualizar las rutas de importación en `api_salto.js` y `salto.html`.

---

## 9. Proxy inverso (ejemplo nginx)

```nginx
# Backend Salto
location /api/ {
    proxy_pass http://127.0.0.1:5001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 200M;   # vídeos grandes
}

# Backend Sensor
location /distancia {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
}

# Frontend estático
location /anim3d/ {
    alias /var/www/anim3d/integration/web/;
    try_files $uri $uri/ =404;
}
```

> Con proxy inverso, el frontend y ambos backends comparten dominio →
> no hay problemas de CORS y las variables `SSL_*` de Flask no son necesarias
> (el proxy termina SSL).

### Posible cambio futuro — Sin proxy inverso

Si en el futuro se prescinde del proxy, cada backend necesita exponerse
directamente con HTTPS (configurar `SSL_CERT_DIR`, `SSL_CERT_FILE`,
`SSL_KEY_FILE` en `.env`) y `CORS_ORIGINS` debe incluir el dominio
de la app anfitriona.

---

## 10. Checklist rápido de integración

- [ ] MySQL instalado y `init_db.sql` ejecutado
- [ ] `.env` creado con `DB_PASSWORD` y `CORS_ORIGINS` correctos
- [ ] `pip install` de dependencias
- [ ] `pose_landmarker_lite.task` presente en su directorio
- [ ] Backend arrancado (`python app.py`)
- [ ] Backend sensor arrancado (`python app.py` en `modules/sensor/backend/`)
- [ ] Proxy inverso configurado (nginx / Caddy / similar)
- [ ] Frontend servido bajo `/anim3d/` en el proxy
- [ ] `window.ANIM3D_CONFIG` definido con URLs vacías (`""`) si se usa proxy
- [ ] HTTPS terminado en el proxy (obligatorio para `getUserMedia`)
- [ ] Verificar acceso a `/api/usuarios` desde el navegador
