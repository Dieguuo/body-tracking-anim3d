// api_futbol.js — llamadas al backend de futbol.
// getFutbolBaseUrl() se carga desde js/config.js

// Valida que la altura sea un numero entre 0.50 y 2.50 m.
// Lanza Error con mensaje legible si no lo es.
function _validarAlturaObligatoria(alturaM) {
    const altura = Number(alturaM);
    if (alturaM === null || alturaM === undefined || alturaM === '' || Number.isNaN(altura)) {
        throw new Error('La altura es obligatoria. Indica un valor entre 0.50 y 2.50 metros.');
    }
    if (altura < 0.50 || altura > 2.50) {
        throw new Error('La altura debe estar entre 0.50 y 2.50 metros.');
    }
}

// Llama al backend y devuelve JSON con manejo de errores.
async function fetchJsonFutbol(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    let respuesta;
    try {
        respuesta = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
    } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            throw new Error(`Timeout: sin respuesta del backend en ${timeoutMs}ms. Verifica que el servidor esté activo.`);
        }
        const origen = window.location.origin || 'origen desconocido';
        throw new Error(
            `No hay conexion con el backend (${getFutbolBaseUrl()}). ` +
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

// Envia el video grabado al endpoint de analisis.
async function analizarGolpeo(videoBlob, opciones = {}) {
    const formData = new FormData();
    formData.append('video', videoBlob, 'golpeo.webm');

    const idUsuarioNum = Number(opciones.idUsuario);
    if (Number.isFinite(idUsuarioNum) && idUsuarioNum > 0) {
        formData.append('id_usuario', String(idUsuarioNum));
    }
    if (opciones.guardarBd) {
        formData.append('guardar_bd', 'true');
    }
    if (opciones.guardarVideoBd) {
        formData.append('guardar_video_bd', 'true');
    }
    if (opciones.metodoOrigen) {
        formData.append('metodo_origen', String(opciones.metodoOrigen));
    }
    if (opciones.modoGrabacion) {
        formData.append('modo_grabacion', String(opciones.modoGrabacion));
    }
    if (opciones.incluirLandmarks) {
        formData.append('incluir_landmarks', 'true');
    }

    const url = `${getFutbolBaseUrl()}/api/futbol/analizar`;
    return fetchJsonFutbol(url, {
        method: 'POST',
        body: formData
    });
}

async function crearUsuarioFutbol(alias, nombreCompleto, alturaM, pesoKg) {
    _validarAlturaObligatoria(alturaM);
    const url = `${getFutbolBaseUrl()}/api/usuarios`;
    const body = {
        alias: alias,
        nombre_completo: nombreCompleto,
        altura_m: alturaM
    };
    if (pesoKg != null && pesoKg !== '') body.peso_kg = pesoKg;
    const payload = await fetchJsonFutbol(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    return payload.id_usuario;
}

async function actualizarUsuarioFutbol(idUsuario, alias, nombreCompleto, alturaM, pesoKg) {
    _validarAlturaObligatoria(alturaM);
    const url = `${getFutbolBaseUrl()}/api/usuarios/${idUsuario}`;
    const body = {
        alias: alias,
        nombre_completo: nombreCompleto,
        altura_m: alturaM
    };
    if (pesoKg != null && pesoKg !== '') body.peso_kg = pesoKg;
    await fetchJsonFutbol(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

async function eliminarUsuarioFutbol(idUsuario) {
    const url = `${getFutbolBaseUrl()}/api/usuarios/${idUsuario}`;
    await fetchJsonFutbol(url, { method: 'DELETE' });
}

async function obtenerUsuariosFutbol() {
    const url = `${getFutbolBaseUrl()}/api/usuarios`;
    return await fetchJsonFutbol(url);
}

async function obtenerUsuariosFutbolPaginados({ search = '', limit = 20, offset = 0 }) {
    const query = new URLSearchParams({
        paginado: '1',
        search,
        limit: String(limit),
        offset: String(offset)
    });
    const url = `${getFutbolBaseUrl()}/api/usuarios?${query.toString()}`;
    const payload = await fetchJsonFutbol(url);

    if (Array.isArray(payload)) {
        const items = payload
            .sort((a, b) => String(a.alias || '').localeCompare(String(b.alias || '')))
            .filter((u) => {
                if (!search) return true;
                const txt = `${u.alias || ''} ${u.nombre_completo || ''} ${u.altura_m || ''}`.toLowerCase();
                return txt.includes(search.toLowerCase());
            })
            .slice(offset, offset + limit);

        const filtradosTotal = payload.filter((u) => {
            if (!search) return true;
            const txt = `${u.alias || ''} ${u.nombre_completo || ''} ${u.altura_m || ''}`.toLowerCase();
            return txt.includes(search.toLowerCase());
        }).length;

        return {
            items,
            total: filtradosTotal,
            limit,
            offset,
            has_more: (offset + items.length) < filtradosTotal,
        };
    }

    return {
        items: Array.isArray(payload.items) ? payload.items : [],
        total: Number(payload.total || 0),
        limit: Number(payload.limit || limit),
        offset: Number(payload.offset || offset),
        has_more: Boolean(payload.has_more),
    };
}

// ── Endpoints avanzados (analítica del módulo futbol) ──

async function obtenerCurvasGolpeo(idGolpeo) {
    const url = `${getFutbolBaseUrl()}/api/golpeos/${idGolpeo}/curvas`;
    return fetchJsonFutbol(url);
}

async function obtenerLandmarksGolpeo(idGolpeo) {
    const url = `${getFutbolBaseUrl()}/api/golpeos/${idGolpeo}/landmarks`;
    return fetchJsonFutbol(url);
}

async function obtenerAlertasGolpeo(idGolpeo) {
    const url = `${getFutbolBaseUrl()}/api/golpeos/${idGolpeo}/alertas`;
    return fetchJsonFutbol(url);
}

async function obtenerFatigaUsuarioFutbol(idUsuario, metrica = 'velocidad_pie_ms') {
    const q = new URLSearchParams({ metrica });
    const url = `${getFutbolBaseUrl()}/api/usuarios/${idUsuario}/fatiga?${q.toString()}`;
    return fetchJsonFutbol(url);
}

async function obtenerTendenciaUsuarioFutbol(idUsuario, metrica = 'velocidad_pie_ms', semanas = 4) {
    const q = new URLSearchParams({ metrica, semanas: String(semanas) });
    const url = `${getFutbolBaseUrl()}/api/usuarios/${idUsuario}/tendencia?${q.toString()}`;
    return fetchJsonFutbol(url);
}

async function obtenerComparativaUsuarioFutbol(idUsuario, n = 4) {
    const q = new URLSearchParams({ n: String(n) });
    const url = `${getFutbolBaseUrl()}/api/usuarios/${idUsuario}/comparativa?${q.toString()}`;
    return fetchJsonFutbol(url);
}

async function obtenerAlertasTendenciaFutbol(idUsuario) {
    const url = `${getFutbolBaseUrl()}/api/usuarios/${idUsuario}/alertas_tendencia`;
    return fetchJsonFutbol(url);
}

async function obtenerAnaliticaAvanzadaFutbol(idUsuario, metrica = 'velocidad_pie_ms') {
    const q = new URLSearchParams({ metrica });
    const url = `${getFutbolBaseUrl()}/api/usuarios/${idUsuario}/analitica_avanzada?${q.toString()}`;
    return fetchJsonFutbol(url);
}

// Genera vídeo anotado y devuelve un Blob (mp4).
async function generarVideoAnotadoFutbol(videoBlob, opciones = {}) {
    const formData = new FormData();
    formData.append('video', videoBlob, 'golpeo.webm');
    if (opciones.frameImpacto != null) {
        formData.append('frame_impacto', String(opciones.frameImpacto));
    }
    if (opciones.piernaGolpeo) {
        formData.append('pierna_golpeo', String(opciones.piernaGolpeo));
    }

    const url = `${getFutbolBaseUrl()}/api/futbol/video-anotado`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);  // 60s para procesamiento de video
    
    try {
        const respuesta = await fetch(url, { 
            method: 'POST', 
            body: formData,
            signal: controller.signal 
        });
        clearTimeout(timeout);
        
        if (!respuesta.ok) {
            let mensaje = `Error HTTP ${respuesta.status}`;
            try {
                const data = await respuesta.json();
                mensaje = data.error || data.mensaje || mensaje;
            } catch (_e) { /* ignore */ }
            throw new Error(mensaje);
        }
        return await respuesta.blob();
    } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            throw new Error('Timeout: generación de video anotado excedió 60s. Intenta con un video más corto.');
        }
        throw error;
    }
}

