@echo off
REM Sirve el frontend del módulo sensor con Python como servidor estático
REM Accede en: http://localhost:8080

cd /d "%~dp0..\modules\sensor\frontend"
python -m http.server 8080
