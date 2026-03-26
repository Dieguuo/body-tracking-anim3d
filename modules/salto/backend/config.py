# ── Constantes del módulo salto ──

import os

FLASK_PORT: int = int(os.getenv("SALTO_PORT", "5001"))

# Orígenes permitidos para CORS (separados por coma en la variable de entorno)
CORS_ORIGINS: list[str] = os.getenv(
    "CORS_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080"
).split(",")

# Gravedad terrestre (m/s²)
GRAVEDAD: float = 9.81

# MediaPipe — landmarks de los pies (índices según el modelo Pose)
# https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
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
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", "1234"),
    "database": os.getenv("DB_NAME", "bd_anim3d_saltos"),
    "charset": "utf8mb4",
    "collation": "utf8mb4_unicode_ci",
}
