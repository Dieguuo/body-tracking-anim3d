@echo off
REM ══════════════════════════════════════════════════════
REM  Arranca todo el proyecto con un solo doble-clic:
REM    - Backend Salto    (puerto 5001)
REM    - Backend Sensor   (puerto 5000)  [opcional]
REM    - Frontend web     (puerto 8080)
REM ══════════════════════════════════════════════════════

cd /d "%~dp0.."
set VENV_PYTHON=%cd%\.venv\Scripts\python.exe

echo.
echo  === Jump Tracker - Iniciando servicios ===
echo.

REM 1) Backend del salto (puerto 5001)
echo  [1/3] Backend Salto (puerto 5001)...
start "Backend Salto" cmd /k "cd /d %cd%\modules\salto\backend && %VENV_PYTHON% app.py"

REM 2) Backend del sensor (puerto 5000) — no falla si no hay Arduino
echo  [2/3] Backend Sensor (puerto 5000)...
start "Backend Sensor" cmd /k "cd /d %cd%\modules\sensor\backend && %VENV_PYTHON% app.py"

REM 3) Frontend web (puerto 8080)
echo  [3/3] Frontend web (puerto 8080)...
start "Frontend Web" cmd /k "cd /d %cd%\integration\web && %VENV_PYTHON% -m http.server 8080"

echo.
echo  Todo listo. Abre http://localhost:8080 en el navegador.
echo  Cierra las ventanas de cmd para detener los servicios.
echo.
pause
