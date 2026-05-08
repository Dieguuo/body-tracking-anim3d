"""
MODELO — Acceso a datos de saltos sobre el esquema unificado bd_anim3d.

El esquema unificado almacena cada salto como:
  - gestos          (cabecera comun, modulo='salto')
  - gestos_salto    (especializacion: distancia, angulos, etc.)
  - gestos_curvas   (curvas y landmarks; opcional)
  - gestos_videos   (BLOB del video; opcional)

Para minimizar el cambio en analitica y controllers, las lecturas
usan la vista `v_saltos`, que reproduce las columnas historicas
(id_salto, fecha_salto, ...).
"""

import json
import logging

import mysql.connector
from models.db import get_connection


# Campos expuestos por la vista v_saltos en orden estable.
_CAMPOS_VSALTOS = (
    "id_salto, id_usuario, id_sesion, tipo_salto, distancia_cm, "
    "tiempo_vuelo_s, confianza_ia, metodo_origen, fecha_salto, "
    "potencia_w, asimetria_pct, angulo_rodilla_deg, angulo_cadera_deg, "
    "estabilidad_aterrizaje"
)


class SaltoModel:
    """CRUD de saltos sobre el esquema unificado (gestos + gestos_salto)."""

    # ── Helpers internos ────────────────────────────────────────
    @staticmethod
    def _curvas_por_id(cur, id_salto: int) -> dict | None:
        cur.execute(
            "SELECT curvas_json FROM gestos_curvas WHERE id_gesto = %s",
            (id_salto,),
        )
        row = cur.fetchone()
        if not row:
            return None
        raw = row.get("curvas_json")
        if raw is None:
            return None
        if isinstance(raw, (bytes, bytearray)):
            raw = raw.decode("utf-8", errors="ignore")
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return None
        return raw

    @staticmethod
    def _adjuntar_curvas(rows: list[dict]) -> list[dict]:
        """Anade campo `curvas_json` (sin landmarks_frames) a cada fila."""
        if not rows:
            return rows
        ids = [r["id_salto"] for r in rows if r.get("id_salto") is not None]
        if not ids:
            return rows
        with get_connection() as (conn, cur):
            placeholders = ",".join(["%s"] * len(ids))
            cur.execute(
                f"SELECT id_gesto, JSON_REMOVE(curvas_json, '$.landmarks_frames') AS curvas_json "
                f"FROM gestos_curvas WHERE id_gesto IN ({placeholders})",
                tuple(ids),
            )
            mapa = {row["id_gesto"]: row.get("curvas_json") for row in cur.fetchall()}
        for r in rows:
            r["curvas_json"] = mapa.get(r["id_salto"])
        return rows

    # ── Lecturas ────────────────────────────────────────────────
    def obtener_todos(self) -> list[dict]:
        with get_connection() as (conn, cur):
            cur.execute(
                f"SELECT {_CAMPOS_VSALTOS} FROM v_saltos ORDER BY fecha_salto DESC"
            )
            rows = cur.fetchall()
        return self._adjuntar_curvas(rows)

    def obtener_por_id(self, id_salto: int) -> dict | None:
        with get_connection() as (conn, cur):
            cur.execute(
                f"SELECT {_CAMPOS_VSALTOS} FROM v_saltos WHERE id_salto = %s",
                (id_salto,),
            )
            row = cur.fetchone()
        if row:
            self._adjuntar_curvas([row])
        return row

    def obtener_por_usuario(self, id_usuario: int) -> list[dict]:
        with get_connection() as (conn, cur):
            cur.execute(
                f"SELECT {_CAMPOS_VSALTOS} FROM v_saltos "
                "WHERE id_usuario = %s ORDER BY fecha_salto DESC",
                (id_usuario,),
            )
            rows = cur.fetchall()
        return self._adjuntar_curvas(rows)

    def obtener_por_usuario_y_tipo(self, id_usuario: int, tipo_salto: str) -> list[dict]:
        with get_connection() as (conn, cur):
            cur.execute(
                f"SELECT {_CAMPOS_VSALTOS} FROM v_saltos "
                "WHERE id_usuario = %s AND tipo_salto = %s "
                "ORDER BY fecha_salto ASC",
                (id_usuario, tipo_salto),
            )
            rows = cur.fetchall()
        return self._adjuntar_curvas(rows)

    def contar_por_tipo(self, id_usuario: int) -> dict[str, int]:
        with get_connection() as (conn, cur):
            cur.execute(
                "SELECT tipo_salto, COUNT(*) AS total "
                "FROM v_saltos WHERE id_usuario = %s GROUP BY tipo_salto",
                (id_usuario,),
            )
            rows = cur.fetchall()
        resultado = {"vertical": 0, "horizontal": 0}
        for r in rows:
            resultado[r["tipo_salto"]] = r["total"]
        return resultado

    def obtener_curvas_por_id(self, id_salto: int) -> dict | None:
        with get_connection() as (conn, cur):
            curvas = self._curvas_por_id(cur, id_salto)
        if curvas is None:
            return None
        return {"id_salto": id_salto, "curvas_json": curvas}

    def obtener_landmarks_por_id(self, id_salto: int) -> dict | None:
        with get_connection() as (conn, cur):
            curvas = self._curvas_por_id(cur, id_salto)
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

    def obtener_historial_analitica_usuario(
        self, id_usuario: int, tipo_salto: str | None = None
    ) -> list[dict]:
        with get_connection() as (conn, cur):
            sql = (
                f"SELECT s.{', s.'.join(_CAMPOS_VSALTOS.split(', '))}, "
                "u.peso_kg, u.alias "
                "FROM v_saltos s "
                "INNER JOIN usuarios u ON u.id_usuario = s.id_usuario "
                "WHERE s.id_usuario = %s"
            )
            params: list = [id_usuario]
            if tipo_salto:
                sql += " AND s.tipo_salto = %s"
                params.append(tipo_salto)
            sql += " ORDER BY s.fecha_salto ASC"
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()
        return self._adjuntar_curvas(rows)

    def obtener_historial_analitica_global(
        self, tipo_salto: str | None = None
    ) -> list[dict]:
        with get_connection() as (conn, cur):
            sql = (
                f"SELECT s.{', s.'.join(_CAMPOS_VSALTOS.split(', '))}, "
                "u.peso_kg, u.alias "
                "FROM v_saltos s "
                "INNER JOIN usuarios u ON u.id_usuario = s.id_usuario "
                "WHERE 1 = 1"
            )
            params: list = []
            if tipo_salto:
                sql += " AND s.tipo_salto = %s"
                params.append(tipo_salto)
            sql += " ORDER BY s.fecha_salto ASC"
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()
        return self._adjuntar_curvas(rows)

    # ── Escrituras ──────────────────────────────────────────────
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
            cur.execute(
                "INSERT INTO gestos (id_usuario, modulo, subtipo, metodo_origen, confianza_ia) "
                "VALUES (%s, 'salto', %s, %s, %s)",
                (id_usuario, tipo_salto, metodo_origen, confianza_ia),
            )
            id_gesto = cur.lastrowid

            cur.execute(
                "INSERT INTO gestos_salto "
                "(id_gesto, tipo_salto, distancia_cm, tiempo_vuelo_s, potencia_w, "
                " asimetria_pct, angulo_rodilla_deg, angulo_cadera_deg, estabilidad_aterrizaje) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    id_gesto,
                    tipo_salto,
                    distancia_cm,
                    tiempo_vuelo_s,
                    potencia_w,
                    asimetria_pct,
                    angulo_rodilla_deg,
                    angulo_cadera_deg,
                    json.dumps(estabilidad_aterrizaje) if estabilidad_aterrizaje else None,
                ),
            )

            if curvas_json:
                cur.execute(
                    "INSERT INTO gestos_curvas (id_gesto, curvas_json) VALUES (%s, %s)",
                    (id_gesto, json.dumps(curvas_json)),
                )

            return id_gesto

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
            cur.execute(
                "UPDATE gestos SET subtipo = %s, metodo_origen = %s, confianza_ia = %s "
                "WHERE id_gesto = %s AND modulo = 'salto'",
                (tipo_salto, metodo_origen, confianza_ia, id_salto),
            )
            cur.execute(
                "UPDATE gestos_salto SET tipo_salto = %s, distancia_cm = %s, "
                "tiempo_vuelo_s = %s, potencia_w = %s, asimetria_pct = %s, "
                "angulo_rodilla_deg = %s, angulo_cadera_deg = %s, "
                "estabilidad_aterrizaje = %s WHERE id_gesto = %s",
                (
                    tipo_salto,
                    distancia_cm,
                    tiempo_vuelo_s,
                    potencia_w,
                    asimetria_pct,
                    angulo_rodilla_deg,
                    angulo_cadera_deg,
                    json.dumps(estabilidad_aterrizaje) if estabilidad_aterrizaje is not None else None,
                    id_salto,
                ),
            )
            return cur.rowcount >= 0

    def eliminar(self, id_salto: int) -> bool:
        # CASCADE limpia gestos_salto, gestos_curvas, gestos_videos, gestos_alertas.
        with get_connection() as (conn, cur):
            cur.execute(
                "DELETE FROM gestos WHERE id_gesto = %s AND modulo = 'salto'",
                (id_salto,),
            )
            return cur.rowcount > 0

    # ── Videos (gestos_videos) ──────────────────────────────────
    def obtener_videos_guardados(
        self,
        id_usuario: int | None = None,
        tipo_salto: str | None = None,
    ) -> list[dict]:
        params: list = []
        where = ["1 = 1"]
        if id_usuario is not None:
            where.append("s.id_usuario = %s")
            params.append(id_usuario)
        if tipo_salto:
            where.append("s.tipo_salto = %s")
            params.append(tipo_salto)

        sql = (
            "SELECT s.id_salto, s.id_usuario, u.alias, u.altura_m, u.peso_kg, s.tipo_salto, s.distancia_cm, "
            "s.tiempo_vuelo_s, s.metodo_origen, s.fecha_salto, "
            "v.video_nombre, v.video_mime, LENGTH(v.video_blob) AS tamano_bytes "
            "FROM v_saltos s "
            "INNER JOIN usuarios u      ON u.id_usuario = s.id_usuario "
            "INNER JOIN gestos_videos v ON v.id_gesto   = s.id_salto "
            f"WHERE {' AND '.join(where)} "
            "ORDER BY s.fecha_salto DESC"
        )
        with get_connection() as (conn, cur):
            cur.execute(sql, tuple(params))
            return cur.fetchall()

    def obtener_video_por_id_salto(self, id_salto: int) -> dict | None:
        with get_connection() as (conn, cur):
            cur.execute(
                "SELECT s.id_salto, s.id_usuario, s.tipo_salto, s.fecha_salto, "
                "v.video_nombre, v.video_mime, v.video_blob "
                "FROM v_saltos s "
                "INNER JOIN gestos_videos v ON v.id_gesto = s.id_salto "
                "WHERE s.id_salto = %s",
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
        if not video_bytes:
            return False
        try:
            with get_connection() as (conn, cur):
                cur.execute(
                    "INSERT INTO gestos_videos (id_gesto, video_blob, video_nombre, video_mime) "
                    "VALUES (%s, %s, %s, %s) "
                    "ON DUPLICATE KEY UPDATE "
                    "video_blob = VALUES(video_blob), "
                    "video_nombre = VALUES(video_nombre), "
                    "video_mime = VALUES(video_mime)",
                    (id_salto, video_bytes, video_nombre, video_mime),
                )
                return True
        except mysql.connector.Error as exc:
            logging.getLogger(__name__).warning("guardar_video_bd fallo: %s", exc)
            return False
