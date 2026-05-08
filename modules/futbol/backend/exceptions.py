"""
@file exceptions.py
@description Excepciones personalizadas para el módulo futbol.
             Proporciona una jerarquía clara de errores y facilita el manejo
             de excepciones a nivel de la aplicación sin exponer stacktraces.

@security
- No devuelven detalles internos al cliente (solo mensajes genéricos)
- Permiten logging detallado en el servidor
- Facilitan el manejo diferenciado por tipo de error
- Heredan de Exception base de Python

@usage
  try:
      resultado = controller.procesar_golpeo(video_path)
  except VideoProcessingError as e:
      app.logger.error(f"Error procesando video: {e}")
      return jsonify({"error": "Error en análisis de vídeo"}), 500
"""


class FutbolError(Exception):
    """
    Excepción base para el módulo futbol.
    Todas las excepciones del módulo deben heredar de esta.
    
    Attributes:
        message (str): Mensaje de error detallado (se loguea, no se envía al cliente)
        client_message (str): Mensaje seguro para enviar al cliente
        status_code (int): Código HTTP recomendado
    """

    def __init__(self, message, client_message=None, status_code=500):
        """
        Inicializa la excepción.
        
        Args:
            message (str): Mensaje técnico detallado para logs
            client_message (str, optional): Mensaje genérico para cliente.
                                          Si es None, se usa genérico.
            status_code (int): Código HTTP (default: 500)
        """
        self.message = message
        self.client_message = client_message or "Error interno del servidor"
        self.status_code = status_code
        super().__init__(self.message)

    def __str__(self):
        return self.message


class VideoProcessingError(FutbolError):
    """
    Se lanza cuando hay error en el procesamiento del vídeo con MediaPipe.
    
    Causas comunes:
    - Formato de vídeo corrupto o no soportado
    - Resolución demasiado baja/alta
    - Duración anormal del vídeo
    - Falta de landmarks detectados
    
    Example:
        if len(landmarks) == 0:
            raise VideoProcessingError(
                "No se detectaron landmarks en el vídeo",
                "No se pudo analizar el vídeo. Intenta con mejor iluminación.",
                status_code=422
            )
    """

    def __init__(self, message, client_message=None, status_code=422):
        client_message = client_message or "Error al procesar el vídeo. Verifica que sea válido."
        super().__init__(message, client_message, status_code)


class DatabaseError(FutbolError):
    """
    Se lanza cuando hay error en operaciones de BD.
    
    Causas comunes:
    - Conexión perdida a MySQL
    - Constraint violation (usuario no existe)
    - Query syntax error
    - Timeout en operación
    
    Example:
        except mysql.connector.Error as e:
            raise DatabaseError(
                f"MySQL error: {e.msg} [errno: {e.errno}]",
                "Error en base de datos. Intenta más tarde.",
                status_code=503
            )
    """

    def __init__(self, message, client_message=None, status_code=503):
        client_message = client_message or "Error en base de datos. Intenta más tarde."
        super().__init__(message, client_message, status_code)


class ValidationError(FutbolError):
    """
    Se lanza cuando la validación de entrada falla.
    
    Causas comunes:
    - Archivo vacío o no enviado
    - Extensión de archivo no permitida
    - Parámetros requeridos ausentes o inválidos
    - Tamaño de archivo excesivo
    
    Example:
        if not archivo:
            raise ValidationError(
                "No se recibió archivo en el request",
                "Por favor selecciona un vídeo",
                status_code=400
            )
    """

    def __init__(self, message, client_message=None, status_code=400):
        client_message = client_message or "Validación fallida. Verifica los datos enviados."
        super().__init__(message, client_message, status_code)


class FileSystemError(FutbolError):
    """
    Se lanza cuando hay error del sistema de archivos.
    
    Causas comunes:
    - Permiso denegado para escribir en uploads/
    - Disco lleno
    - Path no encontrado
    - Fallo al eliminar archivo temporal
    
    Example:
        except IOError as e:
            raise FileSystemError(
                f"No se pudo guardar archivo temporal: {e}",
                "Error al guardar el archivo. Intenta más tarde.",
                status_code=507
            )
    """

    def __init__(self, message, client_message=None, status_code=507):
        client_message = client_message or "Error al guardar archivo. Intenta más tarde."
        super().__init__(message, client_message, status_code)


class AuthenticationError(FutbolError):
    """
    Se lanza cuando hay error de autenticación.
    
    Causas comunes:
    - Usuario no encontrado
    - Token inválido o expirado
    - Credenciales incorrectas
    
    Example:
        if not usuario:
            raise AuthenticationError(
                f"Usuario ID {id_usuario} no encontrado en BD",
                "Usuario no válido",
                status_code=401
            )
    """

    def __init__(self, message, client_message=None, status_code=401):
        client_message = client_message or "Autenticación fallida"
        super().__init__(message, client_message, status_code)


class RateLimitError(FutbolError):
    """
    Se lanza cuando se excede el límite de rate limiting.
    
    Causas comunes:
    - Demasiadas peticiones en corto tiempo
    - Ataque de fuerza bruta detectado
    
    Example:
        if requests_in_minute > 10:
            raise RateLimitError(
                f"IP {remote_addr} excedió límite de rate limiting",
                "Demasiadas solicitudes. Intenta más tarde.",
                status_code=429
            )
    """

    def __init__(self, message, client_message=None, status_code=429):
        client_message = client_message or "Demasiadas solicitudes. Intenta más tarde."
        super().__init__(message, client_message, status_code)
