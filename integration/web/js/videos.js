function formatearFecha(fechaIso) {
    if (!fechaIso) {
        return 'Sin fecha';
    }
    const fecha = new Date(fechaIso);
    if (Number.isNaN(fecha.getTime())) {
        return 'Sin fecha';
    }
    return fecha.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function fetchJson(url, options = {}) {
    let respuesta;
    try {
        respuesta = await fetch(url, options);
    } catch (_error) {
        throw new Error(`No hay conexión con el backend (${getBackendBaseUrl()}).`);
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
        throw new Error(payload.error || `Error HTTP: ${respuesta.status}`);
    }

    return payload;
}

function crearControlesVideo(videoEl) {
    const controles = document.createElement('div');
    controles.className = 'video-controls-row';

    const btnPlayPause = document.createElement('button');
    btnPlayPause.type = 'button';
    btnPlayPause.className = 'sensor-btn ghost-btn video-mini-btn';
    btnPlayPause.textContent = 'Play/Pause';
    btnPlayPause.addEventListener('click', () => {
        if (videoEl.paused) {
            videoEl.play().catch(() => {
                // Ignorar bloqueo de autoplay.
            });
        } else {
            videoEl.pause();
        }
    });

    const btnBack = document.createElement('button');
    btnBack.type = 'button';
    btnBack.className = 'sensor-btn ghost-btn video-mini-btn';
    btnBack.textContent = '-10s';
    btnBack.addEventListener('click', () => {
        videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
    });

    const btnForward = document.createElement('button');
    btnForward.type = 'button';
    btnForward.className = 'sensor-btn ghost-btn video-mini-btn';
    btnForward.textContent = '+10s';
    btnForward.addEventListener('click', () => {
        const dur = Number.isFinite(videoEl.duration) ? videoEl.duration : videoEl.currentTime + 10;
        videoEl.currentTime = Math.min(dur, videoEl.currentTime + 10);
    });

    controles.append(btnBack, btnPlayPause, btnForward);
    return controles;
}

function crearCardVideo(video) {
    const card = document.createElement('article');
    card.className = 'video-card';

    const header = document.createElement('div');
    header.className = 'video-card-header';

    const titulo = document.createElement('h3');
    titulo.className = 'video-card-title';
    titulo.textContent = `${video.alias || 'Usuario'} · ${String(video.tipo_salto || '').toUpperCase()}`;

    const meta = document.createElement('p');
    meta.className = 'sensor-nota';
    const distancia = video.distancia_cm != null ? `${video.distancia_cm} cm` : '-- cm';
    meta.textContent = `${formatearFecha(video.fecha_salto)} · ${distancia}`;

    header.append(titulo, meta);

    const videoEl = document.createElement('video');
    videoEl.className = 'video-player';
    videoEl.controls = true;
    videoEl.preload = 'metadata';
    videoEl.src = `${getBackendBaseUrl()}/api/videos/${video.id_salto}/stream`;

    const controles = crearControlesVideo(videoEl);

    card.append(header, videoEl, controles);
    return card;
}

function renderComparativas(comparativas) {
    const container = document.getElementById('comparativas-container');
    const empty = document.getElementById('comparativas-empty');
    if (!container || !empty) {
        return;
    }

    container.innerHTML = '';

    if (!comparativas || comparativas.length === 0) {
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';

    comparativas.forEach((grupo) => {
        const card = document.createElement('article');
        card.className = 'comparativa-card';

        const titulo = document.createElement('h3');
        titulo.className = 'comparativa-card-title';
        const tipo = String(grupo.tipo_salto || '').toUpperCase();
        titulo.textContent = `Comparativa ${tipo} · ${grupo.alias || 'Usuario'}`;

        const meta = document.createElement('p');
        meta.className = 'sensor-nota';
        meta.textContent = `Inicio: ${formatearFecha(grupo.fecha_inicio)} · Fin: ${formatearFecha(grupo.fecha_fin)} · ${grupo.total_videos || 0} vídeos`;

        const videosWrap = document.createElement('div');
        videosWrap.className = 'comparativa-videos-grid';

        (grupo.videos || []).forEach((video) => {
            videosWrap.appendChild(crearCardVideo(video));
        });

        card.append(titulo, meta, videosWrap);
        container.appendChild(card);
    });
}

function renderIndividuales(individuales) {
    const container = document.getElementById('individuales-container');
    const empty = document.getElementById('individuales-empty');
    if (!container || !empty) {
        return;
    }

    container.innerHTML = '';

    if (!individuales || individuales.length === 0) {
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    individuales.forEach((video) => {
        container.appendChild(crearCardVideo(video));
    });
}

async function cargarUsuarios() {
    const select = document.getElementById('filtro-usuario');
    if (!select) {
        return;
    }

    select.innerHTML = '';

    const optionTodos = document.createElement('option');
    optionTodos.value = '';
    optionTodos.textContent = 'Todos los usuarios';
    select.appendChild(optionTodos);

    const payload = await fetchJson(`${getBackendBaseUrl()}/api/usuarios`);
    const usuarios = Array.isArray(payload) ? payload : (payload.items || []);

    usuarios
        .sort((a, b) => String(a.alias || '').localeCompare(String(b.alias || '')))
        .forEach((u) => {
            const opt = document.createElement('option');
            opt.value = String(u.id_usuario);
            opt.textContent = `${u.alias} (ID ${u.id_usuario})`;
            select.appendChild(opt);
        });
}

async function cargarBiblioteca() {
    const estado = document.getElementById('videos-estado');
    const usuario = document.getElementById('filtro-usuario')?.value || '';
    const tipo = document.getElementById('filtro-tipo')?.value || '';

    if (estado) {
        estado.textContent = 'Cargando biblioteca...';
    }

    const params = new URLSearchParams();
    if (usuario) params.set('id_usuario', usuario);
    if (tipo) params.set('tipo', tipo);

    const url = `${getBackendBaseUrl()}/api/videos${params.toString() ? `?${params.toString()}` : ''}`;
    const payload = await fetchJson(url);

    renderComparativas(payload.comparativas || []);
    renderIndividuales(payload.individuales || []);

    if (estado) {
        const total = Number(payload.totales?.videos || 0);
        estado.textContent = `${total} vídeos encontrados.`;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const estado = document.getElementById('videos-estado');
    const btnRefrescar = document.getElementById('btn-refrescar-videos');

    try {
        await cargarUsuarios();
        await cargarBiblioteca();
    } catch (error) {
        if (estado) {
            estado.textContent = `Error: ${error.message}`;
            estado.style.color = '#ff6b6b';
        }
    }

    document.getElementById('filtro-usuario')?.addEventListener('change', () => {
        cargarBiblioteca().catch((error) => {
            if (estado) {
                estado.textContent = `Error: ${error.message}`;
                estado.style.color = '#ff6b6b';
            }
        });
    });

    document.getElementById('filtro-tipo')?.addEventListener('change', () => {
        cargarBiblioteca().catch((error) => {
            if (estado) {
                estado.textContent = `Error: ${error.message}`;
                estado.style.color = '#ff6b6b';
            }
        });
    });

    btnRefrescar?.addEventListener('click', () => {
        cargarBiblioteca().catch((error) => {
            if (estado) {
                estado.textContent = `Error: ${error.message}`;
                estado.style.color = '#ff6b6b';
            }
        });
    });
});
