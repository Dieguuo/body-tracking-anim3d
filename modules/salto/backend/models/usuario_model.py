"""
MODELO — Acceso a datos de la tabla `usuarios`.
"""

from models.db import get_connection


class UsuarioModel:
    """CRUD para la tabla usuarios."""

    _cache_tiene_peso_kg: bool | None = None

    @classmethod
    def _tiene_columna_peso_kg(cls, cur) -> bool:
        """Detecta si la BD activa ya tiene la columna peso_kg."""
        if cls._cache_tiene_peso_kg is not None:
            return cls._cache_tiene_peso_kg

        cur.execute(
            "SELECT COUNT(*) AS total "
            "FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() "
            "AND TABLE_NAME = 'usuarios' "
            "AND COLUMN_NAME = 'peso_kg'"
        )
        row = cur.fetchone() or {"total": 0}
        cls._cache_tiene_peso_kg = int(row.get("total", 0)) > 0
        return cls._cache_tiene_peso_kg

    @classmethod
    def _select_campos_usuario(cls, incluir_peso: bool) -> str:
        if incluir_peso:
            return "id_usuario, alias, nombre_completo, altura_m, peso_kg, fecha_registro"
        return "id_usuario, alias, nombre_completo, altura_m, NULL AS peso_kg, fecha_registro"

    def obtener_todos(self) -> list[dict]:
        with get_connection() as (conn, cur):
            incluir_peso = self._tiene_columna_peso_kg(cur)
            cur.execute(
                f"SELECT {self._select_campos_usuario(incluir_peso)} "
                "FROM usuarios ORDER BY fecha_registro DESC"
            )
            return cur.fetchall()

    def obtener_paginados(self, search: str | None, limit: int, offset: int) -> list[dict]:
        """Lista usuarios ordenados alfabéticamente con paginación y filtro opcional."""
        patron = f"%{(search or '').strip()}%"
        with get_connection() as (conn, cur):
            incluir_peso = self._tiene_columna_peso_kg(cur)
            campos = self._select_campos_usuario(incluir_peso)
            if search:
                cur.execute(
                    f"SELECT {campos} "
                    "FROM usuarios "
                    "WHERE alias LIKE %s OR nombre_completo LIKE %s OR CAST(altura_m AS CHAR) LIKE %s "
                    "ORDER BY alias ASC LIMIT %s OFFSET %s",
                    (patron, patron, patron, limit, offset),
                )
            else:
                cur.execute(
                    f"SELECT {campos} "
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
            incluir_peso = self._tiene_columna_peso_kg(cur)
            cur.execute(
                f"SELECT {self._select_campos_usuario(incluir_peso)} "
                "FROM usuarios WHERE id_usuario = %s",
                (id_usuario,),
            )
            return cur.fetchone()

    def crear(self, alias: str, nombre_completo: str, altura_m: float, peso_kg: float | None = None) -> int:
        with get_connection() as (conn, cur):
            if self._tiene_columna_peso_kg(cur):
                cur.execute(
                    "INSERT INTO usuarios (alias, nombre_completo, altura_m, peso_kg) "
                    "VALUES (%s, %s, %s, %s)",
                    (alias, nombre_completo, altura_m, peso_kg),
                )
            else:
                cur.execute(
                    "INSERT INTO usuarios (alias, nombre_completo, altura_m) "
                    "VALUES (%s, %s, %s)",
                    (alias, nombre_completo, altura_m),
                )
            return cur.lastrowid

    def actualizar(self, id_usuario: int, alias: str, nombre_completo: str, altura_m: float, peso_kg: float | None = None) -> bool:
        with get_connection() as (conn, cur):
            if self._tiene_columna_peso_kg(cur):
                cur.execute(
                    "UPDATE usuarios SET alias = %s, nombre_completo = %s, altura_m = %s, peso_kg = %s "
                    "WHERE id_usuario = %s",
                    (alias, nombre_completo, altura_m, peso_kg, id_usuario),
                )
            else:
                cur.execute(
                    "UPDATE usuarios SET alias = %s, nombre_completo = %s, altura_m = %s "
                    "WHERE id_usuario = %s",
                    (alias, nombre_completo, altura_m, id_usuario),
                )
            return cur.rowcount > 0

    def eliminar(self, id_usuario: int) -> bool:
        with get_connection() as (conn, cur):
            cur.execute(
                "DELETE FROM usuarios WHERE id_usuario = %s",
                (id_usuario,),
            )
            return cur.rowcount > 0
