"""
Controlador para la gestion de usuarios del modulo de futbol.

DEPRECATED: Estas rutas se mantendrán hasta 2026-08-01.
Usar en su lugar: /api/usuarios (controllers/usuario_controller.py)
"""

import logging
from flask import Blueprint, jsonify, request
from mysql.connector import IntegrityError
from models.usuarios_futbol_model import UsuariosFutbolModel

usuarios_futbol_bp = Blueprint("usuarios_futbol_bp", __name__)
modelo = UsuariosFutbolModel()
logger = logging.getLogger(__name__)

# Cabeceras de deprecación (consistente con app.py)
_DEPRECATION_HEADERS = {
    "Deprecation": "version=\"2026-08-01\"",
    "Sunset": "Sat, 01 Aug 2026 00:00:00 GMT",
    "Link": '</api/usuarios>; rel="successor-version"',
}


def _legacy_response(data, status=200):
    """Envuelve una respuesta JSON añadiendo cabeceras de deprecación."""
    resp = jsonify(data)
    resp.status_code = status
    for k, v in _DEPRECATION_HEADERS.items():
        resp.headers[k] = v
    return resp


def _validar_altura(raw):
    """Devuelve (altura_float, None) o (None, error_msg)."""
    if raw is None or str(raw).strip() == "":
        return None, "La altura (altura_m) es obligatoria"
    try:
        altura = float(raw)
    except (TypeError, ValueError):
        return None, "altura_m debe ser un numero valido"
    if not (0.50 <= altura <= 2.50):
        return None, "altura_m debe estar entre 0.50 y 2.50 metros"
    return altura, None


def _validar_peso(raw):
    """Devuelve (peso_float|None, None) o (None, error_msg). raw=None se acepta como opcional."""
    if raw is None or str(raw).strip() == "":
        return None, None
    try:
        peso = float(raw)
    except (TypeError, ValueError):
        return None, "peso_kg debe ser un numero valido"
    if not (20 <= peso <= 300):
        return None, "peso_kg debe estar entre 20 y 300 kg"
    return peso, None


@usuarios_futbol_bp.route("/api/usuarios_futbol", methods=["GET"])
def get_usuarios():
    paginado = request.args.get("paginado", "false").lower() in {"true", "1"}
    search = request.args.get("search", None)

    if not paginado:
        usuarios = modelo.obtener_todos(False, search)
        return _legacy_response({
            "usuarios": usuarios,
            "items": usuarios,
        })

    try:
        limit = int(request.args.get("limit", 20))
        offset = int(request.args.get("offset", 0))
    except (TypeError, ValueError):
        return _legacy_response({"error": "limit y offset deben ser enteros"}, 400)

    if limit <= 0 or limit > 100:
        return _legacy_response({"error": "limit debe estar entre 1 y 100"}, 400)
    if offset < 0:
        return _legacy_response({"error": "offset debe ser >= 0"}, 400)

    usuarios = modelo.obtener_todos(True, search, limit, offset)
    total = modelo.contar_total(search)
    has_more = (offset + len(usuarios)) < total

    # Respuesta alineada con contrato canónico (items + has_more)
    # Mantener "usuarios" por compatibilidad con clientes legacy
    return _legacy_response({
        "usuarios": usuarios,
        "items": usuarios,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": has_more,
    })


@usuarios_futbol_bp.route("/api/usuarios_futbol/<int:id_usuario>", methods=["GET"])
def get_usuario(id_usuario):
    usuario = modelo.obtener_por_id(id_usuario)
    if usuario:
        return _legacy_response(usuario)
    return _legacy_response({"error": "Usuario no encontrado"}, 404)


@usuarios_futbol_bp.route("/api/usuarios_futbol", methods=["POST"])
def create_usuario():
    data = request.get_json(silent=True)
    if not data or not data.get("alias") or not (data.get("nombre") or data.get("nombre_completo")):
        logger.warning("[USUARIOS_FUTBOL] POST: datos incompletos")
        return _legacy_response({"error": "Datos incompletos (alias y nombre obligatorios)"}, 400)

    altura, err = _validar_altura(data.get("altura_m"))
    if err:
        return _legacy_response({"error": err}, 400)
    data["altura_m"] = altura

    if "peso_kg" in data:
        peso, err = _validar_peso(data.get("peso_kg"))
        if err:
            return _legacy_response({"error": err}, 400)
        data["peso_kg"] = peso

    try:
        nuevo_id = modelo.crear(data)
    except IntegrityError:
        alias = data.get("alias")
        logger.warning("[USUARIOS_FUTBOL] POST: alias duplicado alias=%s", alias)
        return _legacy_response({"error": f"El alias '{alias}' ya existe"}, 409)
    except Exception as e:
        logger.error("[USUARIOS_FUTBOL] POST: error creando usuario alias=%s: %s", data.get("alias"), e, exc_info=True)
        return _legacy_response({"error": "No se pudo crear el usuario"}, 500)

    if nuevo_id:
        logger.info("[USUARIOS_FUTBOL] POST: usuario creado id=%s alias=%s", nuevo_id, data.get("alias"))
        return _legacy_response({"id_usuario": nuevo_id}, 201)
    return _legacy_response({"error": "No se pudo crear el usuario"}, 500)


@usuarios_futbol_bp.route("/api/usuarios_futbol/<int:id_usuario>", methods=["PUT"])
def update_usuario(id_usuario):
    data = request.get_json(silent=True)
    if not data:
        return _legacy_response({"error": "Datos incompletos"}, 400)

    if "altura_m" in data:
        altura, err = _validar_altura(data.get("altura_m"))
        if err:
            return _legacy_response({"error": err}, 400)
        data["altura_m"] = altura

    if "peso_kg" in data:
        peso, err = _validar_peso(data.get("peso_kg"))
        if err:
            return _legacy_response({"error": err}, 400)
        data["peso_kg"] = peso

    try:
        filas_afectadas = modelo.actualizar(id_usuario, data)
    except IntegrityError:
        alias = data.get("alias")
        logger.warning("[USUARIOS_FUTBOL] PUT id=%s: alias duplicado alias=%s", id_usuario, alias)
        return _legacy_response({"error": f"El alias '{alias}' ya existe"}, 409)
    except Exception as e:
        logger.error("[USUARIOS_FUTBOL] PUT id=%s: error actualizando: %s", id_usuario, e, exc_info=True)
        return _legacy_response({"error": "No se pudo actualizar el usuario"}, 500)

    if filas_afectadas > 0:
        logger.info("[USUARIOS_FUTBOL] PUT: usuario actualizado id=%s", id_usuario)
        return _legacy_response({"mensaje": "Usuario actualizado"}, 200)
    return _legacy_response({"error": "No se pudo actualizar o no hubo cambios"}, 404)


@usuarios_futbol_bp.route("/api/usuarios_futbol/<int:id_usuario>", methods=["DELETE"])
def delete_usuario(id_usuario):
    try:
        filas_afectadas = modelo.eliminar(id_usuario)
    except Exception as e:
        logger.error("[USUARIOS_FUTBOL] DELETE id=%s: error eliminando: %s", id_usuario, e, exc_info=True)
        return _legacy_response({"error": "No se pudo eliminar el usuario"}, 500)

    if filas_afectadas > 0:
        logger.info("[USUARIOS_FUTBOL] DELETE: usuario eliminado id=%s", id_usuario)
        return _legacy_response({"mensaje": "Usuario eliminado"}, 200)
    return _legacy_response({"error": "Usuario no encontrado"}, 404)
