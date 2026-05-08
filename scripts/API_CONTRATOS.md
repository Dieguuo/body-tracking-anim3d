# Guia de contratos API compartidos — Salto y Futbol

Fecha: 2026-05-06
Version: 1.0

---

## Principios

- `/api/usuarios` es la ruta canonica para usuarios en ambos modulos.
- Ambos backends comparten la misma base de datos (`bd_anim3d`).
- Un usuario creado en salto (puerto 5001) es visible inmediatamente en futbol (5002) y viceversa.
- Las rutas `/api/usuarios_futbol/<id>/...` estan deprecadas (Sunset: 2026-08-01).

---

## Endpoints de usuarios (identicos en salto :5001 y futbol :5002)

### GET /api/usuarios
Lista todos los usuarios. Soporta paginado.

Query params:
- `paginado=1` — activa paginado
- `limit` (int, default 20)
- `offset` (int, default 0)
- `search` (string) — filtra por alias, nombre o altura

Respuesta sin paginado:
```json
[{"id_usuario": 1, "alias": "jdoe", "nombre_completo": "John Doe", "altura_m": 1.78, "peso_kg": 75.0}]
```

Respuesta con paginado:
```json
{
  "items": [...],
  "total": 42,
  "limit": 20,
  "offset": 0,
  "has_more": true
}
```

### POST /api/usuarios
Crea un usuario.

Body JSON obligatorio:
```json
{"alias": "jdoe", "nombre_completo": "John Doe", "altura_m": 1.78}
```
Campo opcional: `"peso_kg": 75.0`

Respuesta 201:
```json
{"id_usuario": 9, "alias": "jdoe", "nombre_completo": "John Doe", "altura_m": 1.78, "peso_kg": 75.0}
```

Errores:
- 400 — campo obligatorio faltante o alias/altura invalidos
- 409 — alias ya existe

### GET /api/usuarios/<id>
Obtiene un usuario por id.

Respuesta 200:
```json
{"id_usuario": 9, "alias": "jdoe", "nombre_completo": "John Doe", "altura_m": 1.78, "peso_kg": 75.0}
```
Error: 404 `{"error": "Usuario no encontrado"}`

### PUT /api/usuarios/<id>
Actualiza un usuario.

Body JSON (campos editables): `alias`, `nombre_completo`, `altura_m`, `peso_kg`

Respuesta 200: usuario actualizado completo
Errores: 400, 404, 409

### DELETE /api/usuarios/<id>
Elimina un usuario.

Respuesta 200: `{"mensaje": "Usuario eliminado"}`
Error: 404

---

## Endpoints de analitica — solo futbol (:5002)

Todos requieren un `id_usuario` valido. Si no hay golpeos, devuelven estructura vacia con `numero_golpeos: 0`.

### GET /api/usuarios/<id>/fatiga
Fatiga intra-sesion.

Query params:
- `metrica` (default: `velocidad_pie_ms`) — cualquier campo numerico de golpeo

Respuesta:
```json
{
  "fatiga_significativa": false,
  "caida_porcentual": 5.2,
  "pendiente": -0.003,
  "numero_golpeos": 8,
  "sesion": {"inicio": "2026-05-06T10:00:00", "fin": "2026-05-06T10:30:00"}
}
```

### GET /api/usuarios/<id>/tendencia
Tendencia historica.

Query params:
- `metrica` (default: `velocidad_pie_ms`)
- `semanas` (float, default 4)

Respuesta:
```json
{
  "estado": "mejora",
  "pendiente": 0.012,
  "r2": 0.85,
  "prediccion_4_semanas": 14.5,
  "unidad": "m/s",
  "numero_golpeos": 32,
  "historial": [{"fecha": "2026-04-01", "valor": 12.1, "tendencia_valor": 12.0}, ...]
}
```

### GET /api/usuarios/<id>/comparativa
Ultimos N golpeos para comparativa.

Query params: `n` (int, default 4)

Respuesta:
```json
{
  "golpeos": [
    {
      "fecha": "2026-05-06T10:00:00",
      "velocidad_pie_ms": 13.2,
      "angulo_cadera_deg": 42.1,
      "angulo_rodilla_deg": 110.0,
      "angulo_tobillo_deg": 85.0,
      "estabilidad_tronco": 0.92,
      "clasificacion": "tecnica_estable"
    }
  ]
}
```

### GET /api/usuarios/<id>/alertas_tendencia
Alertas basadas en tendencia historica.

Respuesta:
```json
{
  "alertas": [
    {"codigo": "tendencia_negativa", "mensaje": "Velocidad en caida desde hace 3 sesiones.", "severidad": "warn"}
  ]
}
```

### GET /api/usuarios/<id>/analitica_avanzada
Bloque completo de analitica avanzada.

Query params:
- `metrica` (default: `velocidad_pie_ms`)
- `global=1` — incluye ranking global entre todos los usuarios

Respuesta (estructura resumida):
```json
{
  "comparativa_sesiones": {
    "sesiones": [{"media": 12.1, "n": 4}, {"media": 13.0, "n": 4}],
    "unidad": "m/s"
  },
  "correlaciones": {
    "vel_estabilidad": {"corr": 0.72, "puntos": [{"velocidad": 12.1, "estabilidad": 0.9}, ...]},
    "cadera_estabilidad": {"corr": -0.31}
  },
  "estancamiento_mejora": {
    "suficientes_datos": true,
    "mejora_significativa": false,
    "estancado": true,
    "delta": 0.1,
    "delta_pct": 0.8
  },
  "prediccion_multivariable": {
    "suficientes_datos": true,
    "prediccion_4_semanas": 14.2,
    "r2": 0.81,
    "muestras": 12
  },
  "rankings": {
    "top_sesiones": [{"alias": "jdoe", "media_velocidad_pie_ms": 15.1}]
  }
}
```

---

## Endpoints de analitica — solo salto (:5001)

Misma estructura de rutas pero adaptadas a metricas de salto:
- `GET /api/usuarios/<id>/fatiga` — metrica por defecto: `distancia`
- `GET /api/usuarios/<id>/tendencia` — incluye historial de distancia y potencia
- `GET /api/usuarios/<id>/alertas_tendencia`
- `GET /api/usuarios/<id>/analitica_avanzada` — incluye `comparativa_tipos` (vertical vs horizontal)

---

## Campos comunes de usuario

| Campo            | Tipo   | Obligatorio | Descripcion                    |
|------------------|--------|-------------|-------------------------------|
| `alias`          | string | Si          | Identificador corto, unico    |
| `nombre_completo`| string | Si          | Nombre y apellidos            |
| `altura_m`       | float  | Si          | Entre 0.50 y 2.50             |
| `peso_kg`        | float  | No          | Entre 20 y 300                |

---

## Codigos de error comunes

| Codigo | Significado                                      |
|--------|--------------------------------------------------|
| 400    | Parametro obligatorio ausente o valor invalido   |
| 404    | Recurso no encontrado                            |
| 409    | Conflicto (alias duplicado)                      |
| 500    | Error interno del servidor (ver logs backend)    |

---

## Rutas legacy deprecadas (solo futbol)

Sunset: **2026-08-01**. Las respuestas incluyen cabeceras:
- `Deprecation: version="2026-08-01"`
- `Sunset: Sat, 01 Aug 2026 00:00:00 GMT`

| Ruta legacy                               | Sustituida por                          |
|-------------------------------------------|-----------------------------------------|
| `GET /api/usuarios_futbol/<id>/fatiga`    | `GET /api/usuarios/<id>/fatiga`         |
| `GET /api/usuarios_futbol/<id>/tendencia` | `GET /api/usuarios/<id>/tendencia`      |
| `GET /api/usuarios_futbol/<id>/comparativa` | `GET /api/usuarios/<id>/comparativa`  |

---

## Checklist de regresion manual (previo a release)

- [ ] Crear usuario desde futbol — visible en salto
- [ ] Crear usuario desde salto — visible en futbol
- [ ] Editar usuario en cualquier modulo — reflejado en el otro
- [ ] Eliminar usuario — sin referencias huerfanas en golpeos/saltos
- [ ] Analizar video en futbol con usuario activo — guarda golpeo sin error
- [ ] Analizar video en salto con usuario activo — guarda salto sin error
- [ ] Panel analitico futbol carga tras seleccionar usuario
- [ ] Panel analitico salto carga tras seleccionar usuario
- [ ] Endpoints de analitica avanzada responden 200
- [ ] ID invalido devuelve 404 JSON (no HTML)
- [ ] CORS correcto para localhost:8443
- [ ] Ejecutar `scripts/smoke_test_paridad.ps1` — 14/14 PASS
