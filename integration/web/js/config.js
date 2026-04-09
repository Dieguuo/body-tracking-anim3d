/**
 * config.js — Constantes y utilidades compartidas por todos los módulos JS.
 *
 * Centraliza puertos y URLs del backend para no repetirlos en cada script.
 */

const BACKEND_SALTO_PORT = 5001;
const BACKEND_SENSOR_PORT = 5000;

function getCurrentHost() {
    const host = (window.location.hostname || '').trim();
    return host || 'localhost';
}

function getBackendBaseUrl() {
    return `http://${getCurrentHost()}:${BACKEND_SALTO_PORT}`;
}

function getSensorBaseUrl() {
    return `http://${getCurrentHost()}:${BACKEND_SENSOR_PORT}`;
}
