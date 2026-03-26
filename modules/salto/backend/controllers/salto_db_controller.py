"""
CONTROLLER — Endpoints REST para la tabla `saltos`.

Rutas:
    GET    /api/saltos        → Lista todos los saltos
    POST   /api/saltos        → Registra un salto manualmente
    GET    /api/saltos/<id>   → Obtiene un salto
    DELETE /api/saltos/<id>   → Elimina un salto
"""

from flask import Blueprint, jsonify, request
from mysql.connector import IntegrityError

from models.salto_model import SaltoModel
from models.usuario_model import UsuarioModel

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
    tiempo_vuelo_s = data.get("tiempo_vuelo_s")
    confianza_ia = data.get("confianza_ia")

    if tiempo_vuelo_s is not None:
        try:
            tiempo_vuelo_s = float(tiempo_vuelo_s)
        except (ValueError, TypeError):
            return jsonify({"error": "tiempo_vuelo_s debe ser numérico"}), 400

    if confianza_ia is not None:
        try:
            confianza_ia = float(confianza_ia)
            if not (0 <= confianza_ia <= 1):
                raise ValueError
        except (ValueError, TypeError):
            return jsonify({"error": "confianza_ia debe ser un número entre 0 y 1"}), 400

    # Verificar que el usuario existe
    if not _usuario_model.obtener_por_id(id_usuario):
        return jsonify({"error": "El usuario indicado no existe"}), 404

    try:
        nuevo_id = _salto_model.crear(
            id_usuario, tipo_salto, distancia_cm,
            tiempo_vuelo_s, confianza_ia, metodo_origen,
        )
    except IntegrityError as e:
        return jsonify({"error": f"Error de integridad: {e}"}), 409

    return jsonify({"id_salto": nuevo_id, "mensaje": "Salto registrado"}), 201


@saltos_bp.route("/api/saltos/<int:id_salto>", methods=["GET"])
def obtener(id_salto):
    row = _salto_model.obtener_por_id(id_salto)
    if not row:
        return jsonify({"error": "Salto no encontrado"}), 404
    return jsonify(_serializar(row))


@saltos_bp.route("/api/saltos/<int:id_salto>", methods=["DELETE"])
def eliminar(id_salto):
    ok = _salto_model.eliminar(id_salto)
    if not ok:
        return jsonify({"error": "Salto no encontrado"}), 404
    return jsonify({"mensaje": "Salto eliminado"})
