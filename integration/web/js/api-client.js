// api-client.js — Utilidad compartida para llamadas al backend.
// getBackendBaseUrl() se carga desde js/config.js

async function fetchJson(url, options = {}) {
    let respuesta;
    try {
        respuesta = await fetch(url, options);
    } catch (_error) {
        const origen = window.location.origin || 'origen desconocido';
        throw new Error(
            `No hay conexion con el backend (${getBackendBaseUrl()}). ` +
            `Asegura que el backend este iniciado y que CORS permita ${origen}.`
        );
    }

    const raw = await respuesta.text();
    let payload = {};
    if (raw) {
        try {
            payload = JSON.parse(raw);
        } catch (_e) {
            payload = {};
        }
    }

    if (!respuesta.ok) {
        throw new Error(payload.error || payload.mensaje || `Error HTTP: ${respuesta.status}`);
    }

    return payload;
}
