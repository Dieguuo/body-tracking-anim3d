# ── Constantes del módulo salto ──

import os

FLASK_PORT: int = int(os.getenv("SALTO_PORT", "5001"))

# Orígenes permitidos para CORS.
# Usa "*" para entorno local flexible; también admite lista separada por comas.
_cors_origins_raw = os.getenv("CORS_ORIGINS", "*").strip()
if _cors_origins_raw == "*":
    CORS_ORIGINS = "*"
else:
    CORS_ORIGINS = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]

# Gravedad terrestre (m/s²)
GRAVEDAD: float = 9.81

# MediaPipe — landmarks de los pies (índices según el modelo Pose)
# https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
LANDMARK_HOMBRO_IZQ: int = 11
LANDMARK_HOMBRO_DER: int = 12
LANDMARK_CADERA_IZQ: int = 23
LANDMARK_CADERA_DER: int = 24
LANDMARK_RODILLA_IZQ: int = 25
LANDMARK_RODILLA_DER: int = 26
LANDMARK_TOBILLO_IZQ: int = 27
LANDMARK_TOBILLO_DER: int = 28
LANDMARK_TALON_IZQ: int = 29
LANDMARK_TALON_DER: int = 30
LANDMARK_PUNTA_IZQ: int = 31
LANDMARK_PUNTA_DER: int = 32

# Umbral mínimo de confianza de detección de MediaPipe
MIN_DETECTION_CONFIDENCE: float = 0.5
MIN_TRACKING_CONFIDENCE: float = 0.5

# Umbral de derivada Y para detectar despegue/aterrizaje (en píxeles/frame)
UMBRAL_DERIVADA_Y: float = 3.0

# Carpeta temporal para vídeos subidos (relativa al directorio de este archivo)
UPLOAD_FOLDER: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")

# Extensiones de vídeo permitidas
EXTENSIONES_PERMITIDAS: set = {".mp4", ".webm", ".avi", ".mov"}

# Tamaño máximo de archivo subido (100 MB)
MAX_UPLOAD_MB: int = 100

# ── Configuración de base de datos MySQL ──
# Las credenciales se leen de variables de entorno (archivo .env en la raíz).
# Si DB_PASSWORD no está definida, se lanza un error claro en vez de fallar en silencio.
_db_password = os.getenv("DB_PASSWORD")
if _db_password is None:
    raise RuntimeError(
        "Variable de entorno DB_PASSWORD no definida. "
        "Copia .env.example a .env y rellena tus credenciales de MySQL."
    )

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": _db_password,
    "database": os.getenv("DB_NAME", "bd_anim3d_saltos"),
    "charset": "utf8mb4",
    "collation": "utf8mb4_unicode_ci",
}
