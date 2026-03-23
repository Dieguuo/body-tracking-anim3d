# Módulo 2 — Cálculo de Salto (Vertical y Horizontal)

Parte del proyecto **proyecto-medicion**. Este módulo es autónomo: puede arrancarse, probarse y demostrarse sin depender del resto del proyecto.

Recibe un vídeo grabado desde un móvil, lo analiza fotograma a fotograma con **MediaPipe Pose** y calcula la distancia del salto (vertical u horizontal).

## Estructura

```
salto/
├── backend/                         ← Python MVC + Flask API
│   ├── app.py                       ← Entry point web (POST /api/salto/calcular)
│   ├── config.py                    ← Constantes centralizadas
│   ├── pose_landmarker_lite.task    ← Modelo MediaPipe descargado
│   ├── controllers/
│   │   └── salto_controller.py      ← Orquesta procesamiento + cálculo
│   ├── models/
│   │   └── video_processor.py       ← MediaPipe PoseLandmarker — extrae pies por frame
│   ├── services/
│   │   └── calculo_service.py       ← Fórmulas: vertical (híbrido cinemática + calibración) + horizontal (calibración)
│   └── utils/                       # Reservado
│   └── test_frontend.html           ← Página de prueba temporal (servida en /)
├── mobile/                          # Reservado — cliente móvil (Fase 2)
└── README.md
```

## Cómo ejecutar

```powershell
# Desde la raíz del proyecto (activar venv primero)

# 1. Backend
cd modules\salto\backend
python app.py
```

Backend en `http://localhost:5001/api/salto/calcular`
Página de prueba en `http://localhost:5001` (temporal, para validar el backend)

## Endpoint

```
POST /api/salto/calcular
Content-Type: multipart/form-data
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `video` | archivo | Siempre | Vídeo .mp4 / .webm / .avi / .mov |
| `tipo_salto` | string | Siempre | `"vertical"` o `"horizontal"` |
| `altura_real_m` | float | Siempre | Altura real del usuario en metros (ej. `1.75`). Necesaria para calibrar la conversión píxel → metro. |

**Respuesta JSON:**

```json
{
  "tipo_salto": "vertical",
  "distancia": 34.12,
  "unidad": "cm",
  "confianza": 0.98,
  "frame_despegue": 42,
  "frame_aterrizaje": 58,
  "tiempo_vuelo_s": 0.5333,
  "metodo": "hibrido",
  "dist_por_pixeles": 36.45,
  "dist_por_cinematica": 30.67
}
```

> Los campos `metodo`, `dist_por_pixeles` y `dist_por_cinematica` solo aparecen en salto vertical.

## Arquitectura interna

```
Vídeo grabado (.mp4 / .webm)
      │  Upload via POST
      ▼
VideoProcessor        (Model)       — MediaPipe PoseLandmarker, extrae pies por frame
      │
CalculoService        (Service)     — fórmulas de cinemática y calibración
      │
SaltoController       (Controller)  — orquesta modelo + servicio
      │
Flask app.py          (API)         — POST /api/salto/calcular → JSON
```

## Algoritmos

### Salto vertical — Método híbrido (cinemática + píxeles calibrados)

Se detecta el despegue y aterrizaje mediante la **derivada de la coordenada Y del talón** (cambio brusco = transición suelo/aire).

Se combinan dos métodos independientes:

**1. Cinemática (tiempo de vuelo):**

```
h = (1/8) × g × t²
```

Donde `g = 9.81 m/s²` y `t` es el tiempo en el aire en segundos.

**2. Píxeles calibrados (desplazamiento vertical):**

Se calibra la escala píxel/metro usando la altura real del usuario y se mide el desplazamiento vertical máximo de los pies:

```
S = Hr / Hp           (metros por píxel)
h = (Y_suelo - Y_pico) × S
```

Si ambos métodos están disponibles, el resultado final es un **promedio ponderado** (60 % píxeles, 40 % cinemática). Si solo uno funciona, se usa ese.

### Salto horizontal — Proyección geométrica

Se calibra la escala píxel/metro usando la altura real del usuario:

```
S = Hr / Hp          (metros por píxel)
D_real = Dp × S      (distancia real en metros)
```

Donde `Hr` = altura real (m), `Hp` = altura en píxeles, `Dp` = desplazamiento horizontal en píxeles.

## Estado — Fase 2

- [x] Backend MVC funcional
- [x] Procesamiento de vídeo con MediaPipe PoseLandmarker (Tasks API)
- [x] Algoritmo de salto vertical (tiempo de vuelo)
- [x] Algoritmo de salto horizontal (calibración geométrica)
- [x] API REST expuesta (`POST /api/salto/calcular`)
- [x] Página de prueba temporal servida desde Flask (`test_frontend.html`)
- [ ] Cliente móvil para grabar y enviar vídeo (`mobile/`)
- [ ] Frontend web definitivo del módulo (`frontend/`)
- [ ] Implementar `modules/salto/backend/`
- [ ] Implementar `modules/salto/mobile/`
