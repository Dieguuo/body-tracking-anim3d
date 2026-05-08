# Flujo de tiros del módulo fútbol: individual y comparativa de 4

**Fecha:** 2026-05-07  
**Estado:** Implementado y documentado  
**Ámbito:** Frontend web de fútbol + biblioteca de vídeos

---

## 1. Objetivo

Replicar en el módulo fútbol la experiencia que ya existe en salto para:

- Ejecutar un análisis en modo **individual**.
- Ejecutar una sesión de **comparativa de 4 tiros**.
- Mostrar el progreso de la sesión mientras se capturan tiros consecutivos.
- Separar en la biblioteca los vídeos guardados como **tiros individuales** o **comparativas de 4 tiros**.

La adaptación se hace al dominio de fútbol, es decir, a **tiros con el balón** en lugar de saltos.

---

## 2. Diferencia entre modo individual y modo comparativa

### Modo individual

- Cada vídeo se procesa y se presenta como una ejecución aislada.
- El panel de comparativa de sesión no se muestra.
- La biblioteca lo muestra en la sección de **Tiros individuales**.

### Modo comparativa

- Cada tiro se acumula en un historial de sesión.
- La interfaz muestra un progreso `Tiro 1/4`, `Tiro 2/4`, etc.
- Al llegar al cuarto tiro, la tabla de sesión muestra las 4 ejecuciones.
- El mejor tiro puede resaltarse visualmente por score compuesto.
- La biblioteca lo muestra en la sección de **Comparativas de 4 tiros**.

---

## 3. UI añadida en el módulo fútbol

### Pantalla principal

Se añadió un selector de modo en `integration/web/futbol.html`:

- `Tiro individual`
- `Tiros comparativa (4 tiros)`

También se añadió:

- Un badge de progreso `comparativa-progreso`.
- Un panel `panel-comparativa-sesion` con la tabla de 4 tiros.

### Biblioteca

Se añadió una tarjeta explicativa en `integration/web/futbol_videos.html` que aclara:

- Qué significa un tiro individual.
- Qué significa una comparativa de 4 tiros.
- Cómo se clasifica lo que aparece en la galería.

Los títulos de la galería se ajustaron al dominio de fútbol:

- `Tiros individuales`
- `Comparativas de 4 tiros`

---

## 4. Lógica de frontend

### Archivo: `integration/web/js/futbol.js`

Se adaptó el flujo para:

1. Leer el modo actual con `getModoAnalisis()`.
2. Reiniciar la comparativa al cambiar de usuario o de modo.
3. Mostrar el badge de progreso únicamente en modo comparativa.
4. Acumular hasta 4 tiros en el historial de sesión.
5. Ocultar la tabla de sesión cuando el modo es individual.

### Comportamiento del historial

La tabla de sesión mantiene solo los últimos 4 tiros.

Si el usuario cambia de modo:

- Se limpia el historial.
- Se oculta la tabla.
- Se reinicia el badge de progreso.

---

## 5. Biblioteca de vídeos

### Archivo: `integration/web/js/futbol_videos.js`

La biblioteca ya separaba los datos por:

- `comparativas`
- `individuales`

Se mantuvo esa lógica y se reforzó la presentación en la UI.

### Archivo: `integration/web/futbol_videos.html`

Se añadió una explicación visible sobre cómo se guardan y se clasifican los vídeos.

El criterio de agrupación sigue siendo el mismo:

- Los vídeos que forman una sesión comparativa se muestran juntos.
- Los tiros sin grupo se muestran como individuales.

---

## 6. Backend implicado

### Persistencia

El backend de fútbol ya guarda cada ejecución como un registro en la base unificada:

- `gestos`
- `gestos_futbol`
- `gestos_curvas`
- `gestos_alertas`
- `gestos_videos` si el usuario decide guardar vídeo

### Biblioteca

El endpoint `/api/videos` ya devuelve la información clasificada en:

- `individuales`
- `comparativas`

Por tanto, la mayor parte del cambio ha sido de UX y de lectura del estado de sesión en el frontend.

---

## 7. Archivos tocados

- [integration/web/futbol.html](../integration/web/futbol.html)
- [integration/web/futbol_videos.html](../integration/web/futbol_videos.html)
- [integration/web/js/futbol.js](../integration/web/js/futbol.js)
- [integration/web/css/style.css](../integration/web/css/style.css)
- [modules/futbol/README.md](../modules/futbol/README.md)

---

## 8. Verificación recomendada

### Verificar modo individual

1. Abrir `futbol.html`.
2. Seleccionar `Tiro individual`.
3. Subir o grabar un vídeo.
4. Comprobar que la tabla de comparativa no aparece.
5. Abrir la biblioteca y verificar que el vídeo cae en `Tiros individuales`.

### Verificar modo comparativa

1. Cambiar a `Tiros comparativa (4 tiros)`.
2. Ejecutar 4 tiros seguidos en la misma sesión.
3. Verificar el badge de progreso `Tiro x/4`.
4. Confirmar que la tabla de sesión se rellena con 4 filas.
5. Abrir la biblioteca y confirmar que los vídeos se muestran agrupados como comparativa.

---

## 9. Nota técnica

La comparativa de fútbol no introduce una nueva tabla de base de datos. Se apoya en el modelo ya existente de golpeos y en la clasificación de la biblioteca por sesión y grupo.

Eso hace que el cambio sea:

- Compatible con el esquema actual.
- Fácil de mantener.
- Coherente con la lógica ya existente en salto.

---

## 10. Conclusión

El módulo fútbol ya dispone ahora de la misma idea de trabajo que salto:

- ejecución individual,
- sesión comparativa de 4,
- progreso visible,
- biblioteca separada por tipo de guardado.

La diferencia es solo el dominio biomecánico: aquí se trata de **tiros con balón**.
