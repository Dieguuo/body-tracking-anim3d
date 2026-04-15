"""
MODELO — Acceso a datos de la tabla `saltos`.
"""

import json
import logging

import mysql.connector
from models.db import get_connection


class SaltoModel:
    """CRUD para la tabla saltos."""

    _cache_columnas: dict[str, bool] = {}

    @classmethod
    def _tiene_columna(cls, cur, tabla: str, columna: str) -> bool:
        key = f"{tabla}.{columna}"
        if key in cls._cache_columnas:
            return cls._cache_columnas[key]

        cur.execute(
            "SELECT COUNT(*) AS total "
            "FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() "
            "AND TABLE_NAME = %s "
            "AND COLUMN_NAME = %s",
            (tabla, columna),
        )
        row = cur.fetchone() or {"total": 0}
        cls._cache_columnas[key] = int(row.get("total", 0)) > 0
        return cls._cache_columnas[key]

    @classmethod
    def _expr_col(cls, cur, tabla_alias: str, tabla_real: str, columna: str, alias: str | None = None) -> str:
        out_alias = alias or columna
        if cls._tiene_columna(cur, tabla_real, columna):
            return f"{tabla_alias}.{columna} AS {out_alias}"
        return f"NULL AS {out_alias}"

    @classmethod
    def _campos_saltos_select(cls, cur, alias: str = "s") -> str:
        base = [
            f"{alias}.id_salto",
            f"{alias}.id_usuario",
            f"{alias}.tipo_salto",
            f"{alias}.distancia_cm",
            f"{alias}.tiempo_vuelo_s",
            f"{alias}.confianza_ia",
            f"{alias}.metodo_origen",
            f"{alias}.fecha_salto",
        ]
        extras = [
            cls._expr_col(cur, alias, "saltos", "potencia_w"),
            cls._expr_col(cur, alias, "saltos", "asimetria_pct"),
            cls._expr_col(cur, alias, "saltos", "angulo_rodilla_deg"),
            cls._expr_col(cur, alias, "saltos", "angulo_cadera_deg"),
            cls._expr_col(cur, alias, "saltos", "estabilidad_aterrizaje"),
        ]

        if cls._tiene_columna(cur, "saltos", "curvas_json"):
            extras.append(f"JSON_REMOVE({alias}.curvas_json, '$.landmarks_frames') AS curvas_json")
        else:
            extras.append("NULL AS curvas_json")

        return ", ".join(base + extras)

    def obtener_videos_guardados(
        self,
        id_usuario: int | None = None,
        tipo_salto: str | None = None,
    ) -> list[dict]:
        """Lista metadatos de saltos que tienen vídeo almacenado en BD."""
        params: list = []
        where = ["s.video_blob IS NOT NULL"]

        if id_usuario is not None:
            where.append("s.id_usuario = %s")
            params.append(id_usuario)

        if tipo_salto:
            where.append("s.tipo_salto = %s")
            params.append(tipo_salto)

        sql = (
            "SELECT s.id_salto, s.id_usuario, u.alias, s.tipo_salto, s.distancia_cm, "
            "s.tiempo_vuelo_s, s.metodo_origen, s.fecha_salto, s.video_nombre, s.video_mime, "
            "LENGTH(s.video_blob) AS tamano_bytes "
            "FROM saltos s "
            "INNER JOIN usuarios u ON u.id_usuario = s.id_usuario "
            f"WHERE {' AND '.join(where)} "
            "ORDER BY s.fecha_salto DESC"
        )

        with get_connection() as (conn, cur):
            cur.execute(sql, tuple(params))
            return cur.fetchall()

    def obtener_video_por_id_salto(self, id_salto: int) -> dict | None:
        """Devuelve metadatos y blob de vídeo para reproducir en streaming."""
        with get_connection() as (conn, cur):
            cur.execute(
                "SELECT id_salto, id_usuario, tipo_salto, fecha_salto, video_nombre, video_mime, video_blob "
                "FROM saltos WHERE id_salto = %s AND video_blob IS NOT NULL",
                (id_salto,),
            )
            return cur.fetchone()

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
            campos = self._campos_saltos_select(cur, alias="s")
            cur.execute(
                f"SELECT {campos} FROM saltos s ORDER BY s.fecha_salto DESC"
            )
            return cur.fetchall()

    def obtener_por_id(self, id_salto: int) -> dict | None:
        with get_connection() as (conn, cur):
            campos = self._campos_saltos_select(cur, alias="s")
            cur.execute(
                f"SELECT {campos} FROM saltos s WHERE s.id_salto = %s",
                (id_salto,),
            )
            return cur.fetchone()

    def obtener_por_usuario(self, id_usuario: int) -> list[dict]:
        with get_connection() as (conn, cur):
            campos = self._campos_saltos_select(cur, alias="s")
            cur.execute(
                f"SELECT {campos} FROM saltos s "
                "WHERE s.id_usuario = %s ORDER BY s.fecha_salto DESC",
                (id_usuario,),
            )
            return cur.fetchall()

    def obtener_curvas_por_id(self, id_salto: int) -> dict | None:
        """Devuelve solo las curvas angulares almacenadas para un salto."""
        with get_connection() as (conn, cur):
            if not self._tiene_columna(cur, "saltos", "curvas_json"):
                return None
            cur.execute(
                "SELECT id_salto, curvas_json FROM saltos WHERE id_salto = %s",
                (id_salto,),
            )
            row = cur.fetchone()
            if not row:
                return None
            raw = row.get("curvas_json")
            if raw and isinstance(raw, str):
                row["curvas_json"] = json.loads(raw)
            return row

    def obtener_landmarks_por_id(self, id_salto: int) -> dict | None:
        """Devuelve landmarks frame a frame almacenados en curvas_json."""
        with get_connection() as (conn, cur):
            if not self._tiene_columna(cur, "saltos", "curvas_json"):
                return None

            cur.execute(
                "SELECT id_salto, curvas_json FROM saltos WHERE id_salto = %s",
                (id_salto,),
            )
            row = cur.fetchone()
            if not row:
                return None

            raw = row.get("curvas_json")
            if not raw:
                return None

            curvas = raw
            if isinstance(raw, str):
                try:
                    curvas = json.loads(raw)
                except json.JSONDecodeError:
                    return None

            if not isinstance(curvas, dict):
                return None

            frames = curvas.get("landmarks_frames")
            if not isinstance(frames, list) or len(frames) == 0:
                return None

            return {
                "id_salto": id_salto,
                "total_frames": len(frames),
                "frames": frames,
            }

    def crear(
        self,
        id_usuario: int,
        tipo_salto: str,
        distancia_cm: int,
        tiempo_vuelo_s: float | None,
        confianza_ia: float | None,
        metodo_origen: str,
        potencia_w: float | None = None,
        asimetria_pct: float | None = None,
        angulo_rodilla_deg: float | None = None,
        angulo_cadera_deg: float | None = None,
        estabilidad_aterrizaje: dict | None = None,
        curvas_json: dict | None = None,
    ) -> int:
        with get_connection() as (conn, cur):
            columnas = ["id_usuario", "tipo_salto", "distancia_cm", "tiempo_vuelo_s", "confianza_ia", "metodo_origen"]
            valores = [id_usuario, tipo_salto, distancia_cm, tiempo_vuelo_s, confianza_ia, metodo_origen]

            if self._tiene_columna(cur, "saltos", "potencia_w"):
                columnas.append("potencia_w")
                valores.append(potencia_w)
            if self._tiene_columna(cur, "saltos", "asimetria_pct"):
                columnas.append("asimetria_pct")
                valores.append(asimetria_pct)
            if self._tiene_columna(cur, "saltos", "angulo_rodilla_deg"):
                columnas.append("angulo_rodilla_deg")
                valores.append(angulo_rodilla_deg)
            if self._tiene_columna(cur, "saltos", "angulo_cadera_deg"):
                columnas.append("angulo_cadera_deg")
                valores.append(angulo_cadera_deg)
            if self._tiene_columna(cur, "saltos", "estabilidad_aterrizaje"):
                columnas.append("estabilidad_aterrizaje")
                valores.append(json.dumps(estabilidad_aterrizaje) if estabilidad_aterrizaje else None)
            if self._tiene_columna(cur, "saltos", "curvas_json"):
                columnas.append("curvas_json")
                valores.append(json.dumps(curvas_json) if curvas_json else None)

            cols_sql = ", ".join(columnas)
            placeholders = ", ".join(["%s"] * len(columnas))
            cur.execute(
                f"INSERT INTO saltos ({cols_sql}) VALUES ({placeholders})",
                tuple(valores),
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
            campos = self._campos_saltos_select(cur, alias="s")
            cur.execute(
                f"SELECT {campos} FROM saltos s "
                "WHERE s.id_usuario = %s AND s.tipo_salto = %s "
                "ORDER BY s.fecha_salto ASC",
                (id_usuario, tipo_salto),
            )
            return cur.fetchall()

    def actualizar(
        self,
        id_salto: int,
        tipo_salto: str,
        distancia_cm: int,
        tiempo_vuelo_s: float | None,
        confianza_ia: float | None,
        metodo_origen: str,
        potencia_w: float | None = None,
        asimetria_pct: float | None = None,
        angulo_rodilla_deg: float | None = None,
        angulo_cadera_deg: float | None = None,
        estabilidad_aterrizaje: dict | None = None,
    ) -> bool:
        with get_connection() as (conn, cur):
            sets = [
                "tipo_salto = %s",
                "distancia_cm = %s",
                "tiempo_vuelo_s = %s",
                "confianza_ia = %s",
                "metodo_origen = %s",
            ]
            valores = [tipo_salto, distancia_cm, tiempo_vuelo_s, confianza_ia, metodo_origen]

            if self._tiene_columna(cur, "saltos", "potencia_w"):
                sets.append("potencia_w = %s")
                valores.append(potencia_w)
            if self._tiene_columna(cur, "saltos", "asimetria_pct"):
                sets.append("asimetria_pct = %s")
                valores.append(asimetria_pct)
            if self._tiene_columna(cur, "saltos", "angulo_rodilla_deg"):
                sets.append("angulo_rodilla_deg = %s")
                valores.append(angulo_rodilla_deg)
            if self._tiene_columna(cur, "saltos", "angulo_cadera_deg"):
                sets.append("angulo_cadera_deg = %s")
                valores.append(angulo_cadera_deg)
            if self._tiene_columna(cur, "saltos", "estabilidad_aterrizaje"):
                sets.append("estabilidad_aterrizaje = %s")
                valores.append(json.dumps(estabilidad_aterrizaje) if estabilidad_aterrizaje is not None else None)

            valores.append(id_salto)
            cur.execute(
                f"UPDATE saltos SET {', '.join(sets)} WHERE id_salto = %s",
                tuple(valores),
            )
            return cur.rowcount > 0

    def obtener_historial_analitica_usuario(self, id_usuario: int, tipo_salto: str | None = None) -> list[dict]:
        """Historial enriquecido para analítica avanzada por usuario."""
        with get_connection() as (conn, cur):
            campos_saltos = self._campos_saltos_select(cur, alias="s")
            peso_expr = self._expr_col(cur, "u", "usuarios", "peso_kg")
            sql = (
                f"SELECT {campos_saltos}, {peso_expr}, u.alias "
                "FROM saltos s "
                "INNER JOIN usuarios u ON u.id_usuario = s.id_usuario "
                "WHERE s.id_usuario = %s"
            )
            params: list = [id_usuario]

            if tipo_salto:
                sql += " AND s.tipo_salto = %s"
                params.append(tipo_salto)

            sql += " ORDER BY s.fecha_salto ASC"
            cur.execute(sql, tuple(params))
            return cur.fetchall()

    def obtener_historial_analitica_global(self, tipo_salto: str | None = None) -> list[dict]:
        """Historial global enriquecido para correlaciones y rankings."""
        with get_connection() as (conn, cur):
            campos_saltos = self._campos_saltos_select(cur, alias="s")
            peso_expr = self._expr_col(cur, "u", "usuarios", "peso_kg")
            sql = (
                f"SELECT {campos_saltos}, {peso_expr}, u.alias "
                "FROM saltos s "
                "INNER JOIN usuarios u ON u.id_usuario = s.id_usuario "
                "WHERE 1 = 1"
            )
            params: list = []

            if tipo_salto:
                sql += " AND s.tipo_salto = %s"
                params.append(tipo_salto)

            sql += " ORDER BY s.fecha_salto ASC"
            cur.execute(sql, tuple(params))
            return cur.fetchall()

    def eliminar(self, id_salto: int) -> bool:
        with get_connection() as (conn, cur):
            cur.execute(
                "DELETE FROM saltos WHERE id_salto = %s",
                (id_salto,),
            )
            return cur.rowcount > 0
