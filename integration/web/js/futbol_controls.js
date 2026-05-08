/* futbol_controls.js
   Módulo que asegura la existencia del bloque .pre-camera-controls
   Sustituye el script inline que estaba en futbol.html. No escribe logs.
*/
(function () {
  function asegurarPreCameraControls() {
    if (document.querySelector('.pre-camera-controls')) {
      return;
    }

    const topBar = document.querySelector('.top-bar');
    const cameraWrapper = document.querySelector('.camera-wrapper');

    if (topBar && cameraWrapper) {
      const section = document.createElement('section');
      section.className = 'pre-camera-controls';
      section.innerHTML = `
        <label for="modo-analisis" class="pre-camera-label">Modo</label>
        <select id="modo-analisis" class="modern-input">
            <option value="individual" selected>Tiro individual</option>
            <option value="comparativa">Tiros comparativa (4 tiros)</option>
        </select>
        <p class="sensor-nota">En modo comparativa, el sistema agrupa 4 tiros consecutivos de la misma sesión y muestra la tabla de comparación.</p>
      `;
      cameraWrapper.parentNode.insertBefore(section, cameraWrapper);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', asegurarPreCameraControls);
  } else {
    asegurarPreCameraControls();
  }

  // Fallback único por si algo carga tarde
  setTimeout(asegurarPreCameraControls, 1000);
})();
