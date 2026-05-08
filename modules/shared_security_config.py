"""
@file security_config.py
@description Configuración centralizada para seguridad, rate limiting y error handling.
             Puede ser usada por ambos módulos (futbol y salto).

@usage
    from security_config import setup_security, limiter
    
    app = Flask(__name__)
    setup_security(app)
    
    @app.route("/api/analyze", methods=["POST"])
    @limiter.limit("10 per minute")
    def analyze():
        ...
"""

import logging
from flask import jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_limiter.errors import RateLimitExceeded


# ────────────────────────────────────────────────────────────────
# RATE LIMITING
# ────────────────────────────────────────────────────────────────

def create_limiter():
    """
    Crea una instancia del rate limiter compartida.
    
    Límites por defecto:
    - 1000 peticiones por día por IP
    - 100 peticiones por hora por IP
    
    En producción usar Redis:
        storage_uri="redis://localhost:6379"
    
    Returns:
        Limiter: Instancia configurada
    """
    return Limiter(
        key_func=get_remote_address,
        default_limits=["1000 per day", "100 per hour"],
        storage_uri="memory://",  # En prod usar Redis
        strategy="fixed-window",
    )


limiter = create_limiter()


# ────────────────────────────────────────────────────────────────
# ERROR HANDLERS
# ────────────────────────────────────────────────────────────────

def setup_error_handlers(app, exception_class):
    """
    Configura los handlers globales de errores para una aplicación Flask.
    
    Handlers:
    1. 413 Payload Too Large - Archivo demasiado grande
    2. FutbolError/SaltoError - Excepciones personalizadas del módulo
    3. RateLimitExceeded - Límite de rate limiting alcanzado
    4. Exception - Cualquier excepción no manejada
    
    Args:
        app (Flask): Instancia de la aplicación Flask
        exception_class: Clase base de excepciones del módulo (FutbolError o SaltoError)
    
    Security:
    - Nunca exponemos stacktraces al cliente
    - Mensajes genéricos para usuarios finales
    - Logging detallado en servidor
    """
    
    @app.errorhandler(413)
    def handle_payload_too_large(error):
        """Handler para archivos demasiado grandes."""
        return jsonify({"error": "Archivo demasiado grande"}), 413
    
    @app.errorhandler(exception_class)
    def handle_module_error(error):
        """
        Handler para excepciones personalizadas del módulo.
        
        Extrae:
        - client_message: Mensaje seguro para cliente
        - status_code: Código HTTP apropiado
        
        Loguea el mensaje técnico completo en servidor.
        """
        app.logger.warning(
            f"[{exception_class.__name__}] {error.__class__.__name__}: {error.message} "
            f"(HTTP {error.status_code})"
        )
        return jsonify({"error": error.client_message}), error.status_code
    
    @app.errorhandler(RateLimitExceeded)
    def handle_rate_limit(error):
        """Handler para límite de rate limiting excedido."""
        return jsonify({"error": "Demasiadas solicitudes. Intenta más tarde."}), 429
    
    @app.errorhandler(Exception)
    def handle_generic_error(error):
        """
        Handler para excepciones genéricas no manejadas.
        
        Loguea el stacktrace completo en servidor.
        Devuelve mensaje genérico al cliente (sin detalles técnicos).
        """
        app.logger.error(
            f"[Error no manejado] {type(error).__name__}: {str(error)}",
            exc_info=True  # Incluir stacktrace completo
        )
        return jsonify({"error": "Error interno del servidor. Intenta más tarde."}), 500


def setup_logging(app, module_name):
    """
    Configura logging consistente para el módulo.
    
    Establece nivel INFO y formato con timestamp.
    
    Args:
        app (Flask): Instancia de la aplicación
        module_name (str): Nombre del módulo (ej: 'futbol', 'salto')
    """
    logging.basicConfig(
        level=logging.INFO,
        format=f"[{module_name.upper()}] %(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def setup_security(app, exception_class, module_name="api"):
    """
    Configuración de seguridad completa para la aplicación.
    
    Ejecuta:
    1. setup_logging() - Logging consistente
    2. setup_error_handlers() - Error handlers globales
    3. Cabeceras de seguridad - Protección contra XSS, clickjacking, etc.
    
    Args:
        app (Flask): Instancia de la aplicación
        exception_class: Clase base de excepciones del módulo
        module_name (str): Nombre del módulo
    
    Example:
        app = Flask(__name__)
        from exceptions import FutbolError
        from security_config import setup_security, limiter
        
        setup_security(app, FutbolError, "futbol")
        
        @app.route("/api/futbol/analizar", methods=["POST"])
        @limiter.limit("10 per minute")
        def analizar():
            pass
    """
    
    # 1. Configurar logging
    setup_logging(app, module_name)
    
    # 2. Configurar error handlers
    setup_error_handlers(app, exception_class)
    
    # 3. Agregar cabeceras de seguridad después de cada request
    @app.after_request
    def add_security_headers(response):
        """
        Añade cabeceras de seguridad a todas las respuestas.
        
        Headers:
        - X-Content-Type-Options: nosniff - Previene MIME type sniffing
        - X-Frame-Options: DENY - Previene clickjacking
        - X-XSS-Protection: 1; mode=block - Protección contra XSS
        - Strict-Transport-Security: HTTPS only (en producción)
        """
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        # En producción, habilitar HSTS (HTTP Strict Transport Security)
        # response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        return response
    
    app.logger.info(f"✓ Configuración de seguridad aplicada para módulo '{module_name}'")
