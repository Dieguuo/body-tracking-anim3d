import os

DEFAULT_BAUD_RATE: int = 9600
SERIAL_TIMEOUT: int = 2
FLASK_PORT: int = int(os.getenv("SENSOR_PORT", "5000"))

# Orígenes permitidos para CORS.
# Usa "*" para entorno flexible; también admite lista separada por comas.
_cors_origins_raw = os.getenv("CORS_ORIGINS", "*").strip()
if _cors_origins_raw == "*":
    CORS_ORIGINS = "*"
else:
    CORS_ORIGINS = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]
