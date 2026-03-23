# ── Constantes del módulo salto ──

FLASK_PORT: int = 5001

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

# Carpeta temporal para vídeos subidos
UPLOAD_FOLDER: str = "uploads"

# Extensiones de vídeo permitidas
EXTENSIONES_PERMITIDAS: set = {".mp4", ".webm", ".avi", ".mov"}
