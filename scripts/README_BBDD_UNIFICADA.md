# Base de datos unificada — `bd_anim3d`

Documento de referencia de la migración desde el esquema antiguo
(`bd_anim3d_saltos`, dos tablas: `usuarios` + `saltos`) al esquema unificado
que comparten los módulos **salto** y **futbol**.

---

## 1. Resumen ejecutivo

- Una sola base de datos: **`bd_anim3d`**.
- Un único usuario MySQL para los dos backends (mismas credenciales).
- Tablas compartidas (`usuarios`, `sesiones`) + tabla base de gestos
  (`gestos`) con discriminador `modulo ENUM('salto','futbol')` y
  subtablas especializadas `gestos_salto` y `gestos_futbol`
  (table-per-class inheritance).
- Subordinadas comunes: `gestos_curvas`, `gestos_alertas` (1:N
  normalizada), `gestos_videos`.
- Vistas de compatibilidad **`v_saltos`** y **`v_golpeos`** que
  reproducen los nombres de columna históricos (`id_salto`,
  `fecha_golpeo`, `confianza`, etc.) para no romper consultas legadas.

---

## 2. Modelo de tablas

| Tabla            | Compartida | Propósito |
|------------------|:---------:|-----------|
| `usuarios`       | ✅ | Jugador (alias, nombre_completo, altura_m, peso_kg) |
| `sesiones`       | ✅ | Agrupación temporal de gestos por módulo |
| `gestos`         | ✅ | Tabla base de cualquier gesto (FK usuario, modulo, fecha) |
| `gestos_salto`   | salto  | Métricas específicas de salto (1:1 con `gestos`) |
| `gestos_futbol`  | futbol | Métricas específicas de golpeo (1:1 con `gestos`) |
| `gestos_curvas`  | ✅ | Series temporales por gesto (JSON) |
| `gestos_alertas` | ✅ | Alertas biomecánicas (1:N, sustituye `alertas_json`) |
| `gestos_videos`  | ✅ | Vídeos asociados (binario o ruta) |

Vistas:

- `v_saltos`  → JOIN `gestos` + `gestos_salto` con alias legacy.
- `v_golpeos` → JOIN `gestos` + `gestos_futbol` con `confianza_ia AS confianza`.

Diagrama relacional:

```
usuarios 1───* sesiones
   │
   └───* gestos *──1 sesiones (opcional)
          │
          ├──1 gestos_salto    (modulo='salto')
          ├──1 gestos_futbol   (modulo='futbol')
          ├──* gestos_curvas
          ├──* gestos_alertas
          └──* gestos_videos
```

---

## 3. Scripts SQL

| Archivo | Cuándo usarlo |
|---------|--------------|
| `scripts/init_db_unificada.sql` | BD limpia: crea `bd_anim3d` con todas las tablas + vistas |
| `scripts/migrate_to_unified.sql` | Migración desde `bd_anim3d_saltos` ya existente |
| `scripts/migrate_features_version.sql` | Añade `gestos_futbol.features_version` y recrea `v_golpeos`. Idempotente |
| `scripts/init_db.sql` | (LEGADO) esquema antiguo, conservado solo como referencia |

### 3.1 Ejecución desde PowerShell

PowerShell **no admite** la redirección `<` para `mysql.exe`. Usar
siempre `Get-Content … | mysql.exe`:

```powershell
$mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"

# A) Crear BD limpia
Get-Content scripts/init_db_unificada.sql -Raw | & $mysql -u root -p

# B) Backup previo a migrar
& $mysql -u root -p bd_anim3d_saltos --result-file=backup_pre_migracion.sql --routines --triggers

# C) Aplicar migración
Get-Content scripts/migrate_to_unified.sql -Raw | & $mysql -u root -p
```

---

## 4. Configuración de los backends

Archivo `.env` en la raíz del repo (UTF-8 **sin BOM**):

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=bd_anim3d
```

Defaults en código (por si falta `.env`):

- `modules/salto/backend/config.py`  → `DB_NAME=bd_anim3d`
- `modules/futbol/backend/config.py` → `DB_NAME=bd_anim3d`

> ⚠️ **Cuidado con variables de entorno cacheadas en la sesión de
> PowerShell**. `python-dotenv` no las sobrescribe. Si ves credenciales
> antiguas en logs:
>
> ```powershell
> Remove-Item Env:\DB_PASSWORD -ErrorAction SilentlyContinue
> Remove-Item Env:\DB_NAME    -ErrorAction SilentlyContinue
> ```

---

## 5. Cambios en código (alto nivel)

### Modelos

- `modules/salto/backend/models/salto_model.py` — reescrito.
  - Lectura via `v_saltos`; escritura en `gestos`+`gestos_salto`.
  - Curvas se guardan/leen desde `gestos_curvas` (JSON).
  - Vídeo se persiste con `INSERT … ON DUPLICATE KEY UPDATE`.
  - `eliminar()` cascada por `gestos`.
- `modules/futbol/backend/models/futbol_model.py` — reescrito.
  - Lectura via `v_golpeos`; alertas en `gestos_alertas`
    (`_insert_alertas` con `executemany`).
  - `_enum_pierna()` valida ENUM `{izquierda, derecha, desconocida}`.
- `modules/futbol/backend/models/usuarios_futbol_model.py` — proxy
  legacy sobre la tabla unificada `usuarios`. Expone los nombres
  antiguos (`nombre`, `id`).

### Controllers / API

- `modules/futbol/backend/app.py` — registra `usuarios_bp` (faltaba).
  Ahora `/api/usuarios` también está disponible en el módulo futbol.
- `modules/futbol/backend/controllers/usuarios_futbol_controller.py`
  (`/api/usuarios_futbol`) — añadida validación estricta de `altura_m`
  (obligatoria, rango 0.50–2.50 m) tanto en `POST` como en `PUT`.

### Frontend

- `integration/web/js/api_futbol.js` — helper
  `_validarAlturaObligatoria()` que se invoca en
  `crearUsuarioFutbol()` y `actualizarUsuarioFutbol()`. Lanza error
  legible antes de enviar la petición si `altura_m` está vacío o
  fuera de rango.

### UX `altura_m` obligatoria

Tres capas de defensa para que **nunca** se cree un jugador sin altura:

| Capa | Mensaje |
|------|---------|
| HTML5 `required` + JS (`registro.js`) | _“La altura debe estar entre 0.50 y 2.50 metros.”_ |
| Helper JS (`api_futbol.js`) | _“La altura es obligatoria. Indica un valor entre 0.50 y 2.50 metros.”_ |
| Backend nuevo (`usuario_controller.py`) | `400 Campos obligatorios: alias, nombre_completo, altura_m` |
| Backend legacy (`usuarios_futbol_controller.py`) | `400 La altura (altura_m) es obligatoria` |
| Modelo legacy (`usuarios_futbol_model.py`) | `ValueError("altura_m es obligatorio")` (ya no aplica default `1.70`) |

---

## 6. Verificación rápida

```powershell
# Activar venv
.\.venv\Scripts\Activate.ps1

# Smoke test conectividad + lectura
cd modules/futbol/backend
python -c "from dotenv import load_dotenv; load_dotenv('../../../.env'); `
from models.futbol_model import FutbolModel; `
from models.usuarios_futbol_model import UsuariosFutbolModel; `
from models.usuario_model import UsuarioModel; `
print('golpeos:', len(FutbolModel().obtener_todos())); `
print('usuarios_futbol:', len(UsuariosFutbolModel().obtener_todos())); `
print('usuarios:', len(UsuarioModel().obtener_todos()))"
cd ../../..
```

Resultado esperado: tres números coherentes y ningún error.

---

## 7. Rollback

Backup completo en raíz: `backup_pre_migracion_YYYYMMDD_HHMMSS.sql`.

```powershell
$mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
& $mysql -u root -p -e "DROP DATABASE bd_anim3d;"
Get-Content backup_pre_migracion_20260506_103613.sql -Raw | & $mysql -u root -p bd_anim3d_saltos
```

Y revertir en `.env`: `DB_NAME=bd_anim3d_saltos`.

---

## 8. Cambios del frontend (revisión post-merge)

Tras integrar el commit del compañero `74cd679` (registro futbol +
correcciones de registro salto), se realizó una revisión y limpieza:

### 8.1 Bugs corregidos

| # | Archivo | Bug | Fix |
|---|---------|-----|-----|
| 1 | `integration/web/js/registro.js` | `actualizarUsuario(id, alias, nombre, altura, peso)` enviaba un string como JSON; el backend respondía 400 y la edición desde `salto.html` no funcionaba | Llamada corregida a `actualizarUsuario(id, { alias, nombre_completo, altura_m, peso_kg })` (firma `(id, data)`) |
| 2 | `integration/web/js/registro.js` | `obtenerEdadTexto()` realmente pintaba la altura (mismatch con cabecera `<th>Altura</th>`) | Renombrada a `obtenerAlturaTexto()` y simplificada |

### 8.2 Mejoras profesionales

| # | Archivo | Antes | Ahora |
|---|---------|-------|-------|
| 1 | `integration/web/js/registro.js` | Apuntaba al backend de **futbol** (puerto 5002, `/api/usuarios_futbol`) mediante un bloque _fallback_ con `window.API_URL_FUTBOL_USERS` y `window.obtenerUsuariosPaginados` | Consume su backend nativo `getBackendBaseUrl()/api/usuarios` (salto, puerto 5001). Helper `_baseUsuarios()` y `obtenerUsuariosPaginados()` propio. Sin globals colgados de `window`. `salto.html` ya no requiere el backend de futbol arrancado para gestionar usuarios |
| 2 | `integration/web/js/registro.js` y `registro_futbol.js` | `pintarFilaUsuario()` llamaba a `setUsuarioActivo()` por cada fila coincidente con el ID activo: reescribía sessionStorage y emitía el evento `usuarioSeleccionCambio` decenas de veces por carga/scroll | La fila activa solo aplica clase CSS y guarda referencia en memoria (`usuarioActivoData`). `setUsuarioActivo()` queda reservado a eventos reales (login, click explícito, crear/editar) |
| 3 | `scripts/run_all.bat` | `CORS_ORIGINS=*` para los tres backends | Lista blanca explícita: `https://localhost:8443,https://127.0.0.1:8443,http://localhost:8080,http://127.0.0.1:8080` |

### 8.3 Cambios del compañero validados (sin tocar)

- `integration/web/js/api_salto.js` — `getUsuarioActivo()` defensivo
  contra valores corruptos en sessionStorage (parsea JSON, descarta
  `[object Object]`); coerciones `Number` antes de `formData.append('id_usuario', …)` en envíos a `/api/salto/analizar` y `/api/salto/video-anotado`.
- `integration/web/js/registro_futbol.js` — `crearUsuario`/`actualizarUsuario` aceptan ahora un objeto `data`; tabla con columnas alias/nombre/altura/peso; validación 0.50–2.50 m y 20–300 kg.
- `integration/web/futbol.html` — inputs altura/peso obligatorios + cache-busting `?v=20260506c`.
- `integration/web/css/style.css` — clase `.user-form-grid` para el formulario inline.
- `integration/web/js/futbol_videos.js` — soporta tanto `nombre_completo` como `nombre` legacy.
- `.env.example` — `DB_NAME=bd_anim3d`.

### 8.4 Validación funcional

Después de los fixes:

- `salto.html` → crear/editar/eliminar usuario funciona contra el
  backend de salto sin necesidad del backend de futbol.
- `futbol.html` → idéntico flujo contra el backend de futbol.
- Ambos comparten datos al apuntar a `bd_anim3d`.
- Tres capas de defensa para `altura_m` (HTML5 `required`, JS,
  controlador) impiden crear usuarios sin altura.

