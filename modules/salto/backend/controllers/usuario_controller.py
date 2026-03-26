"""
CONTROLLER — Endpoints REST para la tabla `usuarios`.

Rutas:
    GET    /api/usuarios                  → Lista todos los usuarios
    POST   /api/usuarios                  → Crea un usuario
    GET    /api/usuarios/<id>             → Obtiene un usuario
    PUT    /api/usuarios/<id>             → Actualiza un usuario
    DELETE /api/usuarios/<id>             → Elimina un usuario
    GET    /api/usuarios/<id>/saltos      → Saltos de un usuario
    GET    /api/usuarios/<id>/progreso    → Progreso (mínimo 4+4)
    GET    /api/usuarios/<id>/comparativa → Comparativa intra-usuario
"""

from flask import Blueprint, jsonify, request
from mysql.connector import IntegrityError

from models.usuario_model import UsuarioModel
from models.salto_model import SaltoModel
from services.comparativa_service import calcular_progreso, calcular_comparativa

usuarios_bp = Blueprint("usuarios", __name__)

_usuario_model = UsuarioModel()
_salto_model = SaltoModel()


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


@usuarios_bp.route("/api/usuarios", methods=["GET"])
def listar():
    paginado = request.args.get("paginado", "0").strip() == "1"
    search = (request.args.get("search") or "").strip()

    if not paginado:
        rows = _usuario_model.obtener_todos()
        return jsonify([_serializar(r) for r in rows])

    try:
        limit = int(request.args.get("limit", 20))
        offset = int(request.args.get("offset", 0))
    except ValueError:
        return jsonify({"error": "limit y offset deben ser enteros"}), 400

    if limit <= 0 or limit > 100:
        return jsonify({"error": "limit debe estar entre 1 y 100"}), 400
    if offset < 0:
        return jsonify({"error": "offset debe ser >= 0"}), 400

    rows = _usuario_model.obtener_paginados(search=search or None, limit=limit, offset=offset)
    total = _usuario_model.contar(search=search or None)

    return jsonify({
        "items": [_serializar(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + len(rows)) < total,
    })


@usuarios_bp.route("/api/usuarios", methods=["POST"])
def crear():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Se esperaba JSON en el body"}), 400

    alias = (data.get("alias") or "").strip()
    nombre = (data.get("nombre_completo") or "").strip()
    altura_str = data.get("altura_m")

    if not alias or not nombre or altura_str is None:
        return jsonify({"error": "Campos obligatorios: alias, nombre_completo, altura_m"}), 400

    try:
        altura = float(altura_str)
        if altura <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({"error": "altura_m debe ser un número positivo"}), 400

    try:
        nuevo_id = _usuario_model.crear(alias, nombre, altura)
    except IntegrityError:
        return jsonify({"error": f"El alias '{alias}' ya existe"}), 409

    return jsonify({"id_usuario": nuevo_id, "mensaje": "Usuario creado"}), 201


@usuarios_bp.route("/api/usuarios/<int:id_usuario>", methods=["GET"])
def obtener(id_usuario):
    row = _usuario_model.obtener_por_id(id_usuario)
    if not row:
        return jsonify({"error": "Usuario no encontrado"}), 404
    return jsonify(_serializar(row))


@usuarios_bp.route("/api/usuarios/<int:id_usuario>", methods=["PUT"])
def actualizar(id_usuario):
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Se esperaba JSON en el body"}), 400

    alias = (data.get("alias") or "").strip()
    nombre = (data.get("nombre_completo") or "").strip()
    altura_str = data.get("altura_m")

    if not alias or not nombre or altura_str is None:
        return jsonify({"error": "Campos obligatorios: alias, nombre_completo, altura_m"}), 400

    try:
        altura = float(altura_str)
        if altura <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({"error": "altura_m debe ser un número positivo"}), 400

    try:
        ok = _usuario_model.actualizar(id_usuario, alias, nombre, altura)
    except IntegrityError:
        return jsonify({"error": f"El alias '{alias}' ya existe"}), 409

    if not ok:
        return jsonify({"error": "Usuario no encontrado"}), 404
    return jsonify({"mensaje": "Usuario actualizado"})


@usuarios_bp.route("/api/usuarios/<int:id_usuario>", methods=["DELETE"])
def eliminar(id_usuario):
    ok = _usuario_model.eliminar(id_usuario)
    if not ok:
        return jsonify({"error": "Usuario no encontrado"}), 404
    return jsonify({"mensaje": "Usuario eliminado"})


@usuarios_bp.route("/api/usuarios/<int:id_usuario>/saltos", methods=["GET"])
def saltos_de_usuario(id_usuario):
    # Verificar que el usuario existe
    if not _usuario_model.obtener_por_id(id_usuario):
        return jsonify({"error": "Usuario no encontrado"}), 404
    rows = _salto_model.obtener_por_usuario(id_usuario)
    return jsonify([_serializar(r) for r in rows])


@usuarios_bp.route("/api/usuarios/<int:id_usuario>/progreso", methods=["GET"])
def progreso(id_usuario):
    usuario = _usuario_model.obtener_por_id(id_usuario)
    if not usuario:
        return jsonify({"error": "Usuario no encontrado"}), 404

    conteo = _salto_model.contar_por_tipo(id_usuario)
    resultado = calcular_progreso(conteo, usuario["alias"], id_usuario)
    return jsonify(resultado)


@usuarios_bp.route("/api/usuarios/<int:id_usuario>/comparativa", methods=["GET"])
def comparativa(id_usuario):
    usuario = _usuario_model.obtener_por_id(id_usuario)
    if not usuario:
        return jsonify({"error": "Usuario no encontrado"}), 404

    saltos_v = _salto_model.obtener_por_usuario_y_tipo(id_usuario, "vertical")
    saltos_h = _salto_model.obtener_por_usuario_y_tipo(id_usuario, "horizontal")

    resultado = calcular_comparativa(saltos_v, saltos_h)
    if resultado is None:
        conteo = _salto_model.contar_por_tipo(id_usuario)
        return jsonify({
            "error": "No se cumple el mínimo de saltos para la comparativa",
            "saltos_verticales": conteo["vertical"],
            "saltos_horizontales": conteo["horizontal"],
            "minimo_requerido": 4,
        }), 403

    return jsonify(resultado)
