"""
Punto de entrada web del módulo 2 — Salto con cámara móvil.

Recibe un vídeo grabado desde el móvil, lo procesa con MediaPipe
y devuelve la distancia del salto (vertical u horizontal) como JSON.

Uso:
    python app.py

Endpoints:
    POST /api/salto/calcular  → JSON con el resultado del salto
"""

import logging
import os
import uuid

from dotenv import load_dotenv
load_dotenv()  # carga .env antes de importar config

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.utils import secure_filename

from config import FLASK_PORT, UPLOAD_FOLDER, EXTENSIONES_PERMITIDAS, MAX_UPLOAD_MB, CORS_ORIGINS
from controllers.salto_controller import SaltoController
from controllers.usuario_controller import usuarios_bp
from controllers.salto_db_controller import saltos_bp
from models.salto_model import SaltoModel
import mysql.connector

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
CORS(app, origins=CORS_ORIGINS)

app.register_blueprint(usuarios_bp)
app.register_blueprint(saltos_bp)

controller = SaltoController()
salto_model = SaltoModel()

# Crear carpeta de uploads si no existe
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@app.errorhandler(413)
def archivo_demasiado_grande(e):
    """Devuelve JSON en vez de HTML cuando el archivo excede el límite."""
    return jsonify({
        "error": f"El archivo excede el límite de {MAX_UPLOAD_MB} MB"
    }), 413


@app.route("/api/salto/calcular", methods=["POST"])
def calcular_salto():
    """
    Recibe un vídeo y parámetros, devuelve el resultado del salto.

    Form-data esperado:
        - video: archivo .mp4 / .webm / .avi / .mov
        - tipo_salto: "vertical" | "horizontal"
        - altura_real_m: float (obligatorio para ambos tipos)
        - id_usuario: int (opcional — si se envía, guarda el resultado en BD)
        - metodo_origen: "ia_vivo" | "video_galeria" (opcional, default: video_galeria)
        - guardar_video_bd: bool (opcional; si es true y se guarda salto, persiste el vídeo en BD)
    """
    # Validar que viene el archivo de vídeo
    if "video" not in request.files:
        return jsonify({"error": "No se recibió ningún archivo de vídeo"}), 400

    archivo = request.files["video"]
    if archivo.filename == "":
        return jsonify({"error": "El archivo no tiene nombre"}), 400

    # Validar extensión
    ext = os.path.splitext(secure_filename(archivo.filename))[1].lower()
    if ext not in EXTENSIONES_PERMITIDAS:
        return jsonify({
            "error": f"Extensión no permitida. Usa: {', '.join(EXTENSIONES_PERMITIDAS)}"
        }), 400

    # Validar tipo de salto
    tipo_salto = request.form.get("tipo_salto", "vertical").strip().lower()
    if tipo_salto not in ("vertical", "horizontal"):
        return jsonify({"error": "tipo_salto debe ser 'vertical' o 'horizontal'"}), 400

    # Validar altura real (obligatoria para ambos tipos)
    altura_real_m = None
    altura_str = request.form.get("altura_real_m")
    if not altura_str:
        return jsonify({
            "error": "'altura_real_m' es obligatorio (ej. 1.75)"
        }), 400
    try:
        altura_real_m = float(altura_str)
        if altura_real_m <= 0:
            raise ValueError
    except ValueError:
        return jsonify({
            "error": "'altura_real_m' debe ser un número positivo (ej. 1.75)"
        }), 400

    # Guardar archivo temporal con nombre único
    nombre_archivo = f"{uuid.uuid4().hex}{ext}"
    ruta_video = os.path.join(UPLOAD_FOLDER, nombre_archivo)
    archivo.save(ruta_video)

    try:
        resultado = controller.procesar_salto(ruta_video, tipo_salto, altura_real_m)

        respuesta = {
            "tipo_salto": resultado.tipo_salto,
            "distancia": resultado.distancia,
            "unidad": resultado.unidad,
            "confianza": resultado.confianza,
            "frame_despegue": resultado.frame_despegue,
            "frame_aterrizaje": resultado.frame_aterrizaje,
            "tiempo_vuelo_s": resultado.tiempo_vuelo_s,
            "metodo": resultado.metodo,
            "dist_por_pixeles": resultado.dist_por_pixeles,
            "dist_por_cinematica": resultado.dist_por_cinematica,
        }

        # Guardar en BD si se proporcionó id_usuario
        id_usuario_str = request.form.get("id_usuario")
        if id_usuario_str and resultado.distancia > 0:
            try:
                id_usuario = int(id_usuario_str)
                metodo_origen = request.form.get("metodo_origen", "video_galeria").strip().lower()
                if metodo_origen not in ("ia_vivo", "video_galeria", "sensor_arduino"):
                    metodo_origen = "video_galeria"
                id_salto = salto_model.crear(
                    id_usuario=id_usuario,
                    tipo_salto=resultado.tipo_salto,
                    distancia_cm=round(resultado.distancia),
                    tiempo_vuelo_s=resultado.tiempo_vuelo_s,
                    confianza_ia=resultado.confianza,
                    metodo_origen=metodo_origen,
                )
                respuesta["id_salto"] = id_salto

                guardar_video_bd = (request.form.get("guardar_video_bd", "false").strip().lower() in {
                    "1", "true", "si", "sí", "yes"
                })
                if guardar_video_bd:
                    with open(ruta_video, "rb") as f:
                        video_bytes = f.read()
                    guardado = salto_model.guardar_video_bd(
                        id_salto=id_salto,
                        video_bytes=video_bytes,
                        video_nombre=secure_filename(archivo.filename) or nombre_archivo,
                        video_mime=archivo.mimetype,
                    )
                    respuesta["video_guardado_bd"] = bool(guardado)
            except (ValueError, KeyError, OSError, mysql.connector.Error) as exc:
                logging.warning("No se pudo guardar el salto en BD (id_usuario=%s): %s", id_usuario_str, exc)

        return jsonify(respuesta)
    except Exception:
        logging.exception("Error procesando vídeo %s", nombre_archivo)
        return jsonify({
            "error": "Error interno al procesar el vídeo. Verifica que el archivo sea válido."
        }), 500
    finally:
        # Limpiar archivo temporal
        if os.path.exists(ruta_video):
            os.remove(ruta_video)


if __name__ == "__main__":
    print(f"[INFO] Módulo Salto — API disponible en http://localhost:{FLASK_PORT}")
    print(f"[INFO] POST /api/salto/calcular")
    print(f"[INFO] CRUD /api/usuarios, /api/saltos")
    app.run(host="0.0.0.0", port=FLASK_PORT, debug=False)
