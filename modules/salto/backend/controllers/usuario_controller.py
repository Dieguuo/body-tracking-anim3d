"""
CONTROLADOR — Endpoints REST para la tabla `usuarios`.

Rutas:
    GET    /api/usuarios                  → Lista todos los usuarios
    POST   /api/usuarios                  → Crea un usuario
    GET    /api/usuarios/<id>             → Obtiene un usuario
    PUT    /api/usuarios/<id>             → Actualiza un usuario
    DELETE /api/usuarios/<id>             → Elimina un usuario
    GET    /api/usuarios/<id>/saltos      → Saltos de un usuario
    GET    /api/usuarios/<id>/progreso    → Progreso (mínimo 4+4)
    GET    /api/usuarios/<id>/comparativa → Comparativa intra-usuario
    GET    /api/usuarios/<id>/fatiga      → Fatiga intra-sesión
    GET    /api/usuarios/<id>/tendencia   → Tendencia histórica
    GET    /api/usuarios/<id>/alertas_tendencia → Alertas entre sesiones
"""

from flask import Blueprint, jsonify, request
from mysql.connector import IntegrityError

from models.usuario_model import UsuarioModel
from models.salto_model import SaltoModel
from services.comparativa_service import calcular_progreso, calcular_comparativa
from services.analitica_service import (
    TIPOS_SALTO_VALIDOS,
    calcular_alertas_tendencia,
    calcular_comparativa_sesiones,
    calcular_correlaciones,
    calcular_evolucion_asimetria,
    calcular_fatiga_intra_sesion,
    comparar_tipos_usuario,
    calcular_tendencia_historial,
    detectar_estancamiento_mejora,
    prediccion_multivariable_usuario,
    ranking_mejores_sesiones,
)

usuarios_bp = Blueprint("usuarios", __name__)

_usuario_model = UsuarioModel()
_salto_model = SaltoModel()

METRICAS_TENDENCIA_VALIDAS = {"distancia", "potencia_estimada"}


def _leer_tipo_salto(default: str = "vertical"):
    tipo = (request.args.get("tipo") or default).strip().lower()
    if tipo not in TIPOS_SALTO_VALIDOS:
        return None, jsonify({"error": f"tipo debe ser: {', '.join(sorted(TIPOS_SALTO_VALIDOS))}"}), 400
    return tipo, None, None


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
        return jsonify({"error": "altura_m debe ser un número válido"}), 400

    peso_kg = None
    peso_str = data.get("peso_kg")
    if peso_str is not None:
        try:
            peso_kg = float(peso_str)
            if not (20 <= peso_kg <= 300):
                return jsonify({"error": "peso_kg debe estar entre 20 y 300 kg"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "peso_kg debe ser un número válido"}), 400

    try:
        nuevo_id = _usuario_model.crear(alias, nombre, altura, peso_kg)
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
        return jsonify({"error": "altura_m debe ser un número válido"}), 400

    peso_kg = None
    peso_str = data.get("peso_kg")
    if peso_str is not None:
        try:
            peso_kg = float(peso_str)
            if not (20 <= peso_kg <= 300):
                return jsonify({"error": "peso_kg debe estar entre 20 y 300 kg"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "peso_kg debe ser un número válido"}), 400

    try:
        ok = _usuario_model.actualizar(id_usuario, alias, nombre, altura, peso_kg)
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


@usuarios_bp.route("/api/usuarios/<int:id_usuario>/fatiga", methods=["GET"])
def fatiga(id_usuario):
    usuario = _usuario_model.obtener_por_id(id_usuario)
    if not usuario:
        return jsonify({"error": "Usuario no encontrado"}), 404

    tipo, error_response, status = _leer_tipo_salto(default="vertical")
    if error_response:
        return error_response, status

    saltos = _salto_model.obtener_por_usuario_y_tipo(id_usuario, tipo)
    resultado = calcular_fatiga_intra_sesion(saltos)

    return jsonify({
        "id_usuario": id_usuario,
        "alias": usuario["alias"],
        "tipo_salto": tipo,
        **resultado,
    })


@usuarios_bp.route("/api/usuarios/<int:id_usuario>/tendencia", methods=["GET"])
def tendencia(id_usuario):
    usuario = _usuario_model.obtener_por_id(id_usuario)
    if not usuario:
        return jsonify({"error": "Usuario no encontrado"}), 404

    tipo, error_response, status = _leer_tipo_salto(default="vertical")
    if error_response:
        return error_response, status

    metrica = (request.args.get("metrica") or "distancia").strip().lower()
    if metrica not in METRICAS_TENDENCIA_VALIDAS:
        return jsonify({"error": f"metrica debe ser: {', '.join(sorted(METRICAS_TENDENCIA_VALIDAS))}"}), 400

    peso_kg = usuario.get("peso_kg")
    try:
        peso_kg = float(peso_kg) if peso_kg is not None else None
    except (ValueError, TypeError):
        peso_kg = None

    saltos = _salto_model.obtener_por_usuario_y_tipo(id_usuario, tipo)
    resultado = calcular_tendencia_historial(saltos, metrica=metrica, peso_kg=peso_kg)

    return jsonify({
        "id_usuario": id_usuario,
        "alias": usuario["alias"],
        "tipo_salto": tipo,
        **resultado,
    })


@usuarios_bp.route("/api/usuarios/<int:id_usuario>/alertas_tendencia", methods=["GET"])
def alertas_tendencia(id_usuario):
    usuario = _usuario_model.obtener_por_id(id_usuario)
    if not usuario:
        return jsonify({"error": "Usuario no encontrado"}), 404

    tipo, error_response, status = _leer_tipo_salto(default="vertical")
    if error_response:
        return error_response, status

    saltos = _salto_model.obtener_por_usuario_y_tipo(id_usuario, tipo)
    peso_kg = usuario.get("peso_kg")
    try:
        peso_kg = float(peso_kg) if peso_kg is not None else None
    except (ValueError, TypeError):
        peso_kg = None

    alertas = calcular_alertas_tendencia(saltos, peso_kg=peso_kg)
    return jsonify({
        "id_usuario": id_usuario,
        "alias": usuario["alias"],
        "tipo_salto": tipo,
        "alertas": alertas,
    })


@usuarios_bp.route("/api/usuarios/<int:id_usuario>/analitica_avanzada", methods=["GET"])
def analitica_avanzada(id_usuario):
    usuario = _usuario_model.obtener_por_id(id_usuario)
    if not usuario:
        return jsonify({"error": "Usuario no encontrado"}), 404

    tipo, error_response, status = _leer_tipo_salto(default="vertical")
    if error_response:
        return error_response, status

    metrica = (request.args.get("metrica") or "distancia").strip().lower()
    metricas_validas = {"distancia", "potencia_estimada", "asimetria", "estabilidad"}
    if metrica not in metricas_validas:
        return jsonify({"error": f"metrica debe ser: {', '.join(sorted(metricas_validas))}"}), 400

    peso_kg = usuario.get("peso_kg")
    try:
        peso_kg = float(peso_kg) if peso_kg is not None else None
    except (ValueError, TypeError):
        peso_kg = None

    saltos_tipo = _salto_model.obtener_historial_analitica_usuario(id_usuario, tipo_salto=tipo)
    saltos_vertical = _salto_model.obtener_historial_analitica_usuario(id_usuario, tipo_salto="vertical")
    saltos_horizontal = _salto_model.obtener_historial_analitica_usuario(id_usuario, tipo_salto="horizontal")
    historial_global = _salto_model.obtener_historial_analitica_global(tipo_salto=tipo)

    payload = {
        "id_usuario": id_usuario,
        "alias": usuario["alias"],
        "tipo_salto": tipo,
        "metrica": metrica,
        "asimetria_evolucion": calcular_evolucion_asimetria(saltos_tipo),
        "comparativa_sesiones": calcular_comparativa_sesiones(
            saltos_tipo,
            metrica=metrica,
            peso_kg=peso_kg,
            max_sesiones=2,
        ),
        "correlaciones": calcular_correlaciones(historial_global),
        "estancamiento_mejora": detectar_estancamiento_mejora(
            saltos_tipo,
            metrica=metrica,
            peso_kg=peso_kg,
        ),
        "rankings": {
            "top_sesiones": ranking_mejores_sesiones(historial_global, tipo_salto=tipo, top_n=5),
        },
        "comparativa_tipos": comparar_tipos_usuario(
            saltos_vertical,
            saltos_horizontal,
            peso_kg,
        ),
        "prediccion_multivariable": prediccion_multivariable_usuario(
            saltos_tipo,
            peso_kg,
            semanas_prediccion=4.0,
        ),
    }

    return jsonify(payload)
