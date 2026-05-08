"""
MODELO — Acceso a datos de golpeos sobre el esquema unificado bd_anim3d.

El esquema unificado almacena cada golpeo como:
  - gestos          (cabecera comun, modulo='futbol')
  - gestos_futbol   (especializacion: pierna, velocidad_pie, etc.)
  - gestos_curvas   (curvas y landmarks; opcional)
  - gestos_alertas  (alertas normalizadas, 1:N)
  - gestos_videos   (BLOB del video; opcional)

Para minimizar el cambio en analitica y controllers, las lecturas
usan la vista `v_golpeos`, que reproduce las columnas historicas
(id_golpeo, fecha_golpeo, confianza, ...).
"""

from datetime import datetime
import json
import logging

import mysql.connector

from config import FEATURES_VERSION
from models.db import get_connection
from utils.serializers import normalizar_float


# Campos expuestos por la vista v_golpeos en orden estable.
_CAMPOS_VGOLPEOS = (
    "id_golpeo, id_usuario, id_sesion, fecha_golpeo, metodo_origen, "
    "confianza_ia, confianza, fps, ancho_px, alto_px, "
    "pierna_golpeo, pierna_apoyo, velocidad_pie_ms, frame_impacto, "
    "angulo_cadera_deg, angulo_rodilla_deg, angulo_tobillo_deg, "
    "estabilidad_tronco, oscilacion_tronco_px, tiempo_estabilizacion_s, "
    "asimetria_postura_pct, score_compuesto, clasificacion, features_version"
)


class FutbolModel:
    """CRUD de golpeos sobre el esquema unificado (gestos + gestos_futbol)."""

    # ── Escrituras ──────────────────────────────────────────────
    def guardar_golpeo(self, id_usuario: int, data: dict, metodo_origen: str = "video_galeria") -> dict:
        payload = {
            "angulo_cadera_deg": normalizar_float(data.get("angulo_cadera_deg")),
            "angulo_rodilla_deg": normalizar_float(data.get("angulo_rodilla_deg")),
            "angulo_tobillo_deg": normalizar_float(data.get("angulo_tobillo_deg")),
            "estabilidad_tronco": normalizar_float(data.get("estabilidad_tronco")),
            "pierna_golpeo": (data.get("pierna_golpeo") or "desconocida"),
            "pierna_apoyo": (data.get("pierna_apoyo") or "desconocida"),
            "confianza": normalizar_float(data.get("confianza")),
            "metodo_origen": metodo_origen,
            "velocidad_pie_ms": normalizar_float(data.get("velocidad_pie_ms")),
            "frame_impacto": _safe_int(data.get("frame_impacto")),
            "asimetria_postura_pct": normalizar_float(data.get("asimetria_postura_pct")),
            "score_compuesto": normalizar_float(data.get("score_compuesto")),
            "clasificacion": data.get("clasificacion"),
            "curvas_json": data.get("curvas"),
            "alertas_json": data.get("alertas"),
            "landmarks_json": data.get("_landmarks_frames") or data.get("landmarks_frames"),
        }

        with get_connection() as (conn, cursor):
            cursor.execute(
                "INSERT INTO gestos (id_usuario, modulo, fecha, metodo_origen, confianza_ia) "
                "VALUES (%s, 'futbol', %s, %s, %s)",
                (id_usuario, datetime.now(), metodo_origen, payload["confianza"]),
            )
            id_gesto = cursor.lastrowid

            cursor.execute(
                "INSERT INTO gestos_futbol "
                "(id_gesto, pierna_golpeo, pierna_apoyo, velocidad_pie_ms, frame_impacto, "
                " angulo_cadera_deg, angulo_rodilla_deg, angulo_tobillo_deg, "
                " estabilidad_tronco, asimetria_postura_pct, score_compuesto, clasificacion, "
                " features_version) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    id_gesto,
                    _enum_pierna(payload["pierna_golpeo"]),
                    _enum_pierna(payload["pierna_apoyo"]),
                    payload["velocidad_pie_ms"],
                    payload["frame_impacto"],
                    payload["angulo_cadera_deg"],
                    payload["angulo_rodilla_deg"],
                    payload["angulo_tobillo_deg"],
                    payload["estabilidad_tronco"],
                    payload["asimetria_postura_pct"],
                    payload["score_compuesto"],
                    payload["clasificacion"],
                    FEATURES_VERSION,
                ),
            )

            curvas_dump = _safe_json_dump(payload["curvas_json"])
            landmarks_dump = _safe_json_dump(payload["landmarks_json"])
            if curvas_dump is not None or landmarks_dump is not None:
                cursor.execute(
                    "INSERT INTO gestos_curvas (id_gesto, curvas_json, landmarks_json) "
                    "VALUES (%s, %s, %s)",
                    (id_gesto, curvas_dump, landmarks_dump),
                )

            alertas = payload["alertas_json"]
            if isinstance(alertas, list) and alertas:
                _insert_alertas(cursor, id_gesto, alertas)

            payload["id_golpeo"] = id_gesto

        # No devolver landmarks_json al caller (puede ser muy grande)
        payload.pop("landmarks_json", None)
        return payload

    # ── Helpers de lectura JSON ─────────────────────────────────
    def _obtener_columna_json(self, id_golpeo: int, columna: str):
        if columna not in {"curvas_json", "landmarks_json"}:
            return None
        with get_connection() as (conn, cursor):
            cursor.execute(
                f"SELECT {columna} FROM gestos_curvas WHERE id_gesto = %s",
                (id_golpeo,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return _parse_json(row.get(columna))

    def obtener_curvas(self, id_golpeo: int) -> dict | None:
        return self._obtener_columna_json(id_golpeo, "curvas_json")

    def obtener_landmarks(self, id_golpeo: int) -> list | None:
        return self._obtener_columna_json(id_golpeo, "landmarks_json")

    def obtener_alertas(self, id_golpeo: int) -> list | None:
        with get_connection() as (conn, cursor):
            cursor.execute(
                "SELECT codigo, severidad, mensaje "
                "FROM gestos_alertas WHERE id_gesto = %s "
                "ORDER BY id_alerta ASC",
                (id_golpeo,),
            )
            rows = cursor.fetchall()
        if not rows:
            return None
        return rows

    # ── Listados ────────────────────────────────────────────────
    def _listar_por_usuario(self, id_usuario: int, orden: str = "DESC") -> list[dict]:
        orden = "ASC" if str(orden).upper() == "ASC" else "DESC"
        with get_connection() as (conn, cursor):
            cursor.execute(
                f"SELECT {_CAMPOS_VGOLPEOS} FROM v_golpeos "
                f"WHERE id_usuario = %s ORDER BY fecha_golpeo {orden}",
                (id_usuario,),
            )
            return cursor.fetchall()

    def obtener_por_usuario_ordenado_asc(self, id_usuario: int) -> list[dict]:
        return self._listar_por_usuario(id_usuario, orden="ASC")

    def obtener_por_usuario(self, id_usuario: int) -> list[dict]:
        return self._listar_por_usuario(id_usuario, orden="DESC")

    def obtener_todos(self) -> list[dict]:
        with get_connection() as (conn, cursor):
            cursor.execute(
                f"SELECT {_CAMPOS_VGOLPEOS} FROM v_golpeos ORDER BY fecha_golpeo DESC"
            )
            return cursor.fetchall()

    def obtener_historial_analitica_usuario(self, id_usuario: int) -> list[dict]:
        """Golpeos de un usuario con datos de alias para analítica avanzada."""
        with get_connection() as (conn, cursor):
            cursor.execute(
                f"SELECT {_CAMPOS_VGOLPEOS} FROM v_golpeos "
                "WHERE id_usuario = %s ORDER BY fecha_golpeo ASC",
                (id_usuario,),
            )
            return cursor.fetchall()

    def obtener_historial_analitica_global(self) -> list[dict]:
        """Todos los golpeos con alias de usuario, para correlaciones y rankings globales."""
        with get_connection() as (conn, cursor):
            cursor.execute(
                f"SELECT {_CAMPOS_VGOLPEOS} FROM v_golpeos ORDER BY fecha_golpeo ASC"
            )
            return cursor.fetchall()

    def obtener_por_id(self, id_golpeo: int) -> dict | None:
        with get_connection() as (conn, cursor):
            cursor.execute(
                f"SELECT {_CAMPOS_VGOLPEOS} FROM v_golpeos WHERE id_golpeo = %s",
                (id_golpeo,),
            )
            return cursor.fetchone()

    def eliminar(self, id_golpeo: int) -> bool:
        # CASCADE limpia gestos_futbol, gestos_curvas, gestos_videos, gestos_alertas.
        with get_connection() as (conn, cursor):
            cursor.execute(
                "DELETE FROM gestos WHERE id_gesto = %s AND modulo = 'futbol'",
                (id_golpeo,),
            )
            return cursor.rowcount > 0

    def actualizar_golpeo(self, id_golpeo: int, campos: dict) -> bool:
        """Actualiza campos editables de un golpeo. Solo permite: pierna_golpeo, metodo_origen."""
        _permitidos = {"pierna_golpeo", "metodo_origen"}
        seguros = {k: v for k, v in campos.items() if k in _permitidos}
        if not seguros:
            return False
        set_clause = ", ".join(f"{col} = %s" for col in seguros)
        valores = list(seguros.values()) + [id_golpeo]
        with get_connection() as (conn, cursor):
            cursor.execute(
                f"UPDATE gestos_futbol SET {set_clause} WHERE id_gesto = %s",
                valores,
            )
            return cursor.rowcount > 0

    # ── Videos (gestos_videos) ──────────────────────────────────
    def obtener_videos_guardados(self, id_usuario: int | None = None) -> list[dict]:
        params: list = []
        where = ["1 = 1"]
        if id_usuario is not None:
            where.append("g.id_usuario = %s")
            params.append(id_usuario)

        sql = (
            "SELECT g.id_golpeo, g.id_usuario, u.alias, u.nombre_completo AS nombre, "
            "g.pierna_golpeo, g.pierna_apoyo, g.angulo_rodilla_deg, "
            "g.angulo_cadera_deg, g.angulo_tobillo_deg, g.confianza, "
            "g.metodo_origen, g.fecha_golpeo, "
            "v.video_nombre, v.video_mime, LENGTH(v.video_blob) AS tamano_bytes "
            "FROM v_golpeos g "
            "INNER JOIN usuarios u      ON u.id_usuario = g.id_usuario "
            "INNER JOIN gestos_videos v ON v.id_gesto   = g.id_golpeo "
            f"WHERE {' AND '.join(where)} "
            "ORDER BY g.fecha_golpeo DESC"
        )
        with get_connection() as (conn, cursor):
            cursor.execute(sql, tuple(params))
            return cursor.fetchall()

    def obtener_video_por_id_golpeo(self, id_golpeo: int) -> dict | None:
        with get_connection() as (conn, cursor):
            cursor.execute(
                "SELECT g.id_golpeo, g.id_usuario, g.fecha_golpeo, "
                "v.video_nombre, v.video_mime, v.video_blob "
                "FROM v_golpeos g "
                "INNER JOIN gestos_videos v ON v.id_gesto = g.id_golpeo "
                "WHERE g.id_golpeo = %s",
                (id_golpeo,),
            )
            return cursor.fetchone()

    def guardar_video_bd(
        self,
        id_golpeo: int,
        video_bytes: bytes,
        video_nombre: str | None,
        video_mime: str | None,
    ) -> bool:
        if not video_bytes:
            return False
        try:
            with get_connection() as (conn, cursor):
                cursor.execute(
                    "INSERT INTO gestos_videos (id_gesto, video_blob, video_nombre, video_mime) "
                    "VALUES (%s, %s, %s, %s) "
                    "ON DUPLICATE KEY UPDATE "
                    "video_blob = VALUES(video_blob), "
                    "video_nombre = VALUES(video_nombre), "
                    "video_mime = VALUES(video_mime)",
                    (id_golpeo, video_bytes, video_nombre, video_mime),
                )
                return True
        except mysql.connector.Error as exc:
            logging.getLogger(__name__).warning("guardar_video_bd fallo: %s", exc)
            return False


# ── Helpers de modulo ──

_PIERNAS_VALIDAS = {"izquierda", "derecha", "desconocida"}


def _enum_pierna(valor) -> str:
    v = str(valor or "desconocida").strip().lower()
    return v if v in _PIERNAS_VALIDAS else "desconocida"


def _safe_int(valor):
    if valor is None:
        return None
    try:
        return int(valor)
    except (TypeError, ValueError):
        return None


def _safe_json_dump(valor):
    if valor is None:
        return None
    try:
        return json.dumps(valor, default=str)
    except (TypeError, ValueError):
        return None


def _parse_json(raw):
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, (bytes, bytearray)):
        try:
            raw = raw.decode("utf-8")
        except Exception:
            return None
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return None
    return None


def _insert_alertas(cursor, id_gesto: int, alertas: list) -> None:
    """Normaliza una lista de alertas en filas de gestos_alertas."""
    severidades_validas = {"baja", "media", "alta"}
    filas: list[tuple] = []
    for a in alertas:
        if not isinstance(a, dict):
            continue
        codigo = str(a.get("codigo") or a.get("code") or "desconocido")[:50]
        severidad = str(a.get("severidad") or a.get("severity") or "media").lower()
        if severidad not in severidades_validas:
            severidad = "media"
        mensaje = str(a.get("mensaje") or a.get("message") or "")
        filas.append((id_gesto, codigo, severidad, mensaje))
    if not filas:
        return
    cursor.executemany(
        "INSERT INTO gestos_alertas (id_gesto, codigo, severidad, mensaje) "
        "VALUES (%s, %s, %s, %s)",
        filas,
    )
