# Despliegue Anim3D — Guía mínima

Sistema **multi-club**: una instancia Flask + DB MySQL por club, todas tras el mismo nginx (wildcard `*.tacticalcore.es`).

```
Internet → nginx (HTTPS, wildcard SSL) → Flask backend (HTTP, puerto único por club) → MySQL
                                       └→ frontend estático (integration/web/)
```

---

## 1. Requisitos del servidor (una sola vez)

```bash
sudo apt install nginx mysql-server python3 python3-venv
pip install certbot certbot-dns-<tu_proveedor>   # para wildcard *.tacticalcore.es
```

**Certificado wildcard** (DNS-01 challenge, requerido para `*.tacticalcore.es`):
```bash
sudo certbot certonly --dns-<proveedor> -d "*.tacticalcore.es" -d "tacticalcore.es"
```
→ deja certificados en `/etc/letsencrypt/live/tacticalcore.es/`.

**Plantilla systemd** (una sola vez):
```bash
sudo cp deploy/anim3d-club@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo useradd --system --shell /bin/false anim3d
```

---

## 2. Alta de un club nuevo

### 2.1. Preparar archivos de la instancia
```bash
CLUB=barcelona
PORT=5001                                   # incrementar por cada club: 5001, 5002, ...
INST=/var/www/anim3d/$CLUB

sudo mkdir -p $INST/{backend,web}
sudo cp -r modules/salto/backend/*  $INST/backend/
sudo cp -r integration/web/*        $INST/web/

sudo python3 -m venv $INST/venv
sudo $INST/venv/bin/pip install -r requirements.txt

sudo chown -R anim3d:anim3d $INST
```

### 2.2. Crear DB + nginx + .env (un solo comando)
```bash
sudo ./deploy/nuevo_club.sh \
    --club $CLUB \
    --port $PORT \
    --webroot $INST/web \
    --env-dir $INST \
    --ssl-cert /etc/letsencrypt/live/tacticalcore.es/fullchain.pem \
    --ssl-key  /etc/letsencrypt/live/tacticalcore.es/privkey.pem \
    --init-db --db-app-user anim3d_$CLUB
```
El script pedirá interactivamente:
- Contraseña root de MySQL
- Contraseña para el nuevo usuario `anim3d_$CLUB`

Después rellena la contraseña en el `.env` generado:
```bash
sudo nano $INST/.env             # editar DB_PASSWORD con la del paso anterior
```

### 2.3. Arrancar el backend
```bash
sudo systemctl enable --now anim3d-club@$CLUB.service
sudo systemctl status anim3d-club@$CLUB.service
```

### 2.4. Verificar
```bash
curl -I https://$CLUB.tacticalcore.es/                          # 200 (frontend)
curl    https://$CLUB.tacticalcore.es/api/usuarios              # 200 (backend vía proxy)
sudo journalctl -u anim3d-club@$CLUB.service -f                 # logs en vivo
```

---

## 3. Variables de entorno (`.env` por club)

| Variable        | Ejemplo                          | Notas                                    |
|-----------------|----------------------------------|------------------------------------------|
| `DB_HOST`       | `localhost`                      |                                          |
| `DB_USER`       | `anim3d_barcelona`               | usuario MySQL de la instancia            |
| `DB_PASSWORD`   | `…`                              | **obligatorio**                          |
| `DB_NAME`       | `bd_anim3d_barcelona`            | generado por `init_db.py`                |
| `SALTO_PORT`    | `5001`                           | único por club, debe coincidir con nginx |
| `CORS_DOMAIN`   | `tacticalcore.es`                | acepta `https://*.tacticalcore.es`       |
| `MAX_UPLOAD_MB` | `100`                            |                                          |

---

## 4. Integración (iframe en la app anfitriona)

Desde `tacticalcore.es` (o cualquier subdominio):
```html
<iframe src="https://barcelona.tacticalcore.es/salto.html"
        width="100%" height="900" allow="camera; microphone"></iframe>
```

`allow="camera"` es **obligatorio** para que el iframe pueda usar la cámara.

La política CSP (`frame-ancestors https://*.tacticalcore.es`) solo permite embebido desde subdominios de `tacticalcore.es`. Cualquier otro origen será bloqueado por el navegador.

---

## 5. Renovación SSL

`certbot` instala un timer automático. Para verificar:
```bash
sudo systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```
Tras renovación, recargar nginx:
```bash
sudo systemctl reload nginx
```

---

## 6. Operaciones comunes

| Tarea                              | Comando                                                |
|------------------------------------|--------------------------------------------------------|
| Reiniciar instancia de un club     | `sudo systemctl restart anim3d-club@<club>`            |
| Ver logs                           | `sudo journalctl -u anim3d-club@<club> -f`             |
| Recargar nginx                     | `sudo nginx -t && sudo systemctl reload nginx`         |
| Backup DB de un club               | `mysqldump bd_anim3d_<club> > backup.sql`              |
| Dar de baja un club                | `sudo systemctl disable --now anim3d-club@<club>` + borrar `/etc/nginx/sites-enabled/<club>.conf` + `sudo nginx -s reload` |

---

## 7. Solución de problemas

| Síntoma                                       | Causa probable                                              |
|-----------------------------------------------|-------------------------------------------------------------|
| `502 Bad Gateway` en `/api/...`               | Backend del club no arrancado: `systemctl status anim3d-club@<club>` |
| `403 Forbidden` al embeber en iframe          | Origen no permitido por CSP `frame-ancestors`               |
| `CORS error` en consola del navegador         | `CORS_DOMAIN` incorrecto en `.env` o iframe en otro dominio |
| `413 Request Entity Too Large` al subir vídeo | Subir `client_max_body_size` en nginx + `MAX_UPLOAD_MB` en `.env` |
| Error MySQL al arrancar Flask                 | `DB_PASSWORD` vacío o usuario sin permisos sobre la DB      |
| Cámara no funciona en iframe                  | Falta `allow="camera"` en el `<iframe>` de la anfitriona    |

---

## 8. Archivos clave

- [deploy/nginx-club.conf.template](nginx-club.conf.template) — plantilla nginx con placeholders
- [deploy/nuevo_club.sh](nuevo_club.sh) — script de alta de club
- [deploy/anim3d-club@.service](anim3d-club@.service) — unidad systemd parametrizada
- [deploy/.env.example](.env.example) — plantilla de variables
- [scripts/init_db.py](../scripts/init_db.py) — creación de DB + usuario MySQL
- [scripts/init_db.sql](../scripts/init_db.sql) — esquema (tablas `usuarios`, `saltos`)
