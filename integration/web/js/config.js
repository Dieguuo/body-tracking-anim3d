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

function getCurrentProtocol() {
    const proto = String(window.location.protocol || '').toLowerCase();
    if (proto === 'https:') {
        return 'https';
    }
    return 'http';
}

function getBackendBaseUrl() {
    // Permitir override manual para tunnels (ngrok, devtunnels, etc.)
    // Uso: en consola del navegador → localStorage.setItem('BACKEND_URL', 'https://xxx.devtunnels.ms')
    const override = localStorage.getItem('BACKEND_URL');
    if (override) {
        return override.replace(/\/+$/, '');
    }
    return `${getCurrentProtocol()}://${getCurrentHost()}:${BACKEND_SALTO_PORT}`;
}

function getSensorBaseUrl() {
    return `${getCurrentProtocol()}://${getCurrentHost()}:${BACKEND_SENSOR_PORT}`;
}
