
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
    const nombreUsuario = video.alias || video.nombre || 'Usuario';
    titulo.textContent = `${nombreUsuario} · Golpeo`;

    const meta = document.createElement('p');
    meta.className = 'sensor-nota';
    const pierna = video.pierna_golpeo || '--';
    const rodilla = formatearNumero(video.angulo_rodilla_deg);
    meta.textContent = `${formatearFecha(video.fecha_golpeo)} · Pierna: ${pierna} · Ang. rodilla: ${rodilla} deg`;

    header.append(titulo, meta);

    const videoEl = document.createElement('video');
    videoEl.className = 'video-player';
    videoEl.controls = true;
    videoEl.preload = 'metadata';
    // Usa data-src para lazy loading: el video solo se cargará cuando sea visible.
    videoEl.setAttribute('data-src', `${getFutbolBaseUrl()}/api/videos/${video.id_golpeo}/stream`);

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
        const nombreGrupo = grupo.alias || grupo.nombre || 'Usuario';
        titulo.textContent = `Comparativa · ${nombreGrupo}`;

        const meta = document.createElement('p');
        meta.className = 'sensor-nota';
        meta.textContent = `Inicio: ${formatearFecha(grupo.fecha_inicio)} · Fin: ${formatearFecha(grupo.fecha_fin)} · ${grupo.total_videos || 0} videos`;

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

async function cargarUsuarios() {
    return GalleryHelper.fetchAndPopulateUsers({
        url: `${getFutbolBaseUrl()}/api/usuarios_futbol`,
        selectId: 'filtro-usuario',
        isPaginated: true,
        pageSize: 100,
        transformItem: (u) => ({ value: String(u.id_usuario), text: `${u.alias || u.nombre_completo || u.nombre || 'Usuario'} (ID ${u.id_usuario})` }),
        fetchFn: fetchJsonFutbol,
    });
}

async function cargarBiblioteca() {
    const usuario = document.getElementById('filtro-usuario')?.value || '';

    GalleryHelper.setEstado('videos-estado', 'Cargando biblioteca...');

    // Intenta obtener del caché primero para evitar latencia innecesaria.
    const baseUrl = `${getFutbolBaseUrl()}/api/videos`;
    const cacheKey = `${baseUrl}|usuario=${usuario}`;
    const cached = CacheManager.get(cacheKey, { usuario });
    if (cached) {
        renderComparativas(cached.comparativas || []);
        renderIndividuales(cached.individuales || []);
        const total = Number(cached.totales?.videos || 0);
        GalleryHelper.setEstado('videos-estado', `${total} videos encontrados (caché).`);
        return;
    }

    // Si no está en caché, fetch desde backend.
    const params = new URLSearchParams();
    if (usuario) params.set('id_usuario', usuario);

    const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
    const payload = await fetchJsonFutbol(url);

    // Guarda en caché para evitar refetch dentro de 5 minutos.
    CacheManager.set(cacheKey, payload, { usuario });

    renderComparativas(payload.comparativas || []);
    renderIndividuales(payload.individuales || []);

    const total = Number(payload.totales?.videos || 0);
    GalleryHelper.setEstado('videos-estado', `${total} videos encontrados.`);
}

document.addEventListener('DOMContentLoaded', async () => {
    const estado = document.getElementById('videos-estado');
    const btnRefrescar = document.getElementById('btn-refrescar-videos');

    // Crea versión debouncida de cargarBiblioteca para evitar múltiples llamadas rápidas.
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

    // Listener con debounce: evita múltiples llamadas mientras el usuario sigue seleccionando.
    document.getElementById('filtro-usuario')?.addEventListener('change', cargarBibliotecaDebouncida);

    // Botón de actualizar manual: limpia caché y fuerza recarga desde backend.
    btnRefrescar?.addEventListener('click', () => {
        CacheManager.clear();
        cargarBiblioteca().catch((error) => GalleryHelper.setEstado('videos-estado', `Error: ${error.message}`, true));
    });
});
