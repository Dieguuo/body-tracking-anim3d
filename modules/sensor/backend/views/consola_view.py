from models.sensor_serial import Medicion


class ConsolaView:
    """
    VIEW — Responsable únicamente de mostrar información por consola.
    No contiene lógica de negocio ni accede al serial.
    """

    def mostrar_puertos(self, puertos: list[tuple[str, str]]):
        if not puertos:
            print("No se encontraron puertos COM disponibles.")
            return
        print("Puertos disponibles:")
        for dispositivo, descripcion in puertos:
            print(f"  {dispositivo} - {descripcion}")

    def mostrar_medicion(self, medicion: Medicion):
        if medicion.valor is not None:
            print(f"Distancia: {medicion.valor:.2f} cm  (raw: '{medicion.raw}')")
        else:
            print(f"Dato recibido: {medicion.raw}")

    def mostrar_error(self, mensaje: str):
        print(f"[ERROR] {mensaje}")

    def mostrar_info(self, mensaje: str):
        print(f"[INFO] {mensaje}")

    def pedir_puerto(self) -> str:
        return input("\nEscribe el puerto a usar (ej. COM3): ").strip()
