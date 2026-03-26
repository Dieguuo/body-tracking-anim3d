"""
MODEL — Acceso a datos de la tabla `saltos`.
"""

import logging

import mysql.connector
from models.db import get_connection


class SaltoModel:
    """CRUD para la tabla saltos."""

    def guardar_video_bd(
        self,
        id_salto: int,
        video_bytes: bytes,
        video_nombre: str | None,
        video_mime: str | None,
    ) -> bool:
        """
        Guarda el vídeo asociado a un salto en la tabla `saltos`.

        Las columnas video_blob, video_nombre, video_mime deben existir
        en la tabla (ver scripts/init_db.sql).
        """
        if not video_bytes:
            return False

        try:
            with get_connection() as (conn, cur):
                cur.execute(
                    "UPDATE saltos "
                    "SET video_blob = %s, video_nombre = %s, video_mime = %s "
                    "WHERE id_salto = %s",
                    (video_bytes, video_nombre, video_mime, id_salto),
                )
                return cur.rowcount > 0
        except mysql.connector.Error as exc:
            logging.getLogger(__name__).warning("guardar_video_bd falló: %s", exc)
            return False

    def obtener_todos(self) -> list[dict]:
        with get_connection() as (conn, cur):
            cur.execute(
                "SELECT id_salto, id_usuario, tipo_salto, distancia_cm, "
                "tiempo_vuelo_s, confianza_ia, metodo_origen, fecha_salto "
                "FROM saltos ORDER BY fecha_salto DESC"
            )
            return cur.fetchall()

    def obtener_por_id(self, id_salto: int) -> dict | None:
        with get_connection() as (conn, cur):
            cur.execute(
                "SELECT id_salto, id_usuario, tipo_salto, distancia_cm, "
                "tiempo_vuelo_s, confianza_ia, metodo_origen, fecha_salto "
                "FROM saltos WHERE id_salto = %s",
                (id_salto,),
            )
            return cur.fetchone()

    def obtener_por_usuario(self, id_usuario: int) -> list[dict]:
        with get_connection() as (conn, cur):
            cur.execute(
                "SELECT id_salto, id_usuario, tipo_salto, distancia_cm, "
                "tiempo_vuelo_s, confianza_ia, metodo_origen, fecha_salto "
                "FROM saltos WHERE id_usuario = %s ORDER BY fecha_salto DESC",
                (id_usuario,),
            )
            return cur.fetchall()

    def crear(
        self,
        id_usuario: int,
        tipo_salto: str,
        distancia_cm: int,
        tiempo_vuelo_s: float | None,
        confianza_ia: float | None,
        metodo_origen: str,
    ) -> int:
        with get_connection() as (conn, cur):
            cur.execute(
                "INSERT INTO saltos (id_usuario, tipo_salto, distancia_cm, "
                "tiempo_vuelo_s, confianza_ia, metodo_origen) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (id_usuario, tipo_salto, distancia_cm, tiempo_vuelo_s, confianza_ia, metodo_origen),
            )
            return cur.lastrowid

    def contar_por_tipo(self, id_usuario: int) -> dict[str, int]:
        """Devuelve {'vertical': N, 'horizontal': M} para un usuario."""
        with get_connection() as (conn, cur):
            cur.execute(
                "SELECT tipo_salto, COUNT(*) AS total "
                "FROM saltos WHERE id_usuario = %s GROUP BY tipo_salto",
                (id_usuario,),
            )
            rows = cur.fetchall()
        resultado = {"vertical": 0, "horizontal": 0}
        for r in rows:
            resultado[r["tipo_salto"]] = r["total"]
        return resultado

    def obtener_por_usuario_y_tipo(self, id_usuario: int, tipo_salto: str) -> list[dict]:
        with get_connection() as (conn, cur):
            cur.execute(
                "SELECT id_salto, id_usuario, tipo_salto, distancia_cm, "
                "tiempo_vuelo_s, confianza_ia, metodo_origen, fecha_salto "
                "FROM saltos WHERE id_usuario = %s AND tipo_salto = %s "
                "ORDER BY fecha_salto ASC",
                (id_usuario, tipo_salto),
            )
            return cur.fetchall()

    def eliminar(self, id_salto: int) -> bool:
        with get_connection() as (conn, cur):
            cur.execute(
                "DELETE FROM saltos WHERE id_salto = %s",
                (id_salto,),
            )
            return cur.rowcount > 0
