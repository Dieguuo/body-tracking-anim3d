"""
init_db.py — Inicializa la base de datos MySQL para una instancia Anim3D (un club).

Ejecuta el esquema de `init_db.sql` sustituyendo el nombre de la DB por
`bd_anim3d_<club>` y, opcionalmente, crea el usuario MySQL de la aplicación
con permisos mínimos (SELECT/INSERT/UPDATE/DELETE) sobre esa DB.

Uso:
    python scripts/init_db.py --club nombreclub \
        --admin-user root --admin-password ROOTPWD \
        [--app-user anim3d --app-password APPPWD]

Llamado por `deploy/nuevo_club.sh` durante el alta de un club nuevo.

Idempotente: el SQL usa CREATE ... IF NOT EXISTS, puede re-ejecutarse sin daño.
"""

from __future__ import annotations

import argparse
import getpass
import os
import re
import sys
from pathlib import Path

import mysql.connector
from mysql.connector import errorcode


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_SQL_PATH = SCRIPT_DIR / "init_db.sql"
DEFAULT_DB_PREFIX = "bd_anim3d_"
ORIGINAL_DB_NAME = "bd_anim3d_saltos"  # nombre fijo en init_db.sql

CLUB_RE = re.compile(r"^[a-z0-9_]+$")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--club", required=True, help="Identificador del club (minúsculas, dígitos, guion bajo)")
    p.add_argument("--host", default=os.getenv("DB_HOST", "localhost"))
    p.add_argument("--port", type=int, default=int(os.getenv("DB_PORT", "3306")))
    p.add_argument("--admin-user", default=os.getenv("DB_ADMIN_USER", "root"),
                   help="Usuario MySQL con permisos CREATE/GRANT (default: root)")
    p.add_argument("--admin-password", default=os.getenv("DB_ADMIN_PASSWORD"),
                   help="Contraseña admin (si se omite, se solicita por consola)")
    p.add_argument("--app-user", default=None,
                   help="Crear usuario MySQL para Flask con permisos limitados (opcional)")
    p.add_argument("--app-password", default=os.getenv("DB_APP_PASSWORD"),
                   help="Contraseña del usuario de aplicación (si se omite y --app-user, se pide)")
    p.add_argument("--sql-file", default=str(DEFAULT_SQL_PATH),
                   help=f"Ruta al SQL de esquema (default: {DEFAULT_SQL_PATH})")
    p.add_argument("--db-name", default=None,
                   help=f"Nombre de DB (default: {DEFAULT_DB_PREFIX}<club>)")
    return p.parse_args()


def normalizar_club(club: str) -> str:
    club = club.strip().lower().replace("-", "_")
    if not CLUB_RE.match(club):
        sys.exit(f"ERROR: --club inválido: '{club}' (solo minúsculas, dígitos y _)")
    return club


def cargar_sql(path: Path, db_name: str) -> str:
    if not path.is_file():
        sys.exit(f"ERROR: no se encuentra el SQL: {path}")
    contenido = path.read_text(encoding="utf-8")
    # Sustituir nombre de DB literal en CREATE DATABASE / USE / TABLE_SCHEMA = '...'
    sustituido = contenido.replace(ORIGINAL_DB_NAME, db_name)
    return sustituido


def ejecutar_sql(cursor, sql: str) -> None:
    """Ejecuta múltiples statements respetando bloques PREPARE/EXECUTE."""
    # mysql-connector soporta multi=True para parsear múltiples statements
    for resultado in cursor.execute(sql, multi=True):
        # Consumir cualquier resultado para liberar el cursor
        if resultado.with_rows:
            resultado.fetchall()


# Identificadores MySQL válidos: letras, dígitos y guion bajo. Sin esto NO se pueden
# parametrizar con %s en sentencias DDL (CREATE USER / GRANT no aceptan placeholders).
IDENT_RE = re.compile(r"^[a-zA-Z0-9_]+$")


def _validar_ident(valor: str, campo: str) -> str:
    if not IDENT_RE.match(valor):
        sys.exit(f"ERROR: {campo} inválido: '{valor}' (solo letras, dígitos y _)")
    return valor


def crear_usuario_app(cursor, db_name: str, app_user: str, app_password: str) -> None:
    """Crea el usuario MySQL de la aplicación con permisos mínimos.

    NOTA: MySQL no permite placeholders %s en CREATE USER / GRANT, por lo que el
    nombre de usuario y de DB se interpolan directamente tras validarlos contra
    IDENT_RE. La contraseña se escapa duplicando comillas simples.
    """
    _validar_ident(app_user, "--app-user")
    _validar_ident(db_name, "--db-name")
    pwd_escaped = app_password.replace("\\", "\\\\").replace("'", "''")

    cursor.execute(
        f"CREATE USER IF NOT EXISTS `{app_user}`@`%` IDENTIFIED BY '{pwd_escaped}'"
    )
    cursor.execute(
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON `{db_name}`.* TO `{app_user}`@`%`"
    )
    cursor.execute("FLUSH PRIVILEGES")


def main() -> int:
    args = parse_args()
    club = normalizar_club(args.club)
    db_name = args.db_name or f"{DEFAULT_DB_PREFIX}{club}"

    if not re.match(r"^[a-zA-Z0-9_]+$", db_name):
        sys.exit(f"ERROR: nombre de DB inválido: '{db_name}'")

    admin_password = args.admin_password
    if admin_password is None:
        admin_password = getpass.getpass(f"Contraseña MySQL para '{args.admin_user}': ")

    app_password = args.app_password
    if args.app_user and not app_password:
        app_password = getpass.getpass(f"Contraseña para nuevo usuario '{args.app_user}': ")

    print(f"→ Conectando a MySQL en {args.host}:{args.port} como {args.admin_user}")
    try:
        conn = mysql.connector.connect(
            host=args.host,
            port=args.port,
            user=args.admin_user,
            password=admin_password,
        )
    except mysql.connector.Error as e:
        if e.errno == errorcode.ER_ACCESS_DENIED_ERROR:
            sys.exit("ERROR: credenciales admin incorrectas")
        sys.exit(f"ERROR conectando a MySQL: {e}")

    try:
        cursor = conn.cursor()

        print(f"→ Cargando esquema desde {args.sql_file}")
        sql = cargar_sql(Path(args.sql_file), db_name)

        print(f"→ Creando/actualizando DB '{db_name}'")
        ejecutar_sql(cursor, sql)
        conn.commit()

        if args.app_user:
            print(f"→ Creando usuario de aplicación '{args.app_user}' con permisos sobre '{db_name}'")
            crear_usuario_app(cursor, db_name, args.app_user, app_password)
            conn.commit()

        cursor.close()
    finally:
        conn.close()

    print("")
    print(f"✅ Base de datos '{db_name}' lista para el club '{club}'.")
    if args.app_user:
        print(f"   Usuario aplicación: {args.app_user}")
        print(f"   Configura el .env del backend con:")
        print(f"     DB_NAME={db_name}")
        print(f"     DB_USER={args.app_user}")
        print(f"     DB_PASSWORD=<la contraseña que acabas de definir>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
