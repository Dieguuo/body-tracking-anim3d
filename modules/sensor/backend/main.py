from config import DEFAULT_BAUD_RATE
from controllers.distancia_controller import DistanciaController

if __name__ == "__main__":
    # Cambia baud_rate en config.py si tu Arduino usa otro valor en Serial.begin()
    controller = DistanciaController(baud_rate=DEFAULT_BAUD_RATE)
    controller.iniciar()
