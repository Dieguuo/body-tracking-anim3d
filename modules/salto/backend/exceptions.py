"""
@file exceptions.py
@description Excepciones personalizadas para el módulo salto.
             Proporciona una jerarquía clara de errores y facilita el manejo
             de excepciones a nivel de la aplicación sin exponer stacktraces.

@security
- No devuelven detalles internos al cliente (solo mensajes genéricos)
- Permiten logging detallado en el servidor
- Facilitan el manejo diferenciado por tipo de error
- Heredan de Exception base de Python

@usage
  try:
      resultado = controller.procesar_salto(video_path)
  except VideoProcessingError as e:
      app.logger.error(f"Error procesando video: {e}")
      return jsonify({"error": e.client_message}), e.status_code
"""


class SaltoError(Exception):
    """
    Excepción base para el módulo salto.
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


class VideoProcessingError(SaltoError):
    """
    Se lanza cuando hay error en el procesamiento del vídeo con MediaPipe.
    
    Causas comunes:
    - Formato de vídeo corrupto o no soportado
    - Resolución demasiado baja/alta
    - Duración anormal del vídeo
    - Falta de landmarks detectados (cuerpo no visible)
    - Frames insuficientes para análisis biomecánico
    
    Example:
        if len(frames) < 10:
            raise VideoProcessingError(
                "Vídeo tiene menos de 10 frames",
                "El vídeo es demasiado corto. Necesita al menos 0.5 segundos.",
                status_code=422
            )
    """

    def __init__(self, message, client_message=None, status_code=422):
        client_message = client_message or "Error al procesar el vídeo. Intenta con mejor iluminación."
        super().__init__(message, client_message, status_code)


class DatabaseError(SaltoError):
    """
    Se lanza cuando hay error en operaciones de BD.
    
    Causas comunes:
    - Conexión perdida a MySQL
    - Constraint violation (usuario no existe)
    - Query syntax error
    - Timeout en operación
    - Tabla o columna no existe
    
    Example:
        except mysql.connector.Error as e:
            raise DatabaseError(
                f"MySQL error: {e.msg} [errno: {e.errno}]",
                "Error al guardar datos. Intenta más tarde.",
                status_code=503
            )
    """

    def __init__(self, message, client_message=None, status_code=503):
        client_message = client_message or "Error en base de datos. Intenta más tarde."
        super().__init__(message, client_message, status_code)


class ValidationError(SaltoError):
    """
    Se lanza cuando la validación de entrada falla.
    
    Causas comunes:
    - Archivo vacío o no enviado
    - Extensión de archivo no permitida
    - Parámetros requeridos ausentes o inválidos
    - Tamaño de archivo excesivo
    - Valor de métrica fuera de rango
    
    Example:
        if not archivo or archivo.filename == '':
            raise ValidationError(
                "No se recibió archivo en el request",
                "Por favor selecciona un vídeo",
                status_code=400
            )
    """

    def __init__(self, message, client_message=None, status_code=400):
        client_message = client_message or "Validación fallida. Verifica los datos enviados."
        super().__init__(message, client_message, status_code)


class FileSystemError(SaltoError):
    """
    Se lanza cuando hay error del sistema de archivos.
    
    Causas comunes:
    - Permiso denegado para escribir en uploads/
    - Disco lleno
    - Path no encontrado
    - Fallo al eliminar archivo temporal
    - Fallo al crear directorio
    
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


class UserNotFoundError(SaltoError):
    """
    Se lanza cuando el usuario no existe en la BD.
    
    Causas comunes:
    - ID de usuario no encontrado
    - Usuario fue eliminado
    - ID inválido o corrompido
    
    Example:
        if not usuario:
            raise UserNotFoundError(
                f"Usuario ID {id_usuario} no encontrado",
                "Usuario no válido",
                status_code=404
            )
    """

    def __init__(self, message, client_message=None, status_code=404):
        client_message = client_message or "Usuario no encontrado"
        super().__init__(message, client_message, status_code)


class BiomechanicsError(SaltoError):
    """
    Se lanza cuando hay error en el cálculo biomecánico.
    
    Causas comunes:
    - Landmarks incompletos o inválidos
    - Ángulos/distancias no calculables
    - Falta de datos para predicción
    - Modelo de IA no disponible
    
    Example:
        if not all_landmarks_present:
            raise BiomechanicsError(
                "No se pueden calcular ángulos: landmarks incompletos",
                "No se pudo completar el análisis biomecánico.",
                status_code=422
            )
    """

    def __init__(self, message, client_message=None, status_code=422):
        client_message = client_message or "Error en cálculo de métricas biomecánicas"
        super().__init__(message, client_message, status_code)


class RateLimitError(SaltoError):
    """
    Se lanza cuando se excede el límite de rate limiting.
    
    Causas comunes:
    - Demasiadas peticiones en corto tiempo
    - Ataque de fuerza bruta detectado
    - Usuario/IP bloqueado temporalmente
    
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
