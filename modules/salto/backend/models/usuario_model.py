"""
MODELO — Acceso a datos de la tabla `usuarios`.
"""

from models.db import get_connection


class UsuarioModel:
    """CRUD para la tabla usuarios."""

    def obtener_todos(self) -> list[dict]:
        with get_connection() as (conn, cur):
            cur.execute(
                "SELECT id_usuario, alias, nombre_completo, altura_m, peso_kg, fecha_registro "
                "FROM usuarios ORDER BY fecha_registro DESC"
            )
            return cur.fetchall()

    def obtener_paginados(self, search: str | None, limit: int, offset: int) -> list[dict]:
        """Lista usuarios ordenados alfabéticamente con paginación y filtro opcional."""
        patron = f"%{(search or '').strip()}%"
        with get_connection() as (conn, cur):
            if search:
                cur.execute(
                    "SELECT id_usuario, alias, nombre_completo, altura_m, peso_kg, fecha_registro "
                    "FROM usuarios "
                    "WHERE alias LIKE %s OR nombre_completo LIKE %s OR CAST(altura_m AS CHAR) LIKE %s "
                    "ORDER BY alias ASC LIMIT %s OFFSET %s",
                    (patron, patron, patron, limit, offset),
                )
            else:
                cur.execute(
                    "SELECT id_usuario, alias, nombre_completo, altura_m, peso_kg, fecha_registro "
                    "FROM usuarios "
                    "ORDER BY alias ASC LIMIT %s OFFSET %s",
                    (limit, offset),
                )
            return cur.fetchall()

    def contar(self, search: str | None = None) -> int:
        """Cuenta el número de usuarios, con filtro opcional."""
        patron = f"%{(search or '').strip()}%"
        with get_connection() as (conn, cur):
            if search:
                cur.execute(
                    "SELECT COUNT(*) AS total "
                    "FROM usuarios "
                    "WHERE alias LIKE %s OR nombre_completo LIKE %s OR CAST(altura_m AS CHAR) LIKE %s",
                    (patron, patron, patron),
                )
            else:
                cur.execute("SELECT COUNT(*) AS total FROM usuarios")
            row = cur.fetchone()
            return int(row["total"]) if row else 0

    def obtener_por_id(self, id_usuario: int) -> dict | None:
        with get_connection() as (conn, cur):
            cur.execute(
                "SELECT id_usuario, alias, nombre_completo, altura_m, peso_kg, fecha_registro "
                "FROM usuarios WHERE id_usuario = %s",
                (id_usuario,),
            )
            return cur.fetchone()

    def crear(self, alias: str, nombre_completo: str, altura_m: float, peso_kg: float | None = None) -> int:
        with get_connection() as (conn, cur):
            cur.execute(
                "INSERT INTO usuarios (alias, nombre_completo, altura_m, peso_kg) "
                "VALUES (%s, %s, %s, %s)",
                (alias, nombre_completo, altura_m, peso_kg),
            )
            return cur.lastrowid

    def actualizar(self, id_usuario: int, alias: str, nombre_completo: str, altura_m: float, peso_kg: float | None = None) -> bool:
        with get_connection() as (conn, cur):
            cur.execute(
                "UPDATE usuarios SET alias = %s, nombre_completo = %s, altura_m = %s, peso_kg = %s "
                "WHERE id_usuario = %s",
                (alias, nombre_completo, altura_m, peso_kg, id_usuario),
            )
            return cur.rowcount > 0

    def eliminar(self, id_usuario: int) -> bool:
        with get_connection() as (conn, cur):
            cur.execute(
                "DELETE FROM usuarios WHERE id_usuario = %s",
                (id_usuario,),
            )
            return cur.rowcount > 0
