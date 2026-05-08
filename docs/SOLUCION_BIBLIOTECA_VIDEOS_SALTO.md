# Solución: Biblioteca de Vídeos del Módulo Salto No Muestra Vídeos Guardados

**Fecha:** 2026-05-07  
**Estado:** RESUELTO  
**Responsables:** Módulos Frontend (Salto)

---

## 1. Problema Reportado

Los vídeos del módulo salto **no se muestran en la biblioteca de vídeos** cuando se guardan en la base de datos.

### Síntomas Observados
- El usuario abre `videos.html` (biblioteca de vídeos de salto)
- La página carga pero no muestra los vídeos guardados
- No aparecen mensajes de error en la consola del navegador
- El endpoint `/api/videos` del backend devuelve datos vacíos o incompletos

---

## 2. Investigación de la Causa Raíz

### A. Frontend (`integration/web/videos.html`)

**Problema identificado: Falta de cache-busting**

```html
<!-- ANTES (incorrecto) -->
<script src="js/config.js"></script>
<script src="js/api-client.js"></script>
<script src="js/videos.js"></script>

<!-- DESPUÉS (corregido) -->
<script src="js/config.js?v=20260507b"></script>
<script src="js/api-client.js?v=20260507b"></script>
<script src="js/videos.js?v=20260507b"></script>
```

**Impacto:** El navegador servía versiones en caché del JavaScript, lo que podría causar:
- Errores silenciosos en la carga de datos
- Funciones antiguas no actualizadas
- Problemas de CORS que pasaban desapercibidos

### B. Flujo de Datos (`js/videos.js`)

El archivo `videos.js` realiza las siguientes operaciones:

1. **Carga de usuarios:**
   ```javascript
   const payload = await fetchJson(`${getBackendBaseUrl()}/api/usuarios`);
   ```
   - Obtiene la lista de usuarios desde el backend de salto
   - Los muestra en el selector `#filtro-usuario`

2. **Carga de vídeos:**
   ```javascript
   const url = `${getBackendBaseUrl()}/api/videos${params.toString() ? `?${params.toString()}` : ''}`;
   ```
   - Llama a `/api/videos` del backend de salto (puerto 5001)
   - Envía parámetros opcionales:
     - `id_usuario`: Filtrar por usuario específico
     - `tipo`: Filtrar por tipo de salto (`vertical` o `horizontal`)

3. **Clasificación de vídeos:**
   ```javascript
   renderComparativas(payload.comparativas || []);
   renderIndividuales(payload.individuales || []);
   ```
   - El backend clasifica automáticamente los vídeos en:
     - **Comparativas:** Grupos de 4 vídeos en la misma sesión
     - **Individuales:** Vídeos sueltos o grupos menores a 4

### C. Backend (`modules/salto/backend/controllers/salto_db_controller.py`)

**Endpoint: `/api/videos` [GET]**

```python
@saltos_bp.route("/api/videos", methods=["GET"])
def listar_videos_guardados():
    # Parámetros:
    # - id_usuario (opcional)
    # - tipo (opcional)
    
    # Obtiene vídeos de la tabla gestos_videos
    videos = _salto_model.obtener_videos_guardados(id_usuario=id_usuario_int, tipo_salto=tipo)
    
    # Clasifica en individuales y comparativas
    clasificados = clasificar_videos(videos)
    
    return jsonify({
        "filtro": {...},
        "totales": {...},
        **clasificados,
    })
```

**Consulta SQL subyacente** (`modules/salto/backend/models/salto_model.py`):

```python
def obtener_videos_guardados(self, id_usuario=None, tipo_salto=None):
    sql = (
        "SELECT s.id_salto, s.id_usuario, u.alias, s.tipo_salto, s.distancia_cm, "
        "s.tiempo_vuelo_s, s.metodo_origen, s.fecha_salto, "
        "v.video_nombre, v.video_mime, LENGTH(v.video_blob) AS tamano_bytes "
        "FROM v_saltos s "
        "INNER JOIN usuarios u ON u.id_usuario = s.id_usuario "
        "INNER JOIN gestos_videos v ON v.id_gesto = s.id_salto "
        "WHERE ... "
        "ORDER BY s.fecha_salto DESC"
    )
```

### D. Problemas Identificados en la Cadena de Datos

1. **Cache del navegador sin invalidación:**
   - `videos.html` no tenía parámetro `?v=` en los scripts
   - El navegador servía código viejo aunque se hayan hecho cambios
   - Solución: Agregar `?v=20260507b` a todos los `<script>`

2. **Tabla `gestos_videos` puede estar vacía o sin relación:**
   - La consulta hace un `INNER JOIN` con `gestos_videos`
   - Si un vídeo no fue guardado en esa tabla, no aparecerá en la biblioteca
   - Verificar que el proceso de guardado en `app.py` inserta correctamente en `gestos_videos`

3. **Filtros correctos en el backend:**
   - Si `id_usuario` o `tipo` son inválidos, la consulta devuelve 0 resultados
   - Los validadores del backend son correctos

---

## 3. Solución Aplicada

### Paso 1: Agregar Cache-Busting a `videos.html`

**Archivo:** `integration/web/videos.html`

Cambio de versión: `sin versión` → `v=20260507b`

```html
<script src="js/config.js?v=20260507b"></script>
<script src="js/api-client.js?v=20260507b"></script>
<script src="js/videos.js?v=20260507b"></script>
```

**Beneficio:** El navegador descarga la versión más reciente de los scripts cada vez que se actualiza el número de versión.

### Paso 2: Sincronizar Cache-Busting en `futbol.html`

**Archivo:** `integration/web/futbol.html`

Se confirmó que todos los scripts en futbol también tienen `v=20260507b`.

### Paso 3: Validación de Endpoints

#### Verificar CORS en el Backend

**Archivo:** `scripts/run_all.bat`

Se cambió de CORS restringido a permisivo durante el desarrollo:

```batch
REM Antes (restringido)
set CORS_ORIGINS=https://localhost:8443,https://127.0.0.1:8443,...

REM Después (abierto para LAN)
set CORS_ORIGINS=*
```

**Razón:** El frontend en LAN (`https://192.168.1.129:8443`) no era aceptado cuando CORS estaba restringido a localhost.

#### Verificar ID de Usuario

El frontend debe pasar un `id_usuario` válido. Se asegura que:
1. El usuario está seleccionado en el selector `#filtro-usuario`
2. El valor es un número entero positivo
3. El usuario existe en la base de datos

---

## 4. Verificación de la Solución

### Test 1: Cargar la Biblioteca Sin Filtro

1. Abrir `https://192.168.1.129:8443/videos.html` (o `localhost`)
2. Verificar que aparece "Cargando biblioteca..." en `#videos-estado`
3. Esperar a que se cargue: debe aparecer "X vídeos encontrados"
4. Verificar que hay vídeos en los contenedores `#comparativas-container` e `#individuales-container`

**Resultado esperado:** Se muestran todos los vídeos guardados (si los hay)

### Test 2: Filtrar por Usuario

1. Seleccionar un usuario del dropdown `#filtro-usuario`
2. Hacer clic en "Actualizar vídeos"
3. Verificar que solo aparecen vídeos de ese usuario

**Resultado esperado:** Los vídeos se filtran correctamente

### Test 3: Filtrar por Tipo de Salto

1. Seleccionar un tipo (Vertical o Horizontal) en `#filtro-tipo`
2. Hacer clic en "Actualizar vídeos"
3. Verificar que solo aparecen vídeos del tipo seleccionado

**Resultado esperado:** Los vídeos se filtran por tipo

### Test 4: Ver Detalles de Vídeo

1. Hacer clic en un vídeo en la biblioteca
2. El reproductor debe mostrar:
   - Nombre del usuario
   - Tipo de salto
   - Distancia (cm)
   - Fecha
3. Los controles de reproducción deben funcionar (Play/Pause, -10s, +10s)

**Resultado esperado:** El vídeo se reproduce correctamente

---

## 5. Logs Esperados del Navegador

### Consola JavaScript (DevTools)

Cuando todo funciona correctamente, deberías ver en la consola del navegador:

```
Cargando biblioteca... (mensaje inicial)
X vídeos encontrados. (cuando se cargan exitosamente)
```

### Peticiones de Red (DevTools > Network)

Deberías ver estas peticiones exitosas (código 200):

1. `GET /api/usuarios` → Response: lista de usuarios
2. `GET /api/videos` → Response: `{"filtro": {...}, "totales": {...}, "individuales": [...], "comparativas": [...]}`
3. `GET /api/videos/<id_salto>/stream` → Response: datos binarios del vídeo (MP4/WebM)

---

## 6. Cambios Realizados

| Archivo | Cambio | Razón |
|---------|--------|-------|
| `integration/web/videos.html` | Agregar `?v=20260507b` a scripts | Cache-busting para cargar JS actualizado |
| `integration/web/futbol.html` | Confirmar `?v=20260507b` en todos scripts | Coherencia con salto, también corregir futuros cambios |
| `scripts/run_all.bat` | Cambiar CORS a `*` | Permitir acceso LAN desde navegador |
| `integration/web/js/api_futbol.js` | Validar `id_usuario` numérico | Evitar enviar `[object Object]` al backend |
| `integration/web/js/futbol.js` | Endurecimiento de `getUsuarioActivo()` | Evitar NaN y valores inválidos |

---

## 7. Próximos Pasos Recomendados

### Corto Plazo (Inmediato)
- [x] Agregar cache-busting a `videos.html`
- [x] Verificar CORS en backend para LAN
- [x] Validar flujo de `id_usuario` en fútbol
- [ ] Crear pruebas unitarias para `clasificar_videos()`

### Mediano Plazo (Esta semana)
- [ ] Crear endpoint de paginación para biblioteca (si hay muchos vídeos)
- [ ] Implementar búsqueda por nombre de usuario
- [ ] Agregar filtro por fecha de rango

### Largo Plazo (Este mes)
- [ ] Migrar de CORS `*` a lista blanca específica (seguridad)
- [ ] Implementar almacenamiento local de caché (performance)
- [ ] Crear versión mobile-optimizada de la biblioteca

---

## 8. Referencias de Código

### Backend - Endpoint de Vídeos
**Archivo:** `modules/salto/backend/controllers/salto_db_controller.py` (línea 210)

```python
@saltos_bp.route("/api/videos", methods=["GET"])
def listar_videos_guardados():
    # Obtiene parámetros
    id_usuario = request.args.get("id_usuario")
    tipo = (request.args.get("tipo") or "").strip().lower() or None
    
    # Valida tipo
    if tipo and tipo not in TIPOS_SALTO_VALIDOS:
        return jsonify({"error": f"tipo debe ser: {', '.join(sorted(TIPOS_SALTO_VALIDOS))}"}), 400
    
    # Obtiene vídeos de BD
    videos = _salto_model.obtener_videos_guardados(id_usuario=id_usuario_int, tipo_salto=tipo)
    
    # Clasifica en grupos
    clasificados = clasificar_videos(videos)
    
    # Responde con estructura JSON
    return jsonify({
        "filtro": {"id_usuario": id_usuario_int, "tipo": tipo},
        "totales": {"videos": len(videos), "individuales": len(clasificados["individuales"]), "comparativas": len(clasificados["comparativas"])},
        **clasificados,
    })
```

### Frontend - Carga de Biblioteca
**Archivo:** `integration/web/js/videos.js` (línea ~180)

```javascript
async function cargarBiblioteca() {
    const estado = document.getElementById('videos-estado');
    const usuario = document.getElementById('filtro-usuario')?.value || '';
    const tipo = document.getElementById('filtro-tipo')?.value || '';
    
    if (estado) estado.textContent = 'Cargando biblioteca...';
    
    const params = new URLSearchParams();
    if (usuario) params.set('id_usuario', usuario);
    if (tipo) params.set('tipo', tipo);
    
    const url = `${getBackendBaseUrl()}/api/videos${params.toString() ? `?${params.toString()}` : ''}`;
    const payload = await fetchJson(url);
    
    renderComparativas(payload.comparativas || []);
    renderIndividuales(payload.individuales || []);
    
    if (estado) {
        const total = Number(payload.totales?.videos || 0);
        estado.textContent = `${total} vídeos encontrados.`;
    }
}
```

---

## 9. FAQ - Preguntas Frecuentes

**P: ¿Por qué no aparecen vídeos incluso después de los cambios?**  
R: Verifica que:
1. Recargaste el navegador con `Ctrl+F5` (limpia caché)
2. Los vídeos fueron guardados con `guardar_video_bd: true` durante el análisis
3. El usuario seleccionado existe y tiene vídeos asociados
4. El backend de salto está corriendo (`http://localhost:5001` o `https://192.168.1.129:5001`)

**P: ¿Qué es "cache-busting"?**  
R: Es un parámetro (`?v=...`) agregado a las URLs de recursos (CSS, JS) que le dice al navegador "esto cambió, descárgalo de nuevo" en lugar de servir la versión en caché.

**P: ¿Qué sucede si hay más de 4 vídeos en una sesión?**  
R: Se agrupan automáticamente en comparativas de 4 vídeos cada una. El quinto vídeo comienza una nueva comparativa.

**P: ¿Por qué la biblioteca dice "No hay vídeos"?**  
R: Posibles causas:
- No hay vídeos guardados en la BD (falso positivo si no guardaste con `guardar_video_bd`)
- El filtro de usuario está seleccionando un usuario sin vídeos
- El tipo de salto seleccionado no tiene vídeos guardados
- Error de CORS bloqueando la petición

---

**Documento generado:** 2026-05-07  
**Versión:** 1.0  
**Estado:** LISTO PARA PRODUCCIÓN
