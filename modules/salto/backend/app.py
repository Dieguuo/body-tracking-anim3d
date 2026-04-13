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
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()  # carga .env antes de importar config

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

from config import FLASK_PORT, UPLOAD_FOLDER, EXTENSIONES_PERMITIDAS, MAX_UPLOAD_MB, CORS_ORIGINS
from controllers.salto_controller import SaltoController
from controllers.usuario_controller import usuarios_bp
from controllers.salto_db_controller import saltos_bp
from models.salto_model import SaltoModel
from models.usuario_model import UsuarioModel
from services.analitica_service import calcular_fatiga_intra_sesion
from services.interpretacion_service import (
    clasificar_salto,
    generar_alertas_salto,
    generar_observaciones,
)
from services.video_anotado_service import generar_video_anotado
import mysql.connector

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
CORS(app, origins=CORS_ORIGINS)


@app.after_request
def agregar_cabeceras_seguridad(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


app.register_blueprint(usuarios_bp)
app.register_blueprint(saltos_bp)

controller = SaltoController()
salto_model = SaltoModel()
usuario_model = UsuarioModel()

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

    incluir_landmarks = (request.form.get("incluir_landmarks", "false").strip().lower() in {
        "1", "true", "si", "sí", "yes"
    })

    try:
        # Buscar peso_kg del usuario si se proporcionó id_usuario
        peso_kg = None
        id_usuario_str = request.form.get("id_usuario")
        if id_usuario_str:
            try:
                usuario = usuario_model.obtener_por_id(int(id_usuario_str))
                if usuario and usuario.get("peso_kg"):
                    peso_kg = float(usuario["peso_kg"])
            except (ValueError, TypeError):
                pass

        resultado = controller.procesar_salto(ruta_video, tipo_salto, altura_real_m, peso_kg)

        media_historica_cm = None
        fatiga_significativa = False
        if id_usuario_str:
            try:
                id_usuario_int = int(id_usuario_str)
                historial_tipo = salto_model.obtener_por_usuario_y_tipo(id_usuario_int, resultado.tipo_salto)
                if historial_tipo:
                    dist = [float(s.get("distancia_cm", 0) or 0) for s in historial_tipo]
                    media_historica_cm = (sum(dist) / len(dist)) if dist else None

                # Simula la sesión con el salto actual para clasificar fatiga de forma inmediata.
                historial_con_actual = list(historial_tipo)
                historial_con_actual.append({
                    "distancia_cm": float(resultado.distancia or 0),
                    "fecha_salto": datetime.now(),
                })
                fatiga = calcular_fatiga_intra_sesion(historial_con_actual)
                fatiga_significativa = bool(fatiga.get("fatiga_significativa"))
            except (ValueError, TypeError, KeyError):
                logging.warning("No se pudo calcular contexto histórico para interpretación del salto")

        alertas = generar_alertas_salto(
            angulo_rodilla_deg=resultado.angulo_rodilla_deg,
            angulo_cadera_deg=resultado.angulo_cadera_deg,
            asimetria_pct=resultado.asimetria_pct,
            confianza=resultado.confianza,
        )
        observaciones = generar_observaciones(
            distancia_cm=float(resultado.distancia or 0),
            media_historica_cm=media_historica_cm,
            angulo_cadera_deg=resultado.angulo_cadera_deg,
        )
        clasificacion = clasificar_salto(
            alertas=alertas,
            asimetria_pct=resultado.asimetria_pct,
            fatiga_significativa=fatiga_significativa,
        )

        estabilidad_score = resultado.estabilidad_aterrizaje
        if isinstance(estabilidad_score, dict):
            estabilidad_score = None
        if estabilidad_score is not None:
            try:
                estabilidad_score = float(estabilidad_score)
            except (TypeError, ValueError):
                estabilidad_score = None

        respuesta = {
            "tipo_salto": resultado.tipo_salto,
            "distancia": resultado.distancia,
            "unidad": resultado.unidad,
            "confianza": resultado.confianza,
            "frame_despegue": resultado.frame_despegue,
            "frame_aterrizaje": resultado.frame_aterrizaje,
            "tiempo_vuelo_s": resultado.tiempo_vuelo_s,
            "angulo_rodilla_deg": resultado.angulo_rodilla_deg,
            "angulo_cadera_deg": resultado.angulo_cadera_deg,
            "potencia_w": resultado.potencia_w,
            "asimetria_pct": resultado.asimetria_pct,
            "estabilidad_aterrizaje": estabilidad_score,
            "estabilidad_detalle": resultado.estabilidad_detalle,
            "metodo": resultado.metodo,
            "dist_por_pixeles": resultado.dist_por_pixeles,
            "dist_por_cinematica": resultado.dist_por_cinematica,
            # Fase 6 — Biomecánica del aterrizaje
            "amortiguacion": resultado.amortiguacion,
            "asimetria_recepcion_pct": resultado.asimetria_recepcion_pct,
            # Fase 7 — Análisis cinemático temporal
            "curvas_angulares": resultado.curvas_angulares,
            "fases_salto": resultado.fases_salto,
            "velocidades_articulares": resultado.velocidades_articulares,
            "resumen_gesto": resultado.resumen_gesto,
            # Fase 9 — Interpretación automática
            "alertas": alertas,
            "observaciones": observaciones,
            "clasificacion": clasificacion,
            # Fase 10 — Landmarks 33 puntos (opcional, evita payloads pesados por defecto)
            "landmarks_frames": resultado.landmarks_frames if incluir_landmarks else None,
            # Slow-motion
            "factor_slowmo": resultado.factor_slowmo,
        }

        # Guardar en BD si se proporcionó id_usuario
        if id_usuario_str:
            try:
                id_usuario = int(id_usuario_str)
                metodo_origen = request.form.get("metodo_origen", "video_galeria").strip().lower()
                if metodo_origen not in ("ia_vivo", "video_galeria", "sensor_arduino"):
                    metodo_origen = "video_galeria"

                curvas_payload = {}
                if resultado.curvas_angulares:
                    curvas_payload["curvas_angulares"] = resultado.curvas_angulares
                if resultado.fases_salto:
                    curvas_payload["fases_salto"] = resultado.fases_salto
                if resultado.landmarks_frames:
                    curvas_payload["landmarks_frames"] = resultado.landmarks_frames

                id_salto = salto_model.crear(
                    id_usuario=id_usuario,
                    tipo_salto=resultado.tipo_salto,
                    distancia_cm=round(resultado.distancia),
                    tiempo_vuelo_s=resultado.tiempo_vuelo_s,
                    confianza_ia=resultado.confianza,
                    metodo_origen=metodo_origen,
                    potencia_w=resultado.potencia_w,
                    asimetria_pct=resultado.asimetria_pct,
                    angulo_rodilla_deg=resultado.angulo_rodilla_deg,
                    angulo_cadera_deg=resultado.angulo_cadera_deg,
                    estabilidad_aterrizaje=estabilidad_score,
                    curvas_json=curvas_payload or None,
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


@app.route("/api/salto/<int:id_salto>/landmarks", methods=["GET"])
def obtener_landmarks_salto(id_salto: int):
    """Devuelve los 33 landmarks por frame para un salto guardado."""
    data = salto_model.obtener_landmarks_por_id(id_salto)
    if not data:
        return jsonify({"error": "Landmarks no encontrados para este salto"}), 404
    return jsonify(data)


@app.route("/api/salto/video-anotado", methods=["POST"])
def video_anotado():
    """
    Recibe un vídeo, lo procesa y devuelve un vídeo con overlay de
    landmarks, ángulos articulares y marcadores de eventos.

    Form-data esperado:
        - video: archivo .mp4 / .webm / .avi / .mov
        - tipo_salto: "vertical" | "horizontal"
        - altura_real_m: float
    """
    if "video" not in request.files:
        return jsonify({"error": "No se recibió ningún archivo de vídeo"}), 400

    archivo = request.files["video"]
    if archivo.filename == "":
        return jsonify({"error": "El archivo no tiene nombre"}), 400

    ext = os.path.splitext(secure_filename(archivo.filename))[1].lower()
    if ext not in EXTENSIONES_PERMITIDAS:
        return jsonify({"error": "Extensión no permitida"}), 400

    tipo_salto = request.form.get("tipo_salto", "vertical").strip().lower()
    altura_str = request.form.get("altura_real_m")
    if not altura_str:
        return jsonify({"error": "'altura_real_m' es obligatorio"}), 400
    try:
        altura_real_m = float(altura_str)
        if altura_real_m <= 0:
            raise ValueError
    except ValueError:
        return jsonify({"error": "'altura_real_m' debe ser un número positivo"}), 400

    nombre_base = uuid.uuid4().hex
    ruta_entrada = os.path.join(UPLOAD_FOLDER, f"{nombre_base}{ext}")
    ruta_salida = os.path.join(UPLOAD_FOLDER, f"{nombre_base}_anotado.mp4")
    archivo.save(ruta_entrada)

    try:
        # Obtener frames de despegue/aterrizaje procesando primero
        peso_kg = None
        id_usuario_str = request.form.get("id_usuario")
        if id_usuario_str:
            try:
                usuario = usuario_model.obtener_por_id(int(id_usuario_str))
                if usuario and usuario.get("peso_kg"):
                    peso_kg = float(usuario["peso_kg"])
            except (ValueError, TypeError):
                pass

        resultado = controller.procesar_salto(ruta_entrada, tipo_salto, altura_real_m, peso_kg)

        # Detectar frame del pico (máxima altura = mínimo Y en curvas)
        frame_pico = None
        if resultado.curvas_angulares and resultado.frame_despegue is not None and resultado.frame_aterrizaje is not None:
            resumen = resultado.resumen_gesto
            if resumen and resumen.get("pico_flexion_rodilla"):
                frame_pico = resumen["pico_flexion_rodilla"].get("frame_idx")

        exito = generar_video_anotado(
            ruta_video_entrada=ruta_entrada,
            ruta_video_salida=ruta_salida,
            frame_despegue=resultado.frame_despegue,
            frame_aterrizaje=resultado.frame_aterrizaje,
            frame_pico=frame_pico,
        )

        if not exito:
            return jsonify({"error": "No se pudo generar el vídeo anotado"}), 500

        # Leer el archivo en memoria para evitar PermissionError en Windows
        # (send_file mantiene el archivo abierto durante el streaming y
        # el bloque finally no puede borrarlo).
        with open(ruta_salida, "rb") as f:
            video_data = f.read()

        response = app.response_class(
            video_data,
            mimetype="video/mp4",
            headers={
                "Content-Disposition": "attachment; filename=salto_anotado.mp4",
                "Content-Length": str(len(video_data)),
            },
        )
        return response
    except Exception:
        logging.exception("Error generando vídeo anotado")
        return jsonify({"error": "Error interno al generar el vídeo anotado"}), 500
    finally:
        for ruta in [ruta_entrada, ruta_salida]:
            try:
                if os.path.exists(ruta):
                    os.remove(ruta)
            except OSError:
                pass


if __name__ == "__main__":
    project_root = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    cert_file = os.path.join(project_root, "certs", "cert.pem")
    key_file = os.path.join(project_root, "certs", "key.pem")
    ssl_context = None

    if os.path.exists(cert_file) and os.path.exists(key_file):
        ssl_context = (cert_file, key_file)
        logging.info("Módulo Salto — API disponible en https://localhost:%s", FLASK_PORT)
    else:
        logging.warning("Certificados SSL no encontrados en certs/. Arrancando en HTTP.")
        logging.info("Módulo Salto — API disponible en http://localhost:%s", FLASK_PORT)

    logging.info("POST /api/salto/calcular")
    logging.info("POST /api/salto/video-anotado")
    logging.info("CRUD /api/usuarios, /api/saltos")
    app.run(host="0.0.0.0", port=FLASK_PORT, debug=False, ssl_context=ssl_context)
