# Sketch Arduino — Sensor de Distancia HC-SR04

## Conexión

| Pin HC-SR04 | Pin Arduino |
|-------------|-------------|
| VCC         | 5V          |
| GND         | GND         |
| TRIG        | 9           |
| ECHO        | 10          |

## Comportamiento

- Realiza 5 lecturas por ciclo y calcula la media.
- Filtra valores fuera del rango válido (2 – 400 cm).
- Envía por serial a **9600 baudios** cada 500 ms con el formato:
  ```
  Distancia: 23.45 cm
  ```

## Cargar el sketch

Abre `sensor_distancia.ino` en el IDE de Arduino y sube el programa al dispositivo.
