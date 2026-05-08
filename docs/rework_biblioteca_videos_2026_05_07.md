# Rework de la Biblioteca / Galería de Vídeos - 2026-05-07

## Objetivo

Rediseñar por completo la biblioteca de vídeos del frontend para que:

1. El usuario elija primero el módulo a consultar: salto o fútbol.
2. Los filtros se adapten al módulo seleccionado.
3. La galería muestre vídeos compactos, legibles y agrupados por categoría.
4. El estilo visual se mantenga coherente con la web actual, pero con una estructura más sostenible.
5. La navegación desde los módulos de salto y fútbol apunte a una única biblioteca unificada.

---

## Qué había antes

Antes del rework existían dos bibliotecas separadas:

- `integration/web/videos.html` para salto.
- `integration/web/futbol_videos.html` para fútbol.

Ambas compartían una lógica muy parecida, pero con diferencias de contrato y de presentación.

Problemas detectados:

- La biblioteca de salto no ofrecía una selección inicial de módulo.
- La vista no permitía unificar el flujo entre salto y fútbol.
- Las tarjetas de vídeo eran demasiado grandes y ocupaban demasiado espacio vertical.
- En salto faltaban metadatos visibles como altura y peso del usuario.
- La estructura visual no estaba preparada para escalar sin duplicar estilos.

---

## Qué se ha hecho

### 1. Se ha unificado la entrada a la biblioteca

La página `integration/web/videos.html` ahora actúa como biblioteca central.

Nada más entrar, el usuario puede elegir entre:

- Módulo salto
- Módulo fútbol

Esa elección activa el formulario de filtros y carga el contenido correspondiente.

Además, los accesos desde los módulos principales ya apuntan a la biblioteca unificada:

- `integration/web/salto.html` enlaza con `videos.html?module=salto`
- `integration/web/futbol.html` enlaza con `videos.html?module=futbol`

### 2. Se han añadido filtros dinámicos

La nueva biblioteca permite:

- Filtrar por usuario
- Filtrar por categoría: individuales, comparativas o todos
- En salto, filtrar también por tipo de salto: vertical, horizontal o todos

El filtro de tipo de salto solo aparece cuando el módulo activo es salto.

### 3. Se ha reestructurado la presentación de los vídeos

La galería ya no usa tarjetas grandes en rejilla. Ahora muestra cada vídeo como una fila compacta con:

- Carátula pequeña a la izquierda
- Metadatos en el centro
- Botón de apertura en grande a la derecha

Metadatos visibles:

- En salto:
  - Fecha
  - Hora
  - Altura del usuario
  - Peso del usuario
  - Distancia del salto
- En fútbol:
  - Fecha
  - Hora
  - Pierna con la que se chutó

El botón de acción abre el vídeo en una pestaña nueva para verlo en grande.

### 4. Se ha organizado la salida por categorías

La biblioteca agrupa el contenido de forma más clara:

- Sección de comparativas
- Sección de individuales

Dentro de cada sección, los vídeos se organizan por usuario y, en salto, también por tipo de salto.

Esto permite leer la galería de forma jerárquica sin mezclar sesiones distintas.

### 5. Se ha ampliado el contrato de datos de salto

Para poder mostrar altura y peso en la galería de salto, se amplió el modelo de lectura:

- `modules/salto/backend/models/salto_model.py`
- `modules/salto/backend/services/video_library_service.py`

Ahora la biblioteca de salto serializa también:

- `altura_m`
- `peso_kg`

Eso permite pintar esos campos en el frontend sin depender de datos inventados o incompletos.

### 6. Se ha creado un CSS específico para la galería

Se añadió un archivo nuevo:

- `integration/web/css/videos_galeria.css`

Ese archivo concentra:

- Layout de la página de biblioteca
- Selector inicial de módulos
- Panel de filtros
- Agrupación por categorías
- Tarjetas compactas de vídeo
- Estilos responsive
- Animaciones suaves de entrada

La gama cromática mantiene la base visual de la web, pero la estructura es más limpia y modular.

### 7. Se ha creado un JS específico para la lógica de la galería

Se añadió un archivo nuevo:

- `integration/web/js/videos_galeria.js`

Ese script se encarga de:

- Leer el módulo inicial desde la URL
- Cargar usuarios según el módulo activo
- Construir la consulta al backend
- Filtrar por usuario, categoría y tipo de salto
- Agrupar vídeos por sección
- Renderizar las tarjetas compactas
- Abrir los vídeos en grande

---

## Archivos tocados

### Frontend

- `integration/web/videos.html`
- `integration/web/index.html`
- `integration/web/salto.html`
- `integration/web/futbol.html`
- `integration/web/js/videos_galeria.js`
- `integration/web/css/videos_galeria.css`

### Backend de salto

- `modules/salto/backend/models/salto_model.py`
- `modules/salto/backend/services/video_library_service.py`

### Documentación

- `docs/CAMBIOS_2026_05_07.md`
- `docs/rework_biblioteca_videos_2026_05_07.md`

---

## Comportamiento final

### Si se entra desde el índice

El usuario ve dos opciones dentro de la biblioteca:

- Saltos
- Fútbol

Al pulsar una, la vista se adapta a ese módulo y habilita los filtros correspondientes.

### Si se entra desde salto

La biblioteca abre directamente en modo salto.

Se pueden filtrar:

- Por usuario
- Por categoría
- Por tipo de salto

### Si se entra desde fútbol

La biblioteca abre directamente en modo fútbol.

Se pueden filtrar:

- Por usuario
- Por categoría

### Presentación de cada vídeo

Cada vídeo se muestra como una fila compacta con:

- Miniatura
- Datos del vídeo y del usuario
- Botón de apertura en grande

---

## Resultado práctico

El rework deja la biblioteca preparada para crecer sin duplicar estilos ni comportamiento entre módulos.

Se gana en:

- Claridad de navegación
- Legibilidad en pantalla pequeña
- Mejor uso del espacio vertical
- Reutilización de la lógica de renderizado
- Escalabilidad del frontend
