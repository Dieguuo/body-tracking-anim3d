"""
Punto de entrada web del modulo futbol.

Recibe un video grabado desde el movil, lo procesa con MediaPipe
para obtener metricas biomecanicas del golpeo.
"""

import logging
import os
import uuid

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

from config import (
    CORS_ORIGINS,
    EXTENSIONES_PERMITIDAS,
    FLASK_PORT,
    MAX_UPLOAD_MB,
    UPLOAD_FOLDER,
)
from controllers.futbol_controller import FutbolController
from controllers.futbol_db_controller import futbol_db_bp
from controllers.usuarios_futbol_controller import usuarios_futbol_bp
from controllers.usuario_controller import usuarios_bp
from models.futbol_model import FutbolModel
from models.usuarios_futbol_model import UsuariosFutbolModel
from services.video_anotado_service import generar_video_anotado
from services.analitica_service import (
    calcular_fatiga_intra_sesion,
    calcular_tendencia,
    calcular_comparativa,
)
from utils.serializers import serializar_row as _serializar

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
CORS(app, origins=CORS_ORIGINS)

app.register_blueprint(futbol_db_bp)
app.register_blueprint(usuarios_futbol_bp)
app.register_blueprint(usuarios_bp)

controller = FutbolController()
modelo_futbol = FutbolModel()
modelo_usuario = UsuariosFutbolModel()

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@app.errorhandler(413)
# Responde cuando el archivo subido supera el limite permitido.
def archivo_demasiado_grande(_e):
    return jsonify({"error": f"El archivo excede el limite de {MAX_UPLOAD_MB} MB"}), 413


@app.route("/api/futbol/analizar", methods=["POST"])
# Recibe un video, valida formato y devuelve las metricas del golpeo.
def analizar_golpeo():
    if "video" not in request.files:
        return jsonify({"error": "No se recibio ningun archivo de video"}), 400

    archivo = request.files["video"]
    if archivo.filename == "":
        return jsonify({"error": "El archivo no tiene nombre"}), 400

    ext = os.path.splitext(secure_filename(archivo.filename))[1].lower()
    if ext not in EXTENSIONES_PERMITIDAS:
        return jsonify({
            "error": f"Extension no permitida. Usa: {', '.join(EXTENSIONES_PERMITIDAS)}"
        }), 400

    nombre_archivo = f"{uuid.uuid4().hex}{ext}"
    ruta_video = os.path.join(UPLOAD_FOLDER, nombre_archivo)
    archivo.save(ruta_video)

    incluir_landmarks = (request.form.get("incluir_landmarks", "false").strip().lower() in {
        "1", "true", "si", "yes"
    })

    try:
        resultado = controller.procesar_golpeo(ruta_video, incluir_landmarks=incluir_landmarks)
    except Exception as e:
        app.logger.error(f"Error al procesar el video: {e}", exc_info=True)
        return jsonify({"error": "Ocurrió un error interno al procesar el video."}), 500


    id_usuario = request.form.get("id_usuario")
    guardar_video_bd = (request.form.get("guardar_video_bd", "false").strip().lower() in {
        "1", "true", "si", "yes"
    })
    guardar_bd = request.form.get("guardar_bd", "false").strip().lower() in {"1", "true", "si", "yes"}
    guardar_bd = guardar_bd or guardar_video_bd

    if guardar_bd:
        # Validar que id_usuario es obligatorio si se va a guardar
        if not id_usuario or str(id_usuario).strip() == '':
            return jsonify({"error": "id_usuario es obligatorio cuando se guarda en BD"}), 400
        
        try:
            id_usuario_int = int(id_usuario)
        except (ValueError, TypeError):
            return jsonify({"error": "id_usuario debe ser un entero"}), 400

        if not modelo_usuario.obtener_por_id(id_usuario_int):
            return jsonify({"error": "Usuario no encontrado"}), 404

        metodo_origen = request.form.get("metodo_origen", "video_galeria").strip().lower()
        if metodo_origen not in {"ia_vivo", "video_galeria"}:
            metodo_origen = "video_galeria"

        try:
            payload = modelo_futbol.guardar_golpeo(id_usuario_int, resultado, metodo_origen=metodo_origen)
            resultado["id_golpeo"] = payload.get("id_golpeo")
        except Exception as e:
            app.logger.error(f"Error al guardar el golpeo en la BD: {e}", exc_info=True)
            return jsonify({"error": "No se pudo guardar el golpeo en la base de datos."}), 500

        if guardar_video_bd and resultado.get("id_golpeo"):
            try:
                with open(ruta_video, "rb") as f:
                    video_bytes = f.read()
                guardado = modelo_futbol.guardar_video_bd(
                    id_golpeo=int(resultado["id_golpeo"]),
                    video_bytes=video_bytes,
                    video_nombre=secure_filename(archivo.filename) or nombre_archivo,
                    video_mime=archivo.mimetype,
                )
                resultado["video_guardado_bd"] = bool(guardado)
            except Exception as e:
                app.logger.error(f"Error al guardar el video en la BD: {e}", exc_info=True)
                resultado["video_guardado_bd"] = False

    return jsonify(resultado)


# ─────────────────────────────────────────────────────────────
# Endpoints avanzados (analítica, vídeo anotado, curvas)
# ─────────────────────────────────────────────────────────────


@app.route("/api/futbol/video-anotado", methods=["POST"])
# Genera y devuelve un MP4 con overlay (esqueleto + ángulos + impacto + trayectoria).
def video_anotado():
    if "video" not in request.files:
        return jsonify({"error": "No se recibio ningun archivo de video"}), 400

    archivo = request.files["video"]
    if archivo.filename == "":
        return jsonify({"error": "El archivo no tiene nombre"}), 400

    ext = os.path.splitext(secure_filename(archivo.filename))[1].lower()
    if ext not in EXTENSIONES_PERMITIDAS:
        return jsonify({"error": "Extension no permitida"}), 400

    base = uuid.uuid4().hex
    ruta_in = os.path.join(UPLOAD_FOLDER, f"{base}{ext}")
    ruta_out = os.path.join(UPLOAD_FOLDER, f"{base}_anotado.mp4")
    archivo.save(ruta_in)

    frame_impacto = request.form.get("frame_impacto", type=int)
    pierna_golpeo = (request.form.get("pierna_golpeo") or "").strip().lower() or None

    try:
        if frame_impacto is None or pierna_golpeo is None:
            # Si no se proveen, recalcular rápido
            resultado = controller.procesar_golpeo(ruta_in, incluir_landmarks=False)
            if frame_impacto is None:
                frame_impacto = resultado.get("frame_impacto")
            if pierna_golpeo is None:
                pierna_golpeo = resultado.get("pierna_golpeo")

        ok = generar_video_anotado(
            ruta_video_entrada=ruta_in,
            ruta_video_salida=ruta_out,
            frame_impacto=frame_impacto,
            pierna_golpeo=pierna_golpeo,
        )
    except Exception as e:
        app.logger.error(f"Error generando video anotado: {e}", exc_info=True)
        return jsonify({"error": "No se pudo generar el video anotado."}), 500

    if not ok or not os.path.exists(ruta_out):
        return jsonify({"error": "No se pudo generar el video anotado."}), 500

    return send_file(ruta_out, mimetype="video/mp4", as_attachment=False,
                     download_name=f"golpeo_anotado_{base}.mp4")


@app.route("/api/golpeos/<int:id_golpeo>/curvas", methods=["GET"])
# Devuelve las curvas angulares (cadera, rodilla, tobillo) por frame.
def curvas_golpeo(id_golpeo: int):
    curvas = modelo_futbol.obtener_curvas(id_golpeo)
    if curvas is None:
        return jsonify({"error": "Curvas no disponibles para este golpeo"}), 404
    return jsonify(curvas)


@app.route("/api/golpeos/<int:id_golpeo>/landmarks", methods=["GET"])
# Devuelve los landmarks por frame (para visor 3D).
def landmarks_golpeo(id_golpeo: int):
    landmarks = modelo_futbol.obtener_landmarks(id_golpeo)
    if landmarks is None:
        return jsonify({"error": "Landmarks no disponibles para este golpeo"}), 404
    return jsonify({"landmarks_frames": landmarks})


@app.route("/api/golpeos/<int:id_golpeo>/alertas", methods=["GET"])
def alertas_golpeo(id_golpeo: int):
    alertas = modelo_futbol.obtener_alertas(id_golpeo)
    if alertas is None:
        return jsonify({"error": "Alertas no disponibles"}), 404
    return jsonify({"alertas": alertas})


# ─────────────────────────────────────────────────────────────
# LEGACY — Rutas deprecadas de analítica de usuario.
# Mantener temporalmente por compatibilidad con clientes antiguos.
# Usar en su lugar: /api/usuarios/<id>/fatiga|tendencia|comparativa
# Fecha prevista de retirada: 2026-08-01 (Fase 5 del roadmap de paridad).
# ─────────────────────────────────────────────────────────────

_DEPRECATION_HEADERS = {
    "Deprecation": "version=\"2026-08-01\"",
    "Sunset": "Sat, 01 Aug 2026 00:00:00 GMT",
    "Link": '</api/usuarios/{id}/fatiga>; rel="successor-version"',
}


def _legacy_response(data):
    """Envuelve una respuesta JSON añadiendo cabeceras de deprecación."""
    resp = jsonify(data)
    for k, v in _DEPRECATION_HEADERS.items():
        resp.headers[k] = v
    return resp


@app.route("/api/usuarios_futbol/<int:id_usuario>/fatiga", methods=["GET"])
def fatiga_usuario(id_usuario: int):
    err = _validar_usuario(id_usuario)
    if err:
        return err
    metrica = (request.args.get("metrica") or "velocidad_pie_ms").strip()
    return _legacy_response(calcular_fatiga_intra_sesion(_golpeos_serializados(id_usuario, "ASC"), metrica=metrica))


@app.route("/api/usuarios_futbol/<int:id_usuario>/tendencia", methods=["GET"])
def tendencia_usuario(id_usuario: int):
    err = _validar_usuario(id_usuario)
    if err:
        return err
    metrica = (request.args.get("metrica") or "velocidad_pie_ms").strip()
    try:
        semanas = float(request.args.get("semanas", "4"))
    except (TypeError, ValueError):
        semanas = 4.0
    return _legacy_response(calcular_tendencia(
        _golpeos_serializados(id_usuario, "ASC"),
        semanas_prediccion=semanas,
        metrica=metrica,
    ))


@app.route("/api/usuarios_futbol/<int:id_usuario>/comparativa", methods=["GET"])
def comparativa_usuario(id_usuario: int):
    err = _validar_usuario(id_usuario)
    if err:
        return err
    try:
        n = int(request.args.get("n", "4"))
    except (TypeError, ValueError):
        n = 4
    return _legacy_response(calcular_comparativa(_golpeos_serializados(id_usuario, "DESC"), n=n))


def _validar_usuario(id_usuario: int):
    if not modelo_usuario.obtener_por_id(id_usuario):
        return jsonify({"error": "Usuario no encontrado"}), 404
    return None


def _golpeos_serializados(id_usuario: int, orden: str = "DESC") -> list[dict]:
    if orden.upper() == "ASC":
        golpeos = modelo_futbol.obtener_por_usuario_ordenado_asc(id_usuario)
    else:
        golpeos = modelo_futbol.obtener_por_usuario(id_usuario)
    return [_serializar(g) for g in golpeos]


if __name__ == "__main__":
    project_root = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    cert_file = os.path.join(project_root, "certs", "cert.pem")
    key_file = os.path.join(project_root, "certs", "key.pem")
    ssl_context = None

    if os.path.exists(cert_file) and os.path.exists(key_file):
        ssl_context = (cert_file, key_file)
        print(f"[INFO] API disponible en https://localhost:{FLASK_PORT}/api/futbol/analizar")
    else:
        print("[WARN] Certificados SSL no encontrados en certs/. Arrancando en HTTP.")
        print(f"[INFO] API disponible en http://localhost:{FLASK_PORT}/api/futbol/analizar")

    app.run(host="0.0.0.0", port=FLASK_PORT, debug=False, ssl_context=ssl_context)
