/**
 * config.js — Constantes y utilidades compartidas por todos los módulos JS.
 *
 * Centraliza puertos y URLs del backend para no repetirlos en cada script.
 */

const BACKEND_SALTO_PORT = 5001;
const BACKEND_SENSOR_PORT = 5000;

function getBackendBaseUrl() {
    const ipServidor = window.location.hostname;
    return `http://${ipServidor}:${BACKEND_SALTO_PORT}`;
}

function getSensorBaseUrl() {
    const ipServidor = window.location.hostname;
    return `http://${ipServidor}:${BACKEND_SENSOR_PORT}`;
}
