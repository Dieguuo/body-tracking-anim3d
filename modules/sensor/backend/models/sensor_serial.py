import re
import serial
import serial.tools.list_ports
from dataclasses import dataclass, field
from datetime import datetime, timezone

from config import DEFAULT_BAUD_RATE, SERIAL_TIMEOUT


@dataclass
class Medicion:
    """Representa una medición de distancia recibida desde el Arduino."""
    raw: str                          # Línea de texto tal como llegó
    valor: float | None               # Valor numérico extraído (None si no se pudo parsear)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class SensorSerial:
    """
    MODEL — Gestiona la conexión serial con el Arduino y la lectura de datos.
    No sabe nada de cómo se muestran los datos.
    """

    def __init__(self, puerto: str, baud_rate: int = DEFAULT_BAUD_RATE, timeout: int = SERIAL_TIMEOUT):
        self.puerto = puerto
        self.baud_rate = baud_rate
        self.timeout = timeout
        self._conexion: serial.Serial | None = None

    @staticmethod
    def listar_puertos() -> list[tuple[str, str]]:
        """Devuelve una lista de (device, description) de puertos COM disponibles."""
        return [(p.device, p.description) for p in serial.tools.list_ports.comports()]

    def conectar(self):
        self._conexion = serial.Serial(self.puerto, self.baud_rate, timeout=self.timeout)

    def desconectar(self):
        if self._conexion and self._conexion.is_open:
            self._conexion.close()

    def leer_linea(self) -> Medicion | None:
        """
        Lee una línea del puerto serial y la devuelve como Medicion.
        Intenta extraer el valor numérico; si no puede, valor=None.
        Devuelve None si la línea está vacía.
        """
        if not self._conexion or not self._conexion.is_open:
            return None

        linea = self._conexion.readline().decode("utf-8", errors="replace").strip()
        if not linea:
            return None

        # Intentar parsear directo (ej. "23.45")
        try:
            valor = float(linea)
        except ValueError:
            # Formato con texto (ej. "Distancia: 23.45 cm")
            match = re.search(r"[-+]?\d*\.?\d+", linea)
            valor = float(match.group()) if match else None

        return Medicion(raw=linea, valor=valor, timestamp=datetime.now(timezone.utc))
