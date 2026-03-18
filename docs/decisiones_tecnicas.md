# Decisiones técnicas

## Hilo daemon para lectura serial

El bucle de lectura del Arduino corre en un `threading.Thread(daemon=True)`.  
Esto permite que Flask ocupe el hilo principal sin bloquear la lectura serial.  
El hilo daemon se termina automáticamente al cerrar el proceso.

## `threading.Lock` para estado compartido

`_ultima_medicion` es escrita por el hilo de lectura y leída por Flask en threads  
separados. El lock garantiza que nunca se lee un estado parcialmente escrito.

## `debug=False` en Flask

El modo debug de Flask relanza el proceso con un reloader, destruyendo el hilo daemon  
antes de que pueda leer datos. Por eso se fuerza `debug=False`.

## Parseo con regex en lugar de `float(linea)`

El Arduino puede enviar `"Distancia: 23.45 cm"` o simplemente `"23.45"`.  
`re.search(r"[-+]?\d*\.?\d+", linea)` cubre ambos casos sin cambiar el sketch.

## MVC estricto

- El **modelo** (`sensor_serial.py`) no sabe nada de vistas ni de HTTP.  
- La **vista** (`consola_view.py`) solo imprime; no accede al serial.  
- El **controlador** orquesta ambos y es el único que conoce el flujo.

## Estructura modular (`modules/<nombre>/`)

Cada funcionalidad (sensor, salto, futuros) vive en su propia carpeta dentro  
de `modules/`, con `arduino/`, `backend/` y `frontend/` propios. Cada módulo  
puede arrancarse y probarse de forma autónoma sin depender del resto.

`integration/` reúne los módulos en una única interfaz web (Fase 3).
