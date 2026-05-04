/**
 * config.js — Constantes y utilidades compartidas por todos los módulos JS.
 *
 * Centraliza la URL del backend para no repetirla en cada script.
 *
 * INTEGRACIÓN: para configurar el endpoint desde la app anfitriona,
 * definir window.ANIM3D_CONFIG antes de cargar este script. Ejemplo:
 *
 *   <script>
 *     window.ANIM3D_CONFIG = {
 *       BACKEND_SALTO_URL: window.location.origin
 *     };
 *   </script>
 *   <script src="js/config.js"></script>
 *
 * Si no se define, se auto-detecta usando el host y protocolo actuales
 * con el puerto por defecto (desarrollo local).
 */

const BACKEND_SALTO_PORT = 5001;

function getCurrentHost() {
    const host = (window.location.hostname || '').trim();
    return host || 'localhost';
}

function getCurrentProtocol() {
    const proto = String(window.location.protocol || '').toLowerCase();
    if (proto === 'https:') {
        return 'https';
    }
    return 'http';
}

function getBackendBaseUrl() {
    if (window.ANIM3D_CONFIG && window.ANIM3D_CONFIG.BACKEND_SALTO_URL) {
        return window.ANIM3D_CONFIG.BACKEND_SALTO_URL.replace(/\/+$/, '');
    }
    return `${getCurrentProtocol()}://${getCurrentHost()}:${BACKEND_SALTO_PORT}`;
}
