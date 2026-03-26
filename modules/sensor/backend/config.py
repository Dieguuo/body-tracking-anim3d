import os

DEFAULT_BAUD_RATE: int = 9600
SERIAL_TIMEOUT: int = 2
FLASK_PORT: int = int(os.getenv("SENSOR_PORT", "5000"))

# Orígenes permitidos para CORS
CORS_ORIGINS: list[str] = os.getenv(
    "CORS_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080"
).split(",")
