#!/usr/bin/env bash
# =============================================================================
# nuevo_club.sh — Da de alta una nueva instancia Anim3D para un club
# =============================================================================
# Genera la configuración nginx, el .env del backend y recarga nginx.
#
# Uso:
#   sudo ./nuevo_club.sh \
#     --club nombreclub \
#     --port 5001 \
#     --webroot /var/www/anim3d/nombreclub/web \
#     --ssl-cert /etc/letsencrypt/live/tacticalcore.es/fullchain.pem \
#     --ssl-key  /etc/letsencrypt/live/tacticalcore.es/privkey.pem \
#     --env-dir  /var/www/anim3d/nombreclub \
#     [--init-db]                       # crear DB MySQL para este club
#     [--db-admin-user root]            # usuario MySQL con CREATE/GRANT
#     [--db-app-user anim3d]            # usuario MySQL de Flask (permisos limitados)
#
# Requisitos previos:
#   - nginx instalado
#   - Certificado wildcard *.tacticalcore.es (vía certbot DNS-01 o equivalente)
#   - Frontend desplegado en --webroot
#   - Backend Flask configurado para escuchar en --port
#   - Si --init-db: Python 3 con mysql-connector-python instalado
# =============================================================================

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATE="${SCRIPT_DIR}/nginx-club.conf.template"
ENV_TEMPLATE="${SCRIPT_DIR}/.env.example"
INIT_DB_PY="${REPO_ROOT}/scripts/init_db.py"
SITES_AVAILABLE="/etc/nginx/sites-available"
SITES_ENABLED="/etc/nginx/sites-enabled"

CLUB=""
FLASK_PORT=""
WEBROOT=""
SSL_CERT=""
SSL_KEY=""
ENV_DIR=""
INIT_DB=0
DB_ADMIN_USER="root"
DB_APP_USER=""

# ── Parseo de argumentos ────────────────────────────────────────────────────
usage() {
    grep -E '^# ' "$0" | sed 's/^# \?//' | head -n 25
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --club)           CLUB="$2"; shift 2 ;;
        --port)           FLASK_PORT="$2"; shift 2 ;;
        --webroot)        WEBROOT="$2"; shift 2 ;;
        --ssl-cert)       SSL_CERT="$2"; shift 2 ;;
        --ssl-key)        SSL_KEY="$2"; shift 2 ;;
        --env-dir)        ENV_DIR="$2"; shift 2 ;;
        --init-db)        INIT_DB=1; shift ;;
        --db-admin-user)  DB_ADMIN_USER="$2"; shift 2 ;;
        --db-app-user)    DB_APP_USER="$2"; shift 2 ;;
        -h|--help)        usage ;;
        *) echo "Argumento desconocido: $1" >&2; usage ;;
    esac
done

# ── Validaciones ────────────────────────────────────────────────────────────
[[ -z "$CLUB"       ]] && { echo "ERROR: --club obligatorio"; exit 1; }
[[ -z "$FLASK_PORT" ]] && { echo "ERROR: --port obligatorio"; exit 1; }
[[ -z "$WEBROOT"    ]] && { echo "ERROR: --webroot obligatorio"; exit 1; }
[[ -z "$SSL_CERT"   ]] && { echo "ERROR: --ssl-cert obligatorio"; exit 1; }
[[ -z "$SSL_KEY"    ]] && { echo "ERROR: --ssl-key obligatorio"; exit 1; }
[[ -z "$ENV_DIR"    ]] && ENV_DIR="$WEBROOT/.."

if [[ ! "$CLUB" =~ ^[a-z0-9-]+$ ]]; then
    echo "ERROR: --club debe contener solo minúsculas, dígitos y guiones (recibido: $CLUB)" >&2
    exit 1
fi
if ! [[ "$FLASK_PORT" =~ ^[0-9]+$ ]] || (( FLASK_PORT < 1024 || FLASK_PORT > 65535 )); then
    echo "ERROR: --port debe ser un entero entre 1024 y 65535" >&2
    exit 1
fi
[[ ! -f "$TEMPLATE"     ]] && { echo "ERROR: plantilla no encontrada: $TEMPLATE"; exit 1; }
[[ ! -f "$SSL_CERT"     ]] && { echo "ERROR: certificado SSL no encontrado: $SSL_CERT"; exit 1; }
[[ ! -f "$SSL_KEY"      ]] && { echo "ERROR: clave SSL no encontrada: $SSL_KEY"; exit 1; }
[[ ! -d "$WEBROOT"      ]] && { echo "ERROR: webroot no existe: $WEBROOT"; exit 1; }

CONF_PATH="${SITES_AVAILABLE}/${CLUB}.conf"
LINK_PATH="${SITES_ENABLED}/${CLUB}.conf"

if [[ -e "$CONF_PATH" ]]; then
    echo "ERROR: ya existe ${CONF_PATH}. Bórralo o usa otro --club." >&2
    exit 1
fi

# ── Generar nginx.conf desde la plantilla ───────────────────────────────────
echo "→ Generando ${CONF_PATH}"
sed \
    -e "s|__CLUB__|${CLUB}|g" \
    -e "s|__FLASK_PORT__|${FLASK_PORT}|g" \
    -e "s|__WEBROOT__|${WEBROOT}|g" \
    -e "s|__SSL_CERT__|${SSL_CERT}|g" \
    -e "s|__SSL_KEY__|${SSL_KEY}|g" \
    "$TEMPLATE" > "$CONF_PATH"

# ── Crear symlink en sites-enabled ──────────────────────────────────────────
echo "→ Habilitando sitio: ${LINK_PATH}"
ln -sf "$CONF_PATH" "$LINK_PATH"

# ── Generar .env del backend si no existe ───────────────────────────────────
ENV_FILE="${ENV_DIR}/.env"
if [[ -f "$ENV_FILE" ]]; then
    echo "→ .env ya existe en ${ENV_FILE}, no se sobrescribe."
else
    if [[ -f "$ENV_TEMPLATE" ]]; then
        echo "→ Generando .env en ${ENV_FILE}"
        mkdir -p "$ENV_DIR"
        sed \
            -e "s|__CLUB__|${CLUB}|g" \
            -e "s|__FLASK_PORT__|${FLASK_PORT}|g" \
            "$ENV_TEMPLATE" > "$ENV_FILE"
        chmod 600 "$ENV_FILE"
        echo "  ⚠ Edita ${ENV_FILE} y rellena DB_PASSWORD antes de arrancar Flask."
    else
        echo "  ⚠ No se encontró ${ENV_TEMPLATE}, omitiendo generación de .env."
    fi
fi

# ── Inicializar DB MySQL (opcional) ─────────────────────────────────────────
if [[ "$INIT_DB" -eq 1 ]]; then
    if [[ ! -f "$INIT_DB_PY" ]]; then
        echo "ERROR: no se encuentra el script de DB: ${INIT_DB_PY}" >&2
        exit 1
    fi
    echo "→ Inicializando base de datos MySQL para '${CLUB}'"
    PYTHON_BIN="${PYTHON_BIN:-python3}"

    INIT_DB_ARGS=(--club "$CLUB" --admin-user "$DB_ADMIN_USER")
    if [[ -n "$DB_APP_USER" ]]; then
        INIT_DB_ARGS+=(--app-user "$DB_APP_USER")
    fi
    # La contraseña admin (y la del app-user, si procede) se piden por consola
    # de forma interactiva por el script Python — no se pasan por argumento.
    "$PYTHON_BIN" "$INIT_DB_PY" "${INIT_DB_ARGS[@]}"
fi

# ── Validar y recargar nginx ────────────────────────────────────────────────
echo "→ Validando configuración nginx"
nginx -t

echo "→ Recargando nginx"
nginx -s reload

echo ""
echo "✅ Club '${CLUB}' dado de alta correctamente."
echo "   URL:      https://${CLUB}.tacticalcore.es"
echo "   Backend:  http://127.0.0.1:${FLASK_PORT}"
echo "   Webroot:  ${WEBROOT}"
echo "   .env:     ${ENV_FILE}"
