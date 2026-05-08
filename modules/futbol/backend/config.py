# Constantes del modulo futbol

import os

FLASK_PORT: int = int(os.getenv("FUTBOL_PORT", "5002"))

# ─────────────────────────────────────────────────────────────
# Versionado de features (esquema de métricas extraídas por gesto)
# Se persiste en gestos_futbol.features_version para permitir
# análisis comparativos coherentes cuando se cambien fórmulas o
# se añadan nuevas métricas. Incrementar cuando:
#   - cambien fórmulas de score / umbrales por defecto
#   - se añadan/quiten métricas en SCORE_PESOS_GOLPEO o RANGOS
#   - cambie la lógica de clasificación
# ─────────────────────────────────────────────────────────────
FEATURES_VERSION: str = os.getenv("FUTBOL_FEATURES_VERSION", "v1")

_cors_origins_raw = os.getenv("CORS_ORIGINS", "*").strip()
if _cors_origins_raw == "*":
    CORS_ORIGINS = "*"
else:
    CORS_ORIGINS = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]

UPLOAD_FOLDER: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
EXTENSIONES_PERMITIDAS: set = {".mp4", ".webm", ".avi", ".mov"}
MAX_UPLOAD_MB: int = 100

MIN_DETECTION_CONFIDENCE: float = 0.5
MIN_TRACKING_CONFIDENCE: float = 0.5

# Ruta al modelo de MediaPipe.
# Por defecto se reutiliza el modelo del modulo salto.
MODEL_PATH: str = os.getenv(
    "FUTBOL_MODEL_PATH",
    os.path.normpath(
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "..",
            "modules",
            "salto",
            "backend",
            "pose_landmarker_lite.task",
        )
    ),
)

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
    "database": os.getenv("DB_NAME", "bd_anim3d"),
    "charset": "utf8mb4",
    "collation": "utf8mb4_unicode_ci",
}

# ─────────────────────────────────────────────────────────────
# Score compuesto de ejecución de tiro (0..100)
# Pesos configurables vía variables de entorno (prefijo SCORE_).
# La suma de pesos debe ser 1.0; se normaliza automáticamente.
# ─────────────────────────────────────────────────────────────

SCORE_PESOS_GOLPEO: dict[str, float] = {
    "velocidad_pie_ms":   float(os.getenv("SCORE_PESO_VELOCIDAD",   "0.40")),
    "estabilidad_tronco": float(os.getenv("SCORE_PESO_ESTABILIDAD", "0.25")),
    "confianza":          float(os.getenv("SCORE_PESO_CONFIANZA",   "0.20")),
    "angulo_cadera_deg":  float(os.getenv("SCORE_PESO_CADERA",      "0.15")),
}

# Rangos de referencia para normalización de cada métrica (min, max óptimo).
SCORE_RANGOS_GOLPEO: dict[str, tuple[float, float]] = {
    "velocidad_pie_ms":   (2.0, 18.0),   # m/s — 2 muy lento, 18 élite
    "estabilidad_tronco": (30.0, 100.0),  # score 0..100 (igual que calculo_service)
    "confianza":          (0.5, 1.0),    # índice MediaPipe 0..1
    "angulo_cadera_deg":  (90.0, 160.0), # °  — rango técnico aceptable
}

# ─────────────────────────────────────────────────────────────
# Clasificaciones de ejecución (enum estable)
# Usadas como valor del campo `clasificacion` en gestos_futbol.
# ─────────────────────────────────────────────────────────────

CLASIFICACIONES_GOLPEO: tuple[str, ...] = (
    "tecnica_estable",   # ejecución correcta sin alertas
    "potencia_baja",     # velocidad del pie por debajo del umbral esperado
    "inestabilidad",     # estabilidad de tronco insuficiente
    "riesgo_lesion",     # ángulo articular fuera de rango seguro
    "sin_clasificar",    # datos insuficientes para determinar categoría
)

UMBRAL_VELOCIDAD_BAJA_MS: float = float(os.getenv("UMBRAL_VELOCIDAD_BAJA", "5.0"))
UMBRAL_ESTABILIDAD_BAJA: float = float(os.getenv("UMBRAL_ESTABILIDAD_BAJA", "0.50"))
UMBRAL_ANGULO_RIESGO_DEG: float = float(os.getenv("UMBRAL_ANGULO_RIESGO", "75.0"))
