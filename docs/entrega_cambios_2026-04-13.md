# Entrega tecnica de cambios (2026-04-13)

Proyecto: body-tracking-anim3d

## 1. Resumen ejecutivo

Durante esta jornada se cerraron cuatro bloques:

- Estabilidad funcional del analisis de salto (datos base + paneles avanzados).
- Visualizacion landmarks 33 puntos frame a frame en 2D y 3D.
- Alineacion HTTPS local/LAN para navegador movil.
- Paridad entre tiempo real y galeria para que ambos flujos muestren la misma informacion.

Resultado esperado en producto:

- Mismas metricas en tiempo real y en video de galeria.
- Landmarks disponibles en resultados recientes y visor 2D/3D operativo.
- Backend y frontend ejecutables en HTTPS con certificados locales.

## 2. Problemas detectados y causa

Problemas observados:

- Campos base ausentes en algunos intentos: confianza, tiempo de vuelo, frames.
- Contrato inconsistente de estabilidad en aterrizaje.
- Casos con distancia 0 desde backend que degradaban la UI.
- Visor 3D con errores de carga de modulos en ciertos navegadores.
- Diferencias de comportamiento entre tiempo real y galeria.

Causas raiz:

- Mezcla de contratos en estabilidad (score numerico vs objeto de detalle).
- Fallback local demasiado agresivo en ciertas rutas.
- Comprobaciones truthy para valores validos como frame 0.
- Resolucion ESM de Three.js dependiente de CDN/entorno.
- No toda respuesta pasaba por la misma normalizacion antes de pintar UI.

## 3. Inventario de archivos nuevos

### Infraestructura y soporte HTTPS

- certs/cert.pem
  - Certificado TLS local generado para desarrollo.
- certs/key.pem
  - Clave privada TLS local.
- scripts/https_server.py
  - Servidor estatico HTTPS para integration/web, con MIME de PWA y enlace LAN.
- scripts/generate_cert.py
  - Generador de certificado autofirmado con SAN para localhost, 127.0.0.1 y IP LAN.

### Documentacion

- docs/historial_tecnico_2026-04-13.md
  - Historial tecnico de la jornada, causas y correcciones.
- docs/checklist_validacion_salto_vh_realtime_galeria.md
  - Checklist funcional para validar vertical/horizontal, tiempo real/galeria y paneles.
- docs/entrega_cambios_2026-04-13.md
  - Este documento, orientado a traspaso de conocimiento.

## 4. Inventario de archivos modificados

### Frontend

- integration/web/js/api_salto.js
  - Se anadio panel landmarks 33 (slider, 2D, 3D).
  - Se anadio captura local de landmarks en tiempo real.
  - Se incorporo merge robusto backend/local para mantener datos base y avanzados.
  - Se agrego enriquecimiento local cuando faltan curvas/fases/biomecanica.
  - Se normalizo timestamp de landmarks para evitar tiempos absolutos gigantes.
  - Se reforzo carga de Three.js con varios CDNs para compatibilidad.
  - Ajuste final de hoy:
    - Nueva funcion normalizarResultadoParaUI.
    - procesarResultadoSegunModo ahora normaliza siempre el resultado antes de pintar.
    - Esto da paridad tambien al flujo de galeria.

- integration/web/salto.html
  - Estructura HTML del panel landmarks (estado, slider, botones 2D/3D, canvas y contenedor 3D).

- integration/web/css/style.css
  - Estilos de controles landmarks y contenedores 2D/3D.

- integration/web/js/config.js
  - Base URL backend/sensor dependiente del protocolo actual (http/https).

### Backend salto

- modules/salto/backend/app.py
  - Parametro incluir_landmarks para devolver frames completos bajo demanda.
  - Endpoint GET /api/salto/<id_salto>/landmarks.
  - Normalizacion de estabilidad_aterrizaje como score numerico.
  - Exposicion de estabilidad_detalle como objeto separado.
  - Persistencia de salto con id_usuario incluso en distancia 0 para trazabilidad.
  - Arranque SSL automatico si existen certs.

- modules/salto/backend/controllers/salto_controller.py
  - Serializacion de landmarks completos por frame.
  - estabilidad_detalle separado del score principal.

- modules/salto/backend/models/video_processor.py
  - FramePies incluye landmarks completos (33 puntos con x,y,z,visibility).

- modules/salto/backend/models/salto_model.py
  - Metodo obtener_landmarks_por_id.
  - Exclusion de landmarks_frames en listados generales para aligerar payload.

- modules/salto/backend/controllers/salto_db_controller.py
  - Endpoint de curvas devuelve solo curvas/fases (sin blob pesado de landmarks).

- modules/salto/backend/services/calculo_service.py
  - Contrato actualizado de ResultadoSalto:
    - estabilidad_aterrizaje: numerico
    - estabilidad_detalle: objeto
    - landmarks_frames: lista opcional

### Backend sensor

- modules/sensor/backend/app.py
  - Arranque SSL automatico si hay certificados.

### Scripts y configuracion

- scripts/run_all.bat
  - Frontend pasa a HTTPS (8443).
  - CORS ampliado para origenes https/http locales.
  - Validacion de .env en raiz o backend salto.

- scripts/README.md
  - Documentacion actualizada para ejecucion HTTPS y acceso desde movil.

- requirements.txt
  - Dependencia agregada: cryptography (generacion de certificados).

- .env.example
  - CORS_ORIGINS actualizado con origenes HTTPS y HTTP de desarrollo.

## 5. Flujo funcional actualizado

### 5.1 Tiempo real

1. Se detecta salto y se recogen landmarks locales por frame.
2. Se envia al backend para calculo y persistencia.
3. La respuesta pasa por normalizacion robusta.
4. UI muestra:
   - datos base
   - biomecanica
   - curvas/timeline
   - insights
   - panel landmarks 2D/3D

### 5.2 Galeria

1. Se sube video al endpoint de calculo con incluir_landmarks=true.
2. La respuesta pasa por la misma normalizacion que tiempo real.
3. Se renderizan los mismos bloques visuales (incluyendo 2D/3D).

## 6. API y contrato final esperable

En resultados de salto, los campos relevantes son:

- distancia, unidad, tipo_salto
- confianza, tiempo_vuelo_s, frame_despegue, frame_aterrizaje
- potencia_w, asimetria_pct
- estabilidad_aterrizaje (score numerico)
- estabilidad_detalle (objeto de aterrizaje)
- amortiguacion, asimetria_recepcion_pct
- fases_salto, curvas_angulares, resumen_gesto, velocidades_articulares
- alertas, observaciones, clasificacion
- landmarks_frames (cuando se solicita o se dispone en local)

## 7. Como arrancar y validar rapido

1. Instalar dependencias:
   - pip install -r requirements.txt
2. Generar certificado si no existe o cambio de red:
   - .venv\Scripts\python.exe scripts\generate_cert.py
3. Arrancar todo:
   - scripts\run_all.bat
4. Abrir:
   - https://localhost:8443

Validacion minima:

- Hacer 1 salto en tiempo real y 1 en galeria.
- Comprobar datos base visibles y coherentes.
- Comprobar panel landmarks con slider + vista 2D + vista 3D.
- Confirmar que el comportamiento visual es equivalente en ambos flujos.

## 8. Riesgos conocidos y notas

- Saltos antiguos pueden no tener landmarks_frames persistidos; en ese caso no hay replay completo por frame.
- Certificado autofirmado requiere aceptacion manual en navegador (especialmente movil).
- Si el navegador bloquea un CDN concreto de ESM, la app prueba proveedores alternativos para Three.js.

## 9. Referencias internas

- docs/historial_tecnico_2026-04-13.md
- docs/checklist_validacion_salto_vh_realtime_galeria.md
- scripts/README.md

## 10. Visualizacion 3D — ultimos 3 hitos del roadmap (Fase 11)

### 10.1 Animacion del salto (11.4)

- Play/pause con `_startAnimation()` / `_stopAnimation()` basados en `setInterval`.
- Control de velocidad ciclico: x0.25, x0.5, x1.
- Intervalo calculado a partir de timestamps reales de los frames y velocidad seleccionada.
- Indicador de fase actual (preparacion, impulsion, vuelo, recepcion) sincronizado con la animacion.
- Helper `_getFaseParaFrame()` busca la fase en `datos.fases_salto`.
- Colores por fase: azul (preparacion), amarillo (impulsion), verde (vuelo), rojo (recepcion).
- Loop automatico al final del ultimo frame.

### 10.2 Overlays biomecanicos en 2D y 3D (11.5)

- Checkboxes independientes para angulos articulares, trayectoria CM y colores por fase.
- Arcos de angulo de rodilla (landmarks 23-25-27 y 24-26-28) y cadera (11-23-25 y 12-24-26) dibujados en canvas 2D con valor numerico en grados.
- Trayectoria del centro de masa (promedio Y caderas 23+24) como trail sobre todos los frames, con indicador del CM actual.
- Color de esqueleto dinamico en 2D y 3D segun la fase activa del salto.
- Panel de metricas sincronizado al frame actual: angulo medio rodilla, angulo medio cadera, fase activa con color.
- Panel auto-visible cuando cualquier overlay esta activo.

### 10.3 Comparativa de saltos en el visor (11.6)

- Selector de salto a comparar poblado dinamicamente con los saltos del mismo usuario.
- Carga de landmarks del salto de comparacion desde `GET /api/salto/<id>/landmarks` con cache en `landmarksCache`.
- Esqueleto ghost en 2D: opacidad 35%, color rosa (#ff8cff).
- Esqueleto ghost en 3D: joints y bones translucidos, 40% opacidad, rosa.
- Mapeo proporcional de frames entre salto principal y comparacion (`_mapCompareFrame()`).
- Limpieza de geometria ghost al cambiar o desactivar la comparacion.
- El salto actual no aparece en el selector.
