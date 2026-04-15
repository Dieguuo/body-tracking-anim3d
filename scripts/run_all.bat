@echo off
REM ══════════════════════════════════════════════════════
REM  Arranca todo el proyecto con un solo doble-clic:
REM    - Backend Salto    (puerto 5001)
REM    - Backend Sensor   (puerto 5000)  [opcional]
REM    - Frontend web     (HTTPS puerto 8443)
REM ══════════════════════════════════════════════════════

cd /d "%~dp0.."
set PROJECT_ROOT=%cd%
set VENV_PYTHON=%PROJECT_ROOT%\.venv\Scripts\python.exe

echo.
echo  === Jump Tracker - Comprobaciones previas ===
echo.

REM ── Comprobar que el entorno virtual existe ──
if not exist "%VENV_PYTHON%" (
    echo  [ERROR] No se encontro el entorno virtual.
    echo          Ejecuta:  python -m venv .venv
    echo          Luego:    .\.venv\Scripts\activate ^&^& pip install -r requirements.txt
    pause
    exit /b 1
)

REM ── Comprobar que .env existe ──
if not exist "%PROJECT_ROOT%\.env" (
    if not exist "%PROJECT_ROOT%\modules\salto\backend\.env" (
        echo  [ERROR] Falta el archivo .env con la configuracion de base de datos.
        echo          Se admite en una de estas rutas:
        echo            - %PROJECT_ROOT%\.env
        echo            - %PROJECT_ROOT%\modules\salto\backend\.env
        echo          Puedes copiar la plantilla con:
        echo            copy .env.example .env
        pause
        exit /b 1
    )
)

REM ── Comprobar dependencias criticas ──
"%VENV_PYTHON%" -c "import flask, cv2, mediapipe, mysql.connector, dotenv" 2>nul
if errorlevel 1 (
    echo  [AVISO] Faltan dependencias. Instalando...
    "%VENV_PYTHON%" -m pip install -r "%PROJECT_ROOT%\requirements.txt" --quiet
    if errorlevel 1 (
        echo  [ERROR] No se pudieron instalar las dependencias.
        pause
        exit /b 1
    )
    echo  [OK] Dependencias instaladas.
)

echo.
echo  === Jump Tracker - Iniciando servicios ===
echo.

REM 1) Backend del salto (puerto 5001)
echo  [1/3] Backend Salto (puerto 5001)...
start "Backend Salto" cmd /k "cd /d %PROJECT_ROOT%\modules\salto\backend && set CORS_ORIGINS=https://localhost:8443,https://127.0.0.1:8443,http://localhost:8080,http://127.0.0.1:8080 && "%VENV_PYTHON%" app.py"

REM 2) Backend del sensor (puerto 5000) — no falla si no hay Arduino
echo  [2/3] Backend Sensor (puerto 5000)...
start "Backend Sensor" cmd /k "cd /d %PROJECT_ROOT%\modules\sensor\backend && set CORS_ORIGINS=https://localhost:8443,https://127.0.0.1:8443,http://localhost:8080,http://127.0.0.1:8080 && "%VENV_PYTHON%" app.py"

REM 3) Frontend web HTTPS (puerto 8443)
echo  [3/3] Frontend web HTTPS (puerto 8443)...
start "Frontend Web HTTPS" cmd /k "cd /d %PROJECT_ROOT% && "%VENV_PYTHON%" scripts\https_server.py"

echo.
echo  Todo listo. Abre https://localhost:8443 en el navegador.
echo  Cierra las ventanas de cmd para detener los servicios.
echo.
pause
