# Scripts

Script de arranque para todo el proyecto.

## Arranque completo

| Script | Plataforma | Qué hace |
|--------|------------|----------|
| `run_all.bat` | Windows | Arranca los dos backends + el frontend web en ventanas separadas |

### Servicios que levanta

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| Backend Salto | 5001 | `modules/salto/backend/app.py` — API de análisis de saltos |
| Backend Sensor | 5000 | `modules/sensor/backend/app.py` — API del sensor Arduino |
| Frontend Web | 8080 | `integration/web/` servido con `python -m http.server` |

### Uso

Doble clic en `run_all.bat` o desde terminal:

```powershell
scripts\run_all.bat
```

Después abrir `http://localhost:8080` en el navegador. Cerrar las ventanas de cmd para detener los servicios.
