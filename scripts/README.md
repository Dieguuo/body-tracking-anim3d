# Scripts

Script de arranque para todo el proyecto.

> 🗄️ **Base de datos unificada**: ver [`README_BBDD_UNIFICADA.md`](README_BBDD_UNIFICADA.md)
> para el esquema compartido `bd_anim3d`, scripts SQL (`init_db_unificada.sql`,
> `migrate_to_unified.sql`, `migrate_features_version.sql`) y procedimiento de
> migración / rollback.

### Scripts SQL

| Script | Propósito |
|--------|-----------|
| `init_db.sql` | Esquema legacy (sólo módulo salto, conservado por compatibilidad) |
| `init_db_unificada.sql` | Esquema unificado `bd_anim3d` (salto + futbol) |
| `migrate_to_unified.sql` | Migración desde `bd_anim3d_saltos` legacy → `bd_anim3d` |
| `migrate_features_version.sql` | Añade `gestos_futbol.features_version` a una BD existente (idempotente) |

## Arranque completo

| Script | Plataforma | Qué hace |
|--------|------------|----------|
| `run_all.bat` | Windows | Arranca los dos backends + el frontend web en ventanas separadas |

### Servicios que levanta

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| Backend Salto | 5001 | `modules/salto/backend/app.py` — API de análisis de saltos |
| Backend Sensor | 5000 | `modules/sensor/backend/app.py` — API del sensor Arduino |
| Frontend Web HTTPS | 8443 | `integration/web/` servido con `scripts/https_server.py` |

### Uso

Doble clic en `run_all.bat` o desde terminal:

```powershell
scripts\run_all.bat
```

Después abrir `https://localhost:8443` en el navegador. Cerrar las ventanas de cmd para detener los servicios.

## Modo HTTP (compatibilidad)

Aunque el modo recomendado es HTTPS, se mantiene soporte de arranque manual del frontend en HTTP:

```powershell
cd integration\web
python -m http.server 8080
```

Abrir:

```text
http://localhost:8080
```

Nota: los backends arrancan en HTTPS automáticamente si existen certificados en `certs/`. Para un entorno totalmente HTTP, arranca sin esos certificados.

## Acceso desde movil (LAN)

1. Genera o regenera certificado con tu IP actual:

```powershell
.venv\Scripts\python.exe scripts\generate_cert.py
```

2. Arranca todo:

```powershell
scripts\run_all.bat
```

3. Desde el movil, abre:

```text
https://TU_IP_LAN:8443
```

Acepta el aviso de certificado local en el navegador del movil.
