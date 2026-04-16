/**
 * config.js — Constantes y utilidades compartidas por todos los módulos JS.
 *
 * Centraliza URLs del backend para no repetirlas en cada script.
 *
 * INTEGRACIÓN: para configurar los endpoints desde la app anfitriona,
 * definir window.ANIM3D_CONFIG antes de cargar este script. Ejemplo:
 *
 *   <script>
 *     window.ANIM3D_CONFIG = {
 *       BACKEND_SALTO_URL: "https://api.midominio.com/salto",
 *       BACKEND_SENSOR_URL: "https://api.midominio.com/sensor"
 *     };
 *   </script>
 *   <script src="js/config.js"></script>
 *
 * Si no se define, se auto-detecta usando el host y protocolo actuales
 * con los puertos por defecto (desarrollo local).
 */

const BACKEND_SALTO_PORT = 5001;
const BACKEND_SENSOR_PORT = 5000;

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

function getSensorBaseUrl() {
    if (window.ANIM3D_CONFIG && window.ANIM3D_CONFIG.BACKEND_SENSOR_URL) {
        return window.ANIM3D_CONFIG.BACKEND_SENSOR_URL.replace(/\/+$/, '');
    }
    return `${getCurrentProtocol()}://${getCurrentHost()}:${BACKEND_SENSOR_PORT}`;
}
