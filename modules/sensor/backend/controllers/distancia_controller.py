import serial
import threading

from config import DEFAULT_BAUD_RATE
from models.sensor_serial import Medicion, SensorSerial
from views.consola_view import ConsolaView


class DistanciaController:
    """
    CONTROLLER — Orquesta el modelo y la vista.
    Contiene la lógica de flujo: selección de puerto, bucle de lectura y manejo de errores.
    """

    def __init__(self, baud_rate: int = DEFAULT_BAUD_RATE):
        self.baud_rate = baud_rate
        self.view = ConsolaView()
        self._ultima_medicion: Medicion | None = None
        self._lock = threading.Lock()
        self._sensor: SensorSerial | None = None

    def seleccionar_puerto(self) -> str | None:
        """Lista puertos y devuelve el elegido, o None si no hay ninguno."""
        puertos = SensorSerial.listar_puertos()
        self.view.mostrar_puertos(puertos)

        if not puertos:
            return None

        if len(puertos) == 1:
            puerto = puertos[0][0]
            self.view.mostrar_info(f"Usando automáticamente: {puerto}")
            return puerto

        return self.view.pedir_puerto()

    def get_ultima_medicion(self) -> Medicion | None:
        """Devuelve la última medición de forma thread-safe."""
        with self._lock:
            return self._ultima_medicion

    def _bucle_lectura(self):
        """Hilo daemon: lee continuamente del serial y actualiza la última medición."""
        try:
            while True:
                try:
                    medicion = self._sensor.leer_linea()
                    if medicion:
                        with self._lock:
                            self._ultima_medicion = medicion
                except (serial.SerialException, OSError):
                    self.view.mostrar_error("Conexión serial perdida.")
                    break
        finally:
            self._sensor.desconectar()

    def iniciar_en_segundo_plano(self) -> bool:
        """
        Selecciona puerto, conecta el sensor y lanza el lector en un hilo daemon.
        Devuelve True si todo fue bien, False si no hay puerto o falla la conexión.
        """
        puerto = self.seleccionar_puerto()
        if not puerto:
            return False

        self._sensor = SensorSerial(puerto, self.baud_rate)
        try:
            self._sensor.conectar()
        except serial.SerialException as e:
            self.view.mostrar_error(str(e))
            return False

        hilo = threading.Thread(target=self._bucle_lectura, daemon=True)
        hilo.start()
        self.view.mostrar_info(
            f"Lector en segundo plano iniciado en {puerto} a {self.baud_rate} baudios."
        )
        return True

    def iniciar(self):
        """Punto de arranque principal del controlador."""
        puerto = self.seleccionar_puerto()
        if not puerto:
            return

        self._sensor = SensorSerial(puerto, self.baud_rate)
        try:
            self._sensor.conectar()
            self.view.mostrar_info(
                f"Conectado a {puerto} a {self.baud_rate} baudios. Leyendo datos...\n"
            )
            while True:
                medicion = self._sensor.leer_linea()
                if medicion:
                    with self._lock:
                        self._ultima_medicion = medicion
                    self.view.mostrar_medicion(medicion)

        except serial.SerialException as e:
            self.view.mostrar_error(str(e))
        except KeyboardInterrupt:
            self.view.mostrar_info("Lectura detenida por el usuario.")
        finally:
            self._sensor.desconectar()
