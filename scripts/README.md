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
| Frontend Web HTTPS | 8443 | `integration/web/` servido con `scripts/https_server.py` |

### Uso

Doble clic en `run_all.bat` o desde terminal:

```powershell
scripts\run_all.bat
```

Después abrir `https://localhost:8443` en el navegador. Cerrar las ventanas de cmd para detener los servicios.

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
