"""
Modelo de usuarios del modulo futbol.

Sobre el esquema unificado bd_anim3d, todos los jugadores comparten
la tabla `usuarios`. Esta clase se mantiene como capa de compatibilidad
para no obligar a reescribir los controllers/endpoints existentes;
simplemente delega en `usuarios` y normaliza los nombres de campo
historicos del modulo futbol (`nombre`, `id`).
"""

from models.db import get_connection


class UsuariosFutbolModel:

    # Mapeo de campos del payload antiguo (modulo futbol) -> esquema unificado.
    _MAP_CREAR = {
        "alias": "alias",
        "nombre": "nombre_completo",
        "nombre_completo": "nombre_completo",
        "altura_m": "altura_m",
        "peso_kg": "peso_kg",
    }

    _SELECT_BASE = (
        "SELECT id_usuario, id_usuario AS id, alias, "
        "nombre_completo AS nombre, nombre_completo, "
        "altura_m, peso_kg, fecha_registro AS fecha_creacion "
        "FROM usuarios"
    )

    def obtener_todos(self, paginado=False, search=None, limit=20, offset=0):
        query = self._SELECT_BASE
        params = []

        if search:
            query += " WHERE alias LIKE %s OR nombre_completo LIKE %s"
            params.extend([f"%{search}%", f"%{search}%"])

        query += " ORDER BY fecha_registro DESC"

        if paginado:
            query += " LIMIT %s OFFSET %s"
            params.extend([limit, offset])

        with get_connection() as (conn, cursor):
            cursor.execute(query, tuple(params))
            return cursor.fetchall()

    def obtener_por_id(self, id_usuario):
        with get_connection() as (conn, cursor):
            cursor.execute(
                self._SELECT_BASE + " WHERE id_usuario = %s",
                (id_usuario,),
            )
            return cursor.fetchone()

    def crear(self, data):
        datos = {self._MAP_CREAR[k]: v for k, v in data.items() if k in self._MAP_CREAR}

        # Validacion estricta de campos obligatorios del esquema unificado.
        if not datos.get("alias"):
            return None
        if not datos.get("nombre_completo"):
            datos["nombre_completo"] = datos["alias"]
        if datos.get("altura_m") in (None, ""):
            raise ValueError("altura_m es obligatorio")

        cols_sql = ", ".join(datos.keys())
        placeholders = ", ".join(["%s"] * len(datos))
        with get_connection() as (conn, cursor):
            cursor.execute(
                f"INSERT INTO usuarios ({cols_sql}) VALUES ({placeholders})",
                tuple(datos.values()),
            )
            return cursor.lastrowid

    def actualizar(self, id_usuario, data):
        datos = {self._MAP_CREAR[k]: v for k, v in data.items() if k in self._MAP_CREAR}
        if not datos:
            return 0

        set_sql = ", ".join([f"{k} = %s" for k in datos.keys()])
        params = list(datos.values()) + [id_usuario]
        with get_connection() as (conn, cursor):
            cursor.execute(
                f"UPDATE usuarios SET {set_sql} WHERE id_usuario = %s",
                tuple(params),
            )
            return cursor.rowcount

    def eliminar(self, id_usuario):
        with get_connection() as (conn, cursor):
            cursor.execute(
                "DELETE FROM usuarios WHERE id_usuario = %s",
                (id_usuario,),
            )
            return cursor.rowcount

    def contar_total(self, search=None):
        query = "SELECT COUNT(*) AS total FROM usuarios"
        params = []
        if search:
            query += " WHERE alias LIKE %s OR nombre_completo LIKE %s"
            params.extend([f"%{search}%", f"%{search}%"])

        with get_connection() as (conn, cursor):
            cursor.execute(query, tuple(params))
            row = cursor.fetchone() or {"total": 0}
            return int(row.get("total", 0))
