# Historial tecnico integral (hasta y despues de 3D)

Fecha: 2026-04-13
Proyecto: body-tracking-anim3d

## 1. Contexto funcional

El modulo de salto tiene tres grandes bloques:
- Captura y analisis de salto (tiempo real y video de galeria).
- Persistencia y analitica (DB + endpoints REST).
- Visualizacion avanzada (curvas, panel biomecanico, landmarks 33 puntos 2D/3D).

## 2. Cambios realizados antes de 3D

### 2.1 Fiabilidad de metricas base
- Ajustes para mantener datos consistentes de distancia, potencia, asimetria y estabilidad.
- Merge de estimaciones locales cuando faltaban campos avanzados en algunas rutas de captura.

### 2.2 Contrato backend/frontend
- Se detecto deriva de contrato en estabilidad de aterrizaje:
  - valor esperado para score global: numero (0..100)
  - valor esperado para detalle biomecanico: objeto
- Se reforzo la serializacion para evitar cambios de shape entre intentos.

### 2.3 HTTPS y uso movil
- Se paso a flujo HTTPS para habilitar camara en navegador movil.
- Se introdujo servidor HTTPS de frontend y certificados locales.
- Se alineo CORS para origenes HTTPS de desarrollo.

### 2.4 PWA
- Manifest, service worker, iconos y registro en frontend.
- Ajustes de MIME para recursos webmanifest/wasm.

## 3. Cambios de la fase 3D

### 3.1 Persistencia de landmarks 33
- Se anadio serializacion frame a frame de landmarks completos (x,y,z,visibility).
- Se guardan en curvas_json.landmarks_frames al persistir un salto.
- Endpoint nuevo:
  - GET /api/salto/<id_salto>/landmarks

### 3.2 Viewer 2D por frame
- Canvas con dibujo de articulaciones y conexiones.
- Slider de frames con etiqueta de frame y timestamp.

### 3.3 Viewer 3D por frame
- Three.js con OrbitControls.
- Render de joints y bones usando coordenada Z.
- Reutiliza el mismo slider del viewer 2D.

## 4. Regresiones detectadas tras cambios recientes

Se detectaron cuatro sintomas principales:
- No aparecian estabilidad, clasificacion y panel biomecanico en algunos flujos.
- En ciertos intentos faltaban confianza, tiempo de vuelo y frames.
- Viewer landmarks mostraba 404 en saltos sin persistencia completa.
- El flujo HTTPS quedo inconsistente al faltar scripts en carpeta scripts.

## 5. Causa raiz

### 5.1 Contrato de estabilidad roto
- estabilidad_aterrizaje quedo mezclado como objeto en una parte del flujo.
- El frontend esperaba score numerico para algunas vistas y objeto para otras.

### 5.2 Fallback agresivo en tiempo real
- Cuando backend devolvia distancia 0, se reemplazaba demasiado resultado por fallback local,
  perdiendo metadatos de backend y provocando huecos visuales.

### 5.3 Render de campos base con logica truthy
- Tiempo/frame usaban expresiones truthy (ej. frame 0 tratado como vacio).

### 5.4 Scripts HTTPS ausentes
- run_all.bat llamaba scripts/https_server.py pero no existia en disco.

## 6. Arreglo final aplicado

### 6.1 Contrato estable restaurado
- estabilidad_aterrizaje vuelve a ser score numerico (float|None).
- estabilidad_detalle queda separado como objeto biomecanico.
- En respuesta API se normaliza el score antes de devolver/guardar.

### 6.2 Persistencia robusta con usuario
- Si hay id_usuario, el salto se persiste siempre (incluyendo distancia 0),
  para conservar id_salto y posibilidad de landmarks cuando existan.

### 6.3 Merge backend/local reforzado
- En flujo tiempo real se combinan campos base siempre:
  - confianza
  - tiempo_vuelo_s
  - frame_despegue
  - frame_aterrizaje
  - potencia/asimetria/estabilidad/angulos
- Si faltan alertas/clasificacion, se generan heuristicas locales de respaldo.

### 6.4 Render de UI endurecido
- Tiempo y frames ya no dependen de checks truthy.
- frame 0 se muestra correctamente.
- estabilidad superior se pinta de forma consistente.
- panel biomecanico consume estabilidad_detalle preferentemente.

### 6.5 Landmarks UX
- Para datos_parciales se oculta el panel landmarks.
- En 404 se muestra mensaje amigable (sin texto tecnico de HTTP).

### 6.6 HTTPS reparado
- Se recrearon scripts faltantes:
  - scripts/https_server.py
  - scripts/generate_cert.py
- run_all.bat arranca frontend HTTPS en 8443.
- config.js usa protocolo dinamico segun window.location.

### 6.7 Hotfix final: 0 cm + 3D en tiempo real

- Se detecto que el merge backend/local seguia priorizando `distancia=0` del backend
  aunque hubiera estimacion local valida.
- Se corrigio para priorizar distancia local cuando backend devuelve <=0 y local >0.
- Se anadio captura local de landmarks frame a frame durante deteccion en vivo:
  - si backend no devuelve landmarks, el visor 2D/3D usa los landmarks locales.
- El panel landmarks ya no se oculta en `datos_parciales` si existen `landmarks_frames` inline/local.
- Cobertura directa para vertical y horizontal en tiempo real, tanto guardando video como sin guardarlo.

### 6.8 Cierre de paridad: tiempo real y galeria

- Se unifico el procesamiento final de resultados para que cualquier respuesta pase por la misma normalizacion de UI.
- El flujo de galeria ahora utiliza el mismo enriquecimiento/fallback que tiempo real para evitar diferencias de paneles.
- Resultado: el visor landmarks 2D/3D y los bloques tecnicos mantienen comportamiento equivalente en ambos modos.

## 7. Archivos clave tocados

Backend:
- modules/salto/backend/services/calculo_service.py
- modules/salto/backend/controllers/salto_controller.py
- modules/salto/backend/app.py
- modules/salto/backend/models/video_processor.py
- modules/salto/backend/models/salto_model.py
- modules/salto/backend/controllers/salto_db_controller.py

Frontend:
- integration/web/js/api_salto.js
- integration/web/js/config.js
- integration/web/salto.html
- integration/web/css/style.css

Infra/scripts:
- scripts/run_all.bat
- scripts/https_server.py
- scripts/generate_cert.py
- scripts/README.md
- requirements.txt
- .env.example

## 8. Checklist de verificacion recomendada

1) Arranque
- Ejecutar scripts/run_all.bat
- Abrir https://localhost:8443

2) Salto individual en tiempo real
- Verificar:
  - Confianza
  - Tiempo de vuelo
  - Frame despegue
  - Frame aterrizaje
  - Estabilidad (score)
  - Clasificacion

3) Panel biomecanica aterrizaje
- Verificar que aparece cuando hay datos:
  - oscilacion
  - tiempo de estabilizacion
  - amortiguacion
  - asimetria recepcion

4) Landmarks 33
- Salto nuevo con id_salto persistido:
  - slider funciona
  - vista 2D funciona
  - vista 3D funciona
- Salto antiguo sin landmarks:
  - mensaje amigable sin romper la UI

5) Flujo galeria
- Subir video y verificar mismas metricas en panel.

## 9. Nota sobre historicos

Saltos antiguos creados antes de guardar landmarks completos pueden no tener
curvas_json.landmarks_frames. Eso es esperado y no implica fallo del salto nuevo.
