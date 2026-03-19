@echo off
REM Lanza la API Flask del módulo sensor (solo datos, sin frontend)
REM Endpoint: http://localhost:5000/distancia

cd /d "%~dp0.."
call .venv\Scripts\activate
cd modules\sensor\backend
python app.py
