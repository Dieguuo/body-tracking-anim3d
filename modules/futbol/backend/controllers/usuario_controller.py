"""
CONTROLADOR — Endpoints REST para la tabla `usuarios` (modulo futbol).

Rutas:
    GET    /api/usuarios              -> Lista todos los usuarios
    POST   /api/usuarios              -> Crea un usuario
    GET    /api/usuarios/<id>         -> Obtiene un usuario
    PUT    /api/usuarios/<id>         -> Actualiza un usuario
    DELETE /api/usuarios/<id>         -> Elimina un usuario
    GET    /api/usuarios/<id>/golpeos -> Golpeos de un usuario
"""

import logging

from flask import Blueprint, jsonify, request
from mysql.connector import IntegrityError

from models.usuario_model import UsuarioModel
from models.futbol_model import FutbolModel
from services.analitica_service import (
    calcular_fatiga_intra_sesion,
    calcular_tendencia,
    calcular_comparativa,
    calcular_alertas_tendencia,
    calcular_analitica_avanzada,
    ranking_mejores_sesiones,
)
from utils.serializers import serializar_row as _serializar

logger = logging.getLogger(__name__)

usuarios_bp = Blueprint("usuarios_futbol", __name__)

_usuario_model = UsuarioModel()
_golpeo_model = FutbolModel()


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

    alias = (data.get("alias") or "").strip()[:50]
    nombre = (data.get("nombre_completo") or "").strip()[:120]
    altura_str = data.get("altura_m")

    if not alias or not nombre or altura_str is None:
        return jsonify({"error": "Campos obligatorios: alias, nombre_completo, altura_m"}), 400

    try:
        altura = float(altura_str)
        if not (0.50 <= altura <= 2.50):
            return jsonify({"error": "altura_m debe estar entre 0.50 y 2.50 metros"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "altura_m debe ser un numero valido"}), 400

    peso_kg = None
    peso_str = data.get("peso_kg")
    if peso_str is not None:
        try:
            peso_kg = float(peso_str)
            if not (20 <= peso_kg <= 300):
                return jsonify({"error": "peso_kg debe estar entre 20 y 300 kg"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "peso_kg debe ser un numero valido"}), 400

    try:
        nuevo_id = _usuario_model.crear(alias, nombre, altura, peso_kg)
    except IntegrityError:
        logger.warning("[USUARIO] Alias duplicado en alta: alias=%s", alias)
        return jsonify({"error": f"El alias '{alias}' ya existe"}), 409

    logger.info("[USUARIO] Alta: id=%s alias=%s altura_m=%s", nuevo_id, alias, altura)
    return jsonify({"id_usuario": nuevo_id, "mensaje": "Usuario creado"}), 201


@usuarios_bp.route("/api/usuarios/<int:id_usuario>", methods=["GET"])
def obtener(id_usuario: int):
    row = _usuario_model.obtener_por_id(id_usuario)
    if not row:
        return jsonify({"error": "Usuario no encontrado"}), 404
    return jsonify(_serializar(row))


@usuarios_bp.route("/api/usuarios/<int:id_usuario>", methods=["PUT"])
def actualizar(id_usuario: int):
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Se esperaba JSON en el body"}), 400

    alias = (data.get("alias") or "").strip()[:50]
    nombre = (data.get("nombre_completo") or "").strip()[:120]
    altura_str = data.get("altura_m")

    if not alias or not nombre or altura_str is None:
        return jsonify({"error": "Campos obligatorios: alias, nombre_completo, altura_m"}), 400

    try:
        altura = float(altura_str)
        if not (0.50 <= altura <= 2.50):
            return jsonify({"error": "altura_m debe estar entre 0.50 y 2.50 metros"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "altura_m debe ser un numero valido"}), 400

    peso_kg = None
    peso_str = data.get("peso_kg")
    if peso_str is not None:
        try:
            peso_kg = float(peso_str)
            if not (20 <= peso_kg <= 300):
                return jsonify({"error": "peso_kg debe estar entre 20 y 300 kg"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "peso_kg debe ser un numero valido"}), 400

    try:
        ok = _usuario_model.actualizar(id_usuario, alias, nombre, altura, peso_kg)
    except IntegrityError:
        logger.warning("[USUARIO] Alias duplicado en edicion: id=%s alias=%s", id_usuario, alias)
        return jsonify({"error": f"El alias '{alias}' ya existe"}), 409

    if not ok:
        logger.warning("[USUARIO] Edicion fallida: id=%s no encontrado", id_usuario)
        return jsonify({"error": "Usuario no encontrado"}), 404
    logger.info("[USUARIO] Edicion: id=%s alias=%s altura_m=%s", id_usuario, alias, altura)
    return jsonify({"mensaje": "Usuario actualizado"})


@usuarios_bp.route("/api/usuarios/<int:id_usuario>", methods=["DELETE"])
def eliminar(id_usuario: int):
    ok = _usuario_model.eliminar(id_usuario)
    if not ok:
        logger.warning("[USUARIO] Eliminacion fallida: id=%s no encontrado", id_usuario)
        return jsonify({"error": "Usuario no encontrado"}), 404
    logger.info("[USUARIO] Eliminacion: id=%s", id_usuario)
    return jsonify({"mensaje": "Usuario eliminado"})


@usuarios_bp.route("/api/usuarios/<int:id_usuario>/golpeos", methods=["GET"])
def golpeos_de_usuario(id_usuario: int):
    if not _usuario_model.obtener_por_id(id_usuario):
        return jsonify({"error": "Usuario no encontrado"}), 404
    rows = _golpeo_model.obtener_por_usuario(id_usuario)
    return jsonify([_serializar(r) for r in rows])


# ─────────────────────────────────────────────────────────────
# Analítica de usuario
# ─────────────────────────────────────────────────────────────

def _golpeos_usuario(id_usuario: int, orden: str = "DESC") -> list[dict]:
    if orden.upper() == "ASC":
        golpeos = _golpeo_model.obtener_por_usuario_ordenado_asc(id_usuario)
    else:
        golpeos = _golpeo_model.obtener_por_usuario(id_usuario)
    return [_serializar(g) for g in golpeos]


@usuarios_bp.route("/api/usuarios/<int:id_usuario>/fatiga", methods=["GET"])
def fatiga_usuario(id_usuario: int):
    if not _usuario_model.obtener_por_id(id_usuario):
        return jsonify({"error": "Usuario no encontrado"}), 404
    metrica = (request.args.get("metrica") or "velocidad_pie_ms").strip()
    return jsonify(calcular_fatiga_intra_sesion(_golpeos_usuario(id_usuario, "ASC"), metrica=metrica))


@usuarios_bp.route("/api/usuarios/<int:id_usuario>/tendencia", methods=["GET"])
def tendencia_usuario(id_usuario: int):
    if not _usuario_model.obtener_por_id(id_usuario):
        return jsonify({"error": "Usuario no encontrado"}), 404
    metrica = (request.args.get("metrica") or "velocidad_pie_ms").strip()
    try:
        semanas = float(request.args.get("semanas", "4"))
    except (TypeError, ValueError):
        semanas = 4.0
    return jsonify(calcular_tendencia(
        _golpeos_usuario(id_usuario, "ASC"),
        semanas_prediccion=semanas,
        metrica=metrica,
    ))


@usuarios_bp.route("/api/usuarios/<int:id_usuario>/comparativa", methods=["GET"])
def comparativa_usuario(id_usuario: int):
    if not _usuario_model.obtener_por_id(id_usuario):
        return jsonify({"error": "Usuario no encontrado"}), 404
    try:
        n = int(request.args.get("n", "4"))
    except (TypeError, ValueError):
        n = 4
    return jsonify(calcular_comparativa(_golpeos_usuario(id_usuario, "DESC"), n=n))


@usuarios_bp.route("/api/usuarios/<int:id_usuario>/alertas_tendencia", methods=["GET"])
def alertas_tendencia_usuario(id_usuario: int):
    if not _usuario_model.obtener_por_id(id_usuario):
        return jsonify({"error": "Usuario no encontrado"}), 404
    golpeos = _golpeo_model.obtener_historial_analitica_usuario(id_usuario)
    from utils.serializers import serializar_row as _s
    return jsonify(calcular_alertas_tendencia([_s(g) for g in golpeos]))


@usuarios_bp.route("/api/usuarios/<int:id_usuario>/analitica_avanzada", methods=["GET"])
def analitica_avanzada_usuario(id_usuario: int):
    if not _usuario_model.obtener_por_id(id_usuario):
        return jsonify({"error": "Usuario no encontrado"}), 404
    metrica = (request.args.get("metrica") or "velocidad_pie_ms").strip()
    incluir_global = request.args.get("global", "0").strip() == "1"

    golpeos = [_serializar(g) for g in _golpeo_model.obtener_historial_analitica_usuario(id_usuario)]
    historial_global = (
        [_serializar(g) for g in _golpeo_model.obtener_historial_analitica_global()]
        if incluir_global else None
    )
    return jsonify(calcular_analitica_avanzada(golpeos, historial_global=historial_global, metrica=metrica))
