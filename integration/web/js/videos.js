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

// fetchJson() se carga desde js/api-client.js

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
    // Usa data-src para lazy loading: el video solo se cargará cuando sea visible.
    videoEl.setAttribute('data-src', `${getBackendBaseUrl()}/api/videos/${video.id_salto}/stream`);

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

    // Inicia lazy loading para todos los videos: cargarán cuando sean visibles en pantalla.
    LazyLoadHelper.observeElements('video.video-player', 'data-src');
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

    // Inicia lazy loading para todos los videos: cargarán cuando sean visibles en pantalla.
    LazyLoadHelper.observeElements('video.video-player', 'data-src');
}

// Utiliza GalleryHelper para evitar duplicación entre módulos.
async function cargarUsuarios() {
    return GalleryHelper.fetchAndPopulateUsers({
        url: `${getBackendBaseUrl()}/api/usuarios`,
        selectId: 'filtro-usuario',
        isPaginated: false,
        transformItem: (u) => ({ value: String(u.id_usuario), text: `${u.alias || u.nombre || 'Usuario'} (ID ${u.id_usuario})` }),
        fetchFn: fetchJson,
    });
}

async function cargarBiblioteca() {
    const usuario = document.getElementById('filtro-usuario')?.value || '';
    const tipo = document.getElementById('filtro-tipo')?.value || '';

    GalleryHelper.setEstado('videos-estado', 'Cargando biblioteca...');

    const params = new URLSearchParams();
    if (usuario) params.set('id_usuario', usuario);
    if (tipo) params.set('tipo', tipo);

    const url = `${getBackendBaseUrl()}/api/videos`;
    // Intenta obtener del caché primero para evitar latencia innecesaria.
    const cacheKey = `${url}|usuario=${usuario}|tipo=${tipo}`;
    const cached = CacheManager.get(cacheKey, { usuario, tipo });
    if (cached) {
        renderComparativas(cached.comparativas || []);
        renderIndividuales(cached.individuales || []);
        const total = Number(cached.totales?.videos || 0);
        GalleryHelper.setEstado('videos-estado', `${total} vídeos encontrados (caché).`);
        return;
    }

    // Si no está en caché, fetch desde backend.
    const fullUrl = params.toString() ? `${url}?${params.toString()}` : url;
    const payload = await fetchJson(fullUrl);

    // Guarda en caché para evitar refetch dentro de 5 minutos.
    CacheManager.set(cacheKey, payload, { usuario, tipo });

    renderComparativas(payload.comparativas || []);
    renderIndividuales(payload.individuales || []);

    const total = Number(payload.totales?.videos || 0);
    GalleryHelper.setEstado('videos-estado', `${total} vídeos encontrados.`);
}

document.addEventListener('DOMContentLoaded', async () => {
    const estado = document.getElementById('videos-estado');
    const btnRefrescar = document.getElementById('btn-refrescar-videos');

    // Crea versión debouncida de cargarBiblioteca para evitar múltiples llamadas rápidas.
    // Espera 300ms después del último cambio antes de ejecutar.
    const cargarBibliotecaDebouncida = GalleryHelper.debounce(
        () => cargarBiblioteca().catch((error) => GalleryHelper.setEstado('videos-estado', `Error: ${error.message}`, true)),
        300
    );

    try {
        await cargarUsuarios();
        await cargarBiblioteca();
    } catch (error) {
        GalleryHelper.setEstado('videos-estado', `Error: ${error.message}`, true);
    }

    // Listener con debounce: evita llamadas múltiples mientras el usuario sigue seleccionando.
    document.getElementById('filtro-usuario')?.addEventListener('change', cargarBibliotecaDebouncida);

    // Listener con debounce: igual para el filtro de tipo.
    document.getElementById('filtro-tipo')?.addEventListener('change', cargarBibliotecaDebouncida);

    // Botón de actualizar manual sin debounce: usuario puede forzar recarga.
    btnRefrescar?.addEventListener('click', () => {
        CacheManager.clear();
        cargarBiblioteca().catch((error) => GalleryHelper.setEstado('videos-estado', `Error: ${error.message}`, true));
    });
});
