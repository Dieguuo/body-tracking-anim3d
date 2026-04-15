# Checklist de validacion funcional completa (vertical/horizontal)

Fecha: 2026-04-13

## Objetivo

Validar que el modulo de salto funciona en todos los escenarios:
- Vertical y horizontal.
- Tiempo real y video de galeria.
- Guardando video en BD y sin guardarlo.
- Con datos base, biomecanica, interpretacion y landmarks 2D/3D.

## Precondiciones

1. Ejecutar:

```powershell
scripts\run_all.bat
```

2. Abrir:
- https://localhost:8443

3. Seleccionar usuario activo en salto.html.

## Matriz de pruebas

### Caso A — Tiempo real vertical, guardar video = NO

- Modo: individual
- Tipo: vertical
- Opcion guardar video: no
- Ejecutar salto

Esperado:
- Distancia visible
- Confianza visible
- Tiempo vuelo visible
- F. despegue visible
- F. aterrizaje visible
- Estabilidad visible
- Clasificacion visible
- Panel biomecanica (si hay datos de aterrizaje)
- Landmarks 33: slider + vista 2D + vista 3D

### Caso B — Tiempo real vertical, guardar video = SI

Mismos checks que Caso A y ademas:
- Respuesta debe incluir indicador de video guardado cuando aplique.

### Caso C — Tiempo real horizontal, guardar video = NO

Mismos checks que Caso A.

### Caso D — Tiempo real horizontal, guardar video = SI

Mismos checks que Caso B.

### Caso E — Galeria vertical

- Subir video vertical desde galeria

Esperado:
- Mismos checks de datos base + paneles + landmarks.

### Caso F — Galeria horizontal

- Subir video horizontal desde galeria

Esperado:
- Mismos checks de datos base + paneles + landmarks.

## Verificacion de API recomendada

Para un salto valido, la respuesta de /api/salto/calcular debe contener como minimo:
- distancia
- confianza
- frame_despegue
- frame_aterrizaje
- tiempo_vuelo_s
- estabilidad_aterrizaje (numerico)
- estabilidad_detalle (objeto o null)
- clasificacion
- alertas (array)
- observaciones (array)
- landmarks_frames (array cuando incluir_landmarks=true)

## Notas de diagnostico

- Si falta 3D en un salto antiguo:
  - puede no tener landmarks persistidos historicamente.
- Si en un intento puntual no hay biomecanica:
  - revisar deteccion de aterrizaje (frames validos insuficientes).
- Si no aparecen datos base:
  - revisar que no haya error JS en consola y que la respuesta JSON incluya campos base.
