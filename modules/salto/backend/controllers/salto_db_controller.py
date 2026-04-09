"""
CONTROLADOR — Endpoints REST para la tabla `saltos`.

Rutas:
    GET    /api/saltos        → Lista todos los saltos
    POST   /api/saltos        → Registra un salto manualmente
    GET    /api/saltos/<id>   → Obtiene un salto
    PUT    /api/saltos/<id>   → Actualiza un salto
    DELETE /api/saltos/<id>   → Elimina un salto
    GET    /api/videos        → Biblioteca de vídeos guardados
    GET    /api/videos/<id>/stream → Streaming de vídeo guardado
"""

from flask import Blueprint, Response, jsonify, request
from mysql.connector import IntegrityError

from models.salto_model import SaltoModel
from models.usuario_model import UsuarioModel
from services.video_library_service import clasificar_videos

saltos_bp = Blueprint("saltos_db", __name__)

_salto_model = SaltoModel()
_usuario_model = UsuarioModel()

TIPOS_SALTO_VALIDOS = {"vertical", "horizontal"}
METODOS_VALIDOS = {"ia_vivo", "video_galeria", "sensor_arduino"}


def _serializar(row: dict) -> dict:
    """Convierte Decimal/datetime a tipos serializables JSON."""
    out = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        elif hasattr(v, "__float__"):
            out[k] = float(v)
        else:
            out[k] = v
    return out


def _float_optional(data: dict, key: str) -> float | None:
    value = data.get(key)
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        raise ValueError(key)


def _parse_range_header(range_header: str, total_size: int) -> tuple[int, int] | None:
    """Parsea el header Range para permitir seek en el reproductor HTML5."""
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


@saltos_bp.route("/api/saltos", methods=["GET"])
def listar():
    rows = _salto_model.obtener_todos()
    return jsonify([_serializar(r) for r in rows])


@saltos_bp.route("/api/saltos", methods=["POST"])
def crear():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Se esperaba JSON en el body"}), 400

    id_usuario = data.get("id_usuario")
    tipo_salto = (data.get("tipo_salto") or "").strip().lower()
    distancia_cm = data.get("distancia_cm")
    metodo_origen = (data.get("metodo_origen") or "").strip().lower()

    # Validaciones
    if id_usuario is None or distancia_cm is None:
        return jsonify({"error": "Campos obligatorios: id_usuario, tipo_salto, distancia_cm, metodo_origen"}), 400

    if tipo_salto not in TIPOS_SALTO_VALIDOS:
        return jsonify({"error": f"tipo_salto debe ser: {', '.join(TIPOS_SALTO_VALIDOS)}"}), 400

    if metodo_origen not in METODOS_VALIDOS:
        return jsonify({"error": f"metodo_origen debe ser: {', '.join(METODOS_VALIDOS)}"}), 400

    try:
        distancia_cm = int(distancia_cm)
        if distancia_cm < 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({"error": "distancia_cm debe ser un entero >= 0"}), 400

    try:
        id_usuario = int(id_usuario)
    except (ValueError, TypeError):
        return jsonify({"error": "id_usuario debe ser un entero"}), 400

    # Campos opcionales
    try:
        tiempo_vuelo_s = _float_optional(data, "tiempo_vuelo_s")
        confianza_ia = _float_optional(data, "confianza_ia")
        potencia_w = _float_optional(data, "potencia_w")
        asimetria_pct = _float_optional(data, "asimetria_pct")
        angulo_rodilla_deg = _float_optional(data, "angulo_rodilla_deg")
        angulo_cadera_deg = _float_optional(data, "angulo_cadera_deg")
        estabilidad_aterrizaje = _float_optional(data, "estabilidad_aterrizaje")
    except ValueError as exc:
        return jsonify({"error": f"{str(exc)} debe ser numérico"}), 400

    if confianza_ia is not None and not (0 <= confianza_ia <= 1):
        return jsonify({"error": "confianza_ia debe ser un número entre 0 y 1"}), 400

    # Verificar que el usuario existe
    if not _usuario_model.obtener_por_id(id_usuario):
        return jsonify({"error": "El usuario indicado no existe"}), 404

    try:
        nuevo_id = _salto_model.crear(
            id_usuario, tipo_salto, distancia_cm,
            tiempo_vuelo_s, confianza_ia, metodo_origen,
            potencia_w=potencia_w,
            asimetria_pct=asimetria_pct,
            angulo_rodilla_deg=angulo_rodilla_deg,
            angulo_cadera_deg=angulo_cadera_deg,
            estabilidad_aterrizaje=estabilidad_aterrizaje,
        )
    except IntegrityError:
        return jsonify({"error": "Error de integridad: el usuario indicado no existe o hay un conflicto de datos"}), 409

    return jsonify({"id_salto": nuevo_id, "mensaje": "Salto registrado"}), 201


@saltos_bp.route("/api/saltos/<int:id_salto>", methods=["GET"])
def obtener(id_salto):
    row = _salto_model.obtener_por_id(id_salto)
    if not row:
        return jsonify({"error": "Salto no encontrado"}), 404
    return jsonify(_serializar(row))


@saltos_bp.route("/api/saltos/<int:id_salto>", methods=["PUT"])
def actualizar(id_salto):
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Se esperaba JSON en el body"}), 400

    tipo_salto = (data.get("tipo_salto") or "").strip().lower()
    distancia_cm = data.get("distancia_cm")
    metodo_origen = (data.get("metodo_origen") or "").strip().lower()

    if distancia_cm is None:
        return jsonify({"error": "Campos obligatorios: tipo_salto, distancia_cm, metodo_origen"}), 400

    if tipo_salto not in TIPOS_SALTO_VALIDOS:
        return jsonify({"error": f"tipo_salto debe ser: {', '.join(TIPOS_SALTO_VALIDOS)}"}), 400

    if metodo_origen not in METODOS_VALIDOS:
        return jsonify({"error": f"metodo_origen debe ser: {', '.join(METODOS_VALIDOS)}"}), 400

    try:
        distancia_cm = int(distancia_cm)
        if distancia_cm < 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({"error": "distancia_cm debe ser un entero >= 0"}), 400

    try:
        tiempo_vuelo_s = _float_optional(data, "tiempo_vuelo_s")
        confianza_ia = _float_optional(data, "confianza_ia")
        potencia_w = _float_optional(data, "potencia_w")
        asimetria_pct = _float_optional(data, "asimetria_pct")
        angulo_rodilla_deg = _float_optional(data, "angulo_rodilla_deg")
        angulo_cadera_deg = _float_optional(data, "angulo_cadera_deg")
        estabilidad_aterrizaje = _float_optional(data, "estabilidad_aterrizaje")
    except ValueError as exc:
        return jsonify({"error": f"{str(exc)} debe ser numérico"}), 400

    if confianza_ia is not None and not (0 <= confianza_ia <= 1):
        return jsonify({"error": "confianza_ia debe ser un número entre 0 y 1"}), 400

    ok = _salto_model.actualizar(
        id_salto, tipo_salto, distancia_cm,
        tiempo_vuelo_s, confianza_ia, metodo_origen,
        potencia_w=potencia_w,
        asimetria_pct=asimetria_pct,
        angulo_rodilla_deg=angulo_rodilla_deg,
        angulo_cadera_deg=angulo_cadera_deg,
        estabilidad_aterrizaje=estabilidad_aterrizaje,
    )
    if not ok:
        return jsonify({"error": "Salto no encontrado"}), 404
    return jsonify({"mensaje": "Salto actualizado"})


@saltos_bp.route("/api/saltos/<int:id_salto>", methods=["DELETE"])
def eliminar(id_salto):
    ok = _salto_model.eliminar(id_salto)
    if not ok:
        return jsonify({"error": "Salto no encontrado"}), 404
    return jsonify({"mensaje": "Salto eliminado"})


@saltos_bp.route("/api/videos", methods=["GET"])
def listar_videos_guardados():
    id_usuario = request.args.get("id_usuario")
    tipo = (request.args.get("tipo") or "").strip().lower() or None

    if tipo and tipo not in TIPOS_SALTO_VALIDOS:
        return jsonify({"error": f"tipo debe ser: {', '.join(sorted(TIPOS_SALTO_VALIDOS))}"}), 400

    id_usuario_int = None
    if id_usuario:
        try:
            id_usuario_int = int(id_usuario)
        except ValueError:
            return jsonify({"error": "id_usuario debe ser un entero"}), 400

        if not _usuario_model.obtener_por_id(id_usuario_int):
            return jsonify({"error": "Usuario no encontrado"}), 404

    videos = _salto_model.obtener_videos_guardados(id_usuario=id_usuario_int, tipo_salto=tipo)
    clasificados = clasificar_videos(videos)

    return jsonify({
        "filtro": {
            "id_usuario": id_usuario_int,
            "tipo": tipo,
        },
        "totales": {
            "videos": len(videos),
            "individuales": len(clasificados["individuales"]),
            "comparativas": len(clasificados["comparativas"]),
        },
        **clasificados,
    })


@saltos_bp.route("/api/videos/<int:id_salto>/stream", methods=["GET"])
def stream_video_guardado(id_salto):
    row = _salto_model.obtener_video_por_id_salto(id_salto)
    if not row:
        return jsonify({"error": "Vídeo no encontrado"}), 404

    video_bytes = row.get("video_blob")
    if not video_bytes:
        return jsonify({"error": "El salto no tiene vídeo almacenado"}), 404

    mime = row.get("video_mime") or "video/mp4"
    nombre = row.get("video_nombre") or f"salto_{id_salto}.mp4"

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
