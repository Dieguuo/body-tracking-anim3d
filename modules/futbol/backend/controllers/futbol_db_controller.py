"""
CONTROLADOR — Endpoints REST para golpes de futbol y biblioteca de videos.

Rutas:
    GET    /api/golpeos        -> Lista todos los golpeos
    POST   /api/futbol/guardar -> Registra un golpeo manualmente
    GET    /api/golpeos/<id>   -> Obtiene un golpeo
    DELETE /api/golpeos/<id>   -> Elimina un golpeo
    GET    /api/futbol/usuario/<id> -> Golpeos de un usuario
    GET    /api/videos         -> Biblioteca de videos guardados
    GET    /api/videos/<id>/stream -> Streaming de video guardado
"""

import logging

from flask import Blueprint, Response, jsonify, request
from mysql.connector import IntegrityError

from models.futbol_model import FutbolModel
from models.usuario_model import UsuarioModel
from services.video_library_service import clasificar_videos
from utils.serializers import serializar_row as _serializar

logger = logging.getLogger(__name__)

futbol_db_bp = Blueprint("futbol_db", __name__)
modelo = FutbolModel()
usuario_model = UsuarioModel()


def _parse_range_header(range_header: str, total_size: int) -> tuple[int, int] | None:
    if not range_header or not range_header.startswith("bytes="):
        return None

    raw = range_header.replace("bytes=", "", 1).strip()
    if "-" not in raw:
        return None

    start_s, end_s = raw.split("-", 1)
    try:
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else (total_size - 1)
    except ValueError:
        return None

    if start < 0:
        start = 0
    if end >= total_size:
        end = total_size - 1
    if start > end:
        return None

    return start, end


@futbol_db_bp.route("/api/futbol/guardar", methods=["POST"])
# Guarda un golpeo en la base de datos desde un payload JSON.
def guardar_golpeo():
    data = request.get_json(silent=True) or {}
    id_usuario = data.get("id_usuario")
    if not id_usuario:
        return jsonify({"error": "id_usuario es obligatorio"}), 400

    try:
        id_usuario_int = int(id_usuario)
    except (ValueError, TypeError):
        return jsonify({"error": "id_usuario debe ser un entero"}), 400

    if not usuario_model.obtener_por_id(id_usuario_int):
        logger.warning("[GOLPEO] Guardado fallido: id_usuario=%s no encontrado", id_usuario_int)
        return jsonify({"error": "Usuario no encontrado"}), 404

    metodo_origen = (data.get("metodo_origen") or "video_galeria").strip().lower()
    if metodo_origen not in {"ia_vivo", "video_galeria"}:
        metodo_origen = "video_galeria"

    try:
        payload = modelo.guardar_golpeo(id_usuario_int, data, metodo_origen=metodo_origen)
        logger.info("[GOLPEO] Guardado: id_golpeo=%s id_usuario=%s metodo=%s",
                    payload.get("id_golpeo"), id_usuario_int, metodo_origen)
        return jsonify(_serializar(payload)), 201
    except IntegrityError:
        logger.error("[GOLPEO] Integridad BD al guardar golpeo para id_usuario=%s", id_usuario_int)
        return jsonify({"error": "Error de integridad en la base de datos"}), 409
    except Exception:
        logger.exception("[GOLPEO] Error inesperado al guardar golpeo para id_usuario=%s", id_usuario_int)
        return jsonify({"error": "No se pudo guardar el golpeo"}), 500


@futbol_db_bp.route("/api/futbol/usuario/<int:id_usuario>", methods=["GET"])
# Devuelve el historial de golpes de un usuario.
def obtener_golpeos(id_usuario: int):
    try:
        golpes = modelo.obtener_por_usuario(id_usuario)
        return jsonify([_serializar(g) for g in golpes]), 200
    except Exception:
        return jsonify({"error": "No se pudieron cargar los golpes"}), 500


@futbol_db_bp.route("/api/golpeos", methods=["GET"])
def listar():
    rows = modelo.obtener_todos()
    return jsonify([_serializar(r) for r in rows])


@futbol_db_bp.route("/api/golpeos/<int:id_golpeo>", methods=["GET"])
def obtener(id_golpeo: int):
    row = modelo.obtener_por_id(id_golpeo)
    if not row:
        return jsonify({"error": "Golpeo no encontrado"}), 404
    return jsonify(_serializar(row))


@futbol_db_bp.route("/api/golpeos/<int:id_golpeo>", methods=["DELETE"])
def eliminar(id_golpeo: int):
    ok = modelo.eliminar(id_golpeo)
    if not ok:
        logger.warning("[GOLPEO] Eliminacion fallida: id_golpeo=%s no encontrado", id_golpeo)
        return jsonify({"error": "Golpeo no encontrado"}), 404
    logger.info("[GOLPEO] Eliminacion: id_golpeo=%s", id_golpeo)
    return jsonify({"mensaje": "Golpeo eliminado"})


@futbol_db_bp.route("/api/golpeos/<int:id_golpeo>", methods=["PUT"])
def actualizar_golpeo(id_golpeo: int):
    """Actualiza campos editables de un golpeo existente (notas, metadatos)."""
    row = modelo.obtener_por_id(id_golpeo)
    if not row:
        return jsonify({"error": "Golpeo no encontrado"}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Se esperaba JSON en el body"}), 400

    campos_permitidos = {"pierna_golpeo", "metodo_origen"}
    actualizacion = {k: v for k, v in data.items() if k in campos_permitidos}
    if not actualizacion:
        return jsonify({"error": f"Ningún campo editable. Permitidos: {sorted(campos_permitidos)}"}), 400

    try:
        ok = modelo.actualizar_golpeo(id_golpeo, actualizacion)
    except Exception:
        logger.exception("[GOLPEO] Error al actualizar id_golpeo=%s", id_golpeo)
        return jsonify({"error": "No se pudo actualizar el golpeo"}), 500

    if not ok:
        return jsonify({"error": "No se pudo actualizar el golpeo"}), 500

    logger.info("[GOLPEO] Actualizacion: id_golpeo=%s campos=%s", id_golpeo, list(actualizacion.keys()))
    return jsonify({"mensaje": "Golpeo actualizado"})


@futbol_db_bp.route("/api/videos", methods=["GET"])
def listar_videos_guardados():
    id_usuario = request.args.get("id_usuario")

    id_usuario_int = None
    if id_usuario:
        try:
            id_usuario_int = int(id_usuario)
        except ValueError:
            return jsonify({"error": "id_usuario debe ser un entero"}), 400

        if not usuario_model.obtener_por_id(id_usuario_int):
            return jsonify({"error": "Usuario no encontrado"}), 404

    videos = modelo.obtener_videos_guardados(id_usuario=id_usuario_int)
    clasificados = clasificar_videos(videos)

    return jsonify({
        "filtro": {
            "id_usuario": id_usuario_int,
        },
        "totales": {
            "videos": len(videos),
            "individuales": len(clasificados["individuales"]),
            "comparativas": len(clasificados["comparativas"]),
        },
        **clasificados,
    })


@futbol_db_bp.route("/api/videos/<int:id_golpeo>/stream", methods=["GET"])
def stream_video_guardado(id_golpeo: int):
    row = modelo.obtener_video_por_id_golpeo(id_golpeo)
    if not row:
        return jsonify({"error": "Video no encontrado"}), 404

    video_bytes = row.get("video_blob")
    if not video_bytes:
        return jsonify({"error": "El golpeo no tiene video almacenado"}), 404

    mime = row.get("video_mime") or "video/mp4"
    nombre = row.get("video_nombre") or f"golpeo_{id_golpeo}.mp4"

    total = len(video_bytes)
    range_header = request.headers.get("Range", "")
    parsed = _parse_range_header(range_header, total)

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{nombre}"',
    }

    if parsed is None:
        headers["Content-Length"] = str(total)
        return Response(video_bytes, status=200, mimetype=mime, headers=headers)

    start, end = parsed
    chunk = video_bytes[start:end + 1]
    headers["Content-Range"] = f"bytes {start}-{end}/{total}"
    headers["Content-Length"] = str(len(chunk))
    return Response(chunk, status=206, mimetype=mime, headers=headers)
