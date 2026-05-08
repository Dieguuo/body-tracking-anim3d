const GALERIA_MODULOS = {
    salto: {
        clave: 'salto',
        nombre: 'Salto',
        titulo: 'Biblioteca de vídeos de salto',
        subtitulo: 'Filtra por usuario, tipo de salto y categoría.',
        streamBase: () => getBackendBaseUrl(),
        usuariosUrl: () => `${getBackendBaseUrl()}/api/usuarios`,
        videosUrl: (params) => `${getBackendBaseUrl()}/api/videos${params ? `?${params}` : ''}`,
        usuarioEtiqueta: (u) => `${u.alias || 'Usuario'} (ID ${u.id_usuario})`,
        getIdVideo: (video) => video.id_salto,
        getFecha: (video) => video.fecha_salto,
        getCategoriaEtiqueta: (video) => video.tipo_salto || 'sin tipo',
        getTituloTarjeta: (video) => `${video.alias || 'Usuario'} · ${video.tipo_salto || 'salto'}`,
        getMetadatos: (video) => ([
            { etiqueta: 'Fecha', valor: formatearFechaSoloFecha(video.fecha_salto) },
            { etiqueta: 'Hora', valor: formatearFechaSoloHora(video.fecha_salto) },
            { etiqueta: 'Altura', valor: video.altura_m != null ? `${formatearNumero(video.altura_m, 2)} m` : '--' },
            { etiqueta: 'Peso', valor: video.peso_kg != null ? `${formatearNumero(video.peso_kg, 1)} kg` : '--' },
            { etiqueta: 'Distancia', valor: video.distancia_cm != null ? `${video.distancia_cm} cm` : '--' },
        ]),
        getTipoLabel: (tipo) => {
            if (tipo === 'vertical') return 'verticales';
            if (tipo === 'horizontal') return 'horizontales';
            return 'saltos';
        },
        formatCardTitle: (group) => `${group.alias || 'Usuario'} (ID ${group.id_usuario})`,
        formatGroupTitle: (category, group) => {
            const prefix = category === 'comparativas' ? 'Comparativas' : 'Individuales';
            const tipo = group.tipo_salto ? ` ${GALERIA_MODULOS.salto.getTipoLabel(group.tipo_salto)}` : '';
            const nombre = group.alias || 'Usuario';
            return `${prefix}${tipo} de ${nombre} (ID ${group.id_usuario})`;
        },
        formatGroupMeta: (category, group) => {
            const total = category === 'comparativas'
                ? `${group.items.length} bloques de 4 vídeos`
                : `${group.items.length} vídeos`;
            return group.tipo_salto
                ? `${total} · tipo ${group.tipo_salto}`
                : total;
        },
    },
    futbol: {
        clave: 'futbol',
        nombre: 'Fútbol',
        titulo: 'Biblioteca de vídeos de fútbol',
        subtitulo: 'Filtra por usuario y categoría de vídeos.',
        streamBase: () => getFutbolBaseUrl(),
        usuariosUrl: () => `${getFutbolBaseUrl()}/api/usuarios_futbol?paginado=1&limit=100&offset=0`,
        videosUrl: (params) => `${getFutbolBaseUrl()}/api/videos${params ? `?${params}` : ''}`,
        usuarioEtiqueta: (u) => `${u.alias || u.nombre_completo || 'Usuario'} (ID ${u.id_usuario})`,
        getIdVideo: (video) => video.id_golpeo,
        getFecha: (video) => video.fecha_golpeo,
        getCategoriaEtiqueta: () => 'golpeo',
        getTituloTarjeta: (video) => `${video.alias || video.nombre || 'Usuario'} · Golpeo`,
        getMetadatos: (video) => ([
            { etiqueta: 'Fecha', valor: formatearFechaSoloFecha(video.fecha_golpeo) },
            { etiqueta: 'Hora', valor: formatearFechaSoloHora(video.fecha_golpeo) },
            { etiqueta: 'Pierna', valor: formatearPierna(video.pierna_golpeo) },
        ]),
        getTipoLabel: () => '',
        formatCardTitle: (group) => `${group.alias || 'Usuario'} (ID ${group.id_usuario})`,
        formatGroupTitle: (category, group) => {
            const prefix = category === 'comparativas' ? 'Comparativas' : 'Individuales';
            const nombre = group.alias || 'Usuario';
            return `${prefix} de ${nombre} (ID ${group.id_usuario})`;
        },
        formatGroupMeta: (category, group) => {
            const total = category === 'comparativas'
                ? `${group.items.length} bloques de 4 vídeos`
                : `${group.items.length} vídeos`;
            return total;
        },
    },
};

const galeriaState = {
    modulo: '',
    cargando: false,
    usuarios: [],
};


function formatearPierna(valor) {
    const texto = String(valor || '').trim().toLowerCase();
    if (!texto) {
        return '--';
    }
    if (texto === 'izquierda') {
        return 'Izquierda';
    }
    if (texto === 'derecha') {
        return 'Derecha';
    }
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function getModuloActual() {
    if (!galeriaState.modulo) {
        return '';
    }
    return GALERIA_MODULOS[galeriaState.modulo] ? galeriaState.modulo : '';
}

function getConfigModulo(modulo) {
    return GALERIA_MODULOS[modulo] || null;
}

function getFiltroCategoria() {
    return document.getElementById('filtro-categoria')?.value || 'todos';
}

function getFiltroUsuario() {
    return document.getElementById('filtro-usuario')?.value || '';
}

function getFiltroTipoSalto() {
    return document.getElementById('filtro-tipo-salto')?.value || 'todos';
}

function setEstado(texto, esError = false) {
    const estado = document.getElementById('videos-estado');
    if (!estado) {
        return;
    }
    estado.textContent = texto;
    estado.style.color = esError ? '#ff8d8d' : '';
}

function setActiveModuleButton(modulo) {
    document.querySelectorAll('.module-option').forEach((button) => {
        const isActive = button.dataset.module === modulo;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function setFiltersEnabled(enabled) {
    document.getElementById('filtro-usuario').disabled = !enabled;
    document.getElementById('filtro-categoria').disabled = !enabled;
    document.getElementById('filtro-tipo-salto').disabled = !enabled;
    document.getElementById('btn-refrescar-videos').disabled = !enabled;
    document.getElementById('btn-reset-filtros').disabled = !enabled;
}

function toggleJumpTypeVisibility(modulo) {
    const wrap = document.getElementById('filtro-tipo-salto-wrap');
    if (!wrap) {
        return;
    }
    wrap.style.display = modulo === 'salto' ? 'flex' : 'none';
}

function resetFiltersForModule(modulo) {
    const categoria = document.getElementById('filtro-categoria');
    const tipo = document.getElementById('filtro-tipo-salto');
    const usuario = document.getElementById('filtro-usuario');
    if (categoria) categoria.value = 'todos';
    if (tipo) tipo.value = 'todos';
    if (usuario) usuario.value = '';
    toggleJumpTypeVisibility(modulo);
}

async function cargarUsuariosModulo(modulo) {
    const config = getConfigModulo(modulo);
    if (!config) return [];

    // Delegate to GalleryHelper to avoid duplicating pagination/transform logic.
    if (modulo === 'salto') {
        return GalleryHelper.fetchAndPopulateUsers({
            url: config.usuariosUrl(),
            selectId: 'filtro-usuario',
            isPaginated: false,
            transformItem: (u) => ({ value: String(u.id_usuario), text: config.usuarioEtiqueta(u) }),
            fetchFn: fetchJson,
        });
    }

    // Futbol: API paginada
    return GalleryHelper.fetchAndPopulateUsers({
        url: `${getFutbolBaseUrl()}/api/usuarios_futbol`,
        selectId: 'filtro-usuario',
        isPaginated: true,
        pageSize: 100,
        transformItem: (u) => ({ value: String(u.id_usuario), text: config.usuarioEtiqueta(u) }),
        fetchFn: fetchJson,
    });
}

function buildVideoUrl(modulo, video) {
    const config = getConfigModulo(modulo);
    if (!config) {
        return '';
    }
    return `${config.streamBase()}/api/videos/${config.getIdVideo(video)}/stream`;
}

function crearVideoTarjeta(modulo, video) {
    const config = getConfigModulo(modulo);
    const card = document.createElement('article');
    card.className = 'video-row-card';

    const thumbWrap = document.createElement('button');
    thumbWrap.type = 'button';
    thumbWrap.className = 'video-thumb-wrap';
    thumbWrap.setAttribute('aria-label', 'Abrir vídeo en grande');

    const videoEl = document.createElement('video');
    videoEl.className = 'video-thumb';
    videoEl.preload = 'metadata';
    videoEl.playsInline = true;
    videoEl.muted = true;
    // Usa data-src para lazy loading: el thumbnail se cargará cuando sea visible.
    videoEl.setAttribute('data-src', buildVideoUrl(modulo, video));

    const overlay = document.createElement('div');
    overlay.className = 'video-thumb-overlay';
    const overlayLabel = document.createElement('span');
    overlayLabel.className = 'video-thumb-label';
    overlayLabel.textContent = config?.nombre || 'Vídeo';
    overlay.appendChild(overlayLabel);

    const videoUrl = buildVideoUrl(modulo, video);
    
    thumbWrap.append(videoEl, overlay);
    thumbWrap.addEventListener('click', () => {
        window.open(videoUrl, '_blank', 'noopener,noreferrer');
    });

    const meta = document.createElement('div');
    meta.className = 'video-meta';
    (config?.getMetadatos(video) || []).forEach((campo) => {
        const item = document.createElement('div');
        item.className = 'meta-item';

        const label = document.createElement('span');
        label.className = 'meta-label';
        label.textContent = campo.etiqueta;

        const value = document.createElement('span');
        value.className = 'meta-value';
        value.textContent = campo.valor;

        item.append(label, value);
        meta.appendChild(item);
    });

    const acciones = document.createElement('div');
    acciones.className = 'video-actions';

    const btnAbrir = document.createElement('button');
    btnAbrir.type = 'button';
    btnAbrir.className = 'sensor-btn secondary-btn video-open-btn';
    btnAbrir.textContent = 'Ver en grande';
    btnAbrir.addEventListener('click', () => {
        window.open(videoUrl, '_blank', 'noopener,noreferrer');
    });

    const subtitulo = document.createElement('p');
    subtitulo.className = 'video-row-subtitle';
    subtitulo.textContent = config?.getTituloTarjeta(video) || 'Vídeo';

    acciones.append(btnAbrir, subtitulo);
    card.append(thumbWrap, meta, acciones);
    return card;
}

function createGroupDescriptor(modulo, category, item) {
    if (category === 'comparativas') {
        const first = item.videos?.[0] || item;
        return {
            id_usuario: first.id_usuario,
            alias: first.alias,
            tipo_salto: modulo === 'salto' ? first.tipo_salto : '',
            items: [item],
        };
    }

    return {
        id_usuario: item.id_usuario,
        alias: item.alias,
        tipo_salto: modulo === 'salto' ? item.tipo_salto : '',
        items: [item],
    };
}

function groupEntriesByKey(modulo, category, entries) {
    const grouped = new Map();
    entries.forEach((entry) => {
        const key = category === 'comparativas'
            ? `${entry.id_usuario || 0}|${entry.alias || ''}|${entry.tipo_salto || ''}`
            : `${entry.id_usuario || 0}|${entry.alias || ''}|${modulo === 'salto' ? entry.tipo_salto || '' : ''}`;
        if (!grouped.has(key)) {
            grouped.set(key, createGroupDescriptor(modulo, category, entry));
        } else {
            grouped.get(key).items.push(entry);
        }
    });
    return Array.from(grouped.values());
}

function buildVisibleGroups(modulo, payload) {
    const categoria = getFiltroCategoria();
    const grupos = [];

    if (categoria !== 'comparativas') {
        const individuales = Array.isArray(payload.individuales) ? payload.individuales : [];
        grupos.push(...groupEntriesByKey(modulo, 'individuales', individuales).map((group) => ({
            ...group,
            category: 'individuales',
        })));
    }

    if (categoria !== 'individuales') {
        const comparativas = Array.isArray(payload.comparativas) ? payload.comparativas : [];
        grupos.push(...groupEntriesByKey(modulo, 'comparativas', comparativas).map((group) => ({
            ...group,
            category: 'comparativas',
        })));
    }

    return grupos;
}

function renderSessionCard(modulo, group, item, index) {
    const card = document.createElement('article');
    card.className = 'session-card';

    const header = document.createElement('div');
    header.className = 'session-card-header';

    const title = document.createElement('h3');
    title.className = 'session-card-title';
    if (group.category === 'comparativas') {
        const label = GALERIA_MODULOS[modulo].formatCardTitle(group);
        title.textContent = `${label} · Comparativa ${index + 1}`;
    } else {
        title.textContent = GALERIA_MODULOS[modulo].formatCardTitle(group);
    }

    const meta = document.createElement('p');
    meta.className = 'session-card-meta';
    if (group.category === 'comparativas') {
        meta.textContent = `${formatearFechaSoloFecha(item.fecha_inicio)} ${formatearFechaSoloHora(item.fecha_inicio)} · ${formatearFechaSoloFecha(item.fecha_fin)} ${formatearFechaSoloHora(item.fecha_fin)}`;
    } else {
        meta.textContent = `${group.items.length} vídeo${group.items.length === 1 ? '' : 's'}`;
    }

    header.append(title, meta);

    const list = document.createElement('div');
    list.className = 'video-list';

    if (group.category === 'comparativas') {
        (item.videos || []).forEach((video) => {
            list.appendChild(crearVideoTarjeta(modulo, video));
        });
    } else {
        (group.items || []).forEach((video) => {
            list.appendChild(crearVideoTarjeta(modulo, video));
        });
    }

    card.append(header, list);
    return card;
}

function renderGroupBlock(modulo, group) {
    const config = getConfigModulo(modulo);
    const block = document.createElement('article');
    block.className = `gallery-group gallery-group--${group.category}`;

    const header = document.createElement('div');
    header.className = 'gallery-group-header';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'gallery-group-title';
    title.textContent = config ? config.formatGroupTitle(group.category, group) : '';

    const meta = document.createElement('p');
    meta.className = 'gallery-group-meta';
    meta.textContent = config ? config.formatGroupMeta(group.category, group) : '';

    titleWrap.append(title, meta);
    header.appendChild(titleWrap);
    block.appendChild(header);

    const list = document.createElement('div');
    list.className = 'session-list';

    if (group.category === 'comparativas') {
        group.items.forEach((item, index) => {
            list.appendChild(renderSessionCard(modulo, group, item, index));
        });
    } else {
        const card = document.createElement('article');
        card.className = 'session-card';

        const headerCard = document.createElement('div');
        headerCard.className = 'session-card-header';

        const titleCard = document.createElement('h4');
        titleCard.className = 'session-card-title';
        titleCard.textContent = group.tipo_salto && modulo === 'salto'
            ? `Vídeos ${GALERIA_MODULOS.salto.getTipoLabel(group.tipo_salto)} de ${group.alias || 'Usuario'}`
            : `Vídeos de ${group.alias || 'Usuario'}`;

        const metaCard = document.createElement('p');
        metaCard.className = 'session-card-meta';
        metaCard.textContent = `${group.items.length} vídeo${group.items.length === 1 ? '' : 's'} en esta categoría`;

        headerCard.append(titleCard, metaCard);

        const listVideo = document.createElement('div');
        listVideo.className = 'video-list';
        group.items.forEach((video) => {
            listVideo.appendChild(crearVideoTarjeta(modulo, video));
        });

        card.append(headerCard, listVideo);
        list.appendChild(card);
    }

    block.appendChild(list);
    return block;
}

function renderLibrary(modulo, payload) {
    const container = document.getElementById('videos-container');
    const empty = document.getElementById('videos-empty');
    if (!container || !empty) {
        return;
    }

    container.innerHTML = '';

    const grupos = buildVisibleGroups(modulo, payload);
    if (grupos.length === 0) {
        empty.style.display = 'block';
        empty.textContent = 'No hay vídeos con los filtros seleccionados.';
        return;
    }

    empty.style.display = 'none';
    const categoriasOrden = ['comparativas', 'individuales'];
    categoriasOrden.forEach((category) => {
        const gruposCategoria = grupos.filter((group) => group.category === category);
        if (gruposCategoria.length === 0) {
            return;
        }

        const section = document.createElement('section');
        section.className = `gallery-category gallery-category--${category}`;

        const title = document.createElement('h3');
        title.className = 'gallery-category-title';
        title.textContent = category === 'comparativas' ? 'Comparativas' : 'Individuales';

        const meta = document.createElement('p');
        meta.className = 'gallery-category-meta';
        meta.textContent = category === 'comparativas'
            ? 'Bloques de 4 vídeos agrupados por usuario y tipo.'
            : 'Vídeos sueltos agrupados por usuario y tipo.';

        section.append(title, meta);

        gruposCategoria.forEach((group) => {
            section.appendChild(renderGroupBlock(modulo, group));
        });

        container.appendChild(section);
    });

    // Inicia lazy loading para todos los thumbnails de vídeo: cargarán cuando sean visibles.
    LazyLoadHelper.observeElements('video.video-thumb', 'data-src');
}

async function cargarBiblioteca() {
    const modulo = getModuloActual();
    if (!modulo) {
        setEstado('Selecciona salto o fútbol para cargar la biblioteca.');
        setFiltersEnabled(false);
        const container = document.getElementById('videos-container');
        if (container) {
            container.innerHTML = '';
        }
        const empty = document.getElementById('videos-empty');
        if (empty) {
            empty.style.display = 'block';
            empty.textContent = 'Selecciona un módulo para ver los vídeos disponibles.';
        }
        return;
    }

    const config = getConfigModulo(modulo);
    if (!config) {
        return;
    }

    const tipo = modulo === 'salto' ? getFiltroTipoSalto() : '';
    const usuario = getFiltroUsuario();

    galeriaState.cargando = true;
    setEstado('Cargando biblioteca...');

    // Construye caché key basada en módulo, usuario y tipo.
    const cacheKey = `${config.videosUrl('')}|modulo=${modulo}|usuario=${usuario}|tipo=${tipo}`;
    const cached = CacheManager.get(cacheKey, { modulo, usuario, tipo });
    if (cached) {
        galeriaState.cargando = false;
        galeriaState.modulo = modulo;
        document.getElementById('library-title').textContent = config.titulo;
        document.getElementById('library-subtitle').textContent = config.subtitulo;

        const visibles = buildVisibleGroups(modulo, cached);
        const totalVideos = visibles.reduce((acumulado, grupo) => {
            if (grupo.category === 'comparativas') {
                return acumulado + grupo.items.reduce((suma, item) => suma + (Array.isArray(item.videos) ? item.videos.length : 0), 0);
            }
            return acumulado + grupo.items.length;
        }, 0);

        let descripcion = `${totalVideos} vídeo${totalVideos === 1 ? '' : 's'} visibles (caché)`;
        const totales = cached.totales || {};
        if (totales.individuales !== undefined || totales.comparativas !== undefined) {
            descripcion += ` · ${totales.individuales || 0} individuales, ${totales.comparativas || 0} comparativas`;
        }
        setEstado(descripcion);
        renderLibrary(modulo, cached);
        return;
    }

    // Si no está en caché, fetch desde backend.
    const params = new URLSearchParams();
    if (usuario) {
        params.set('id_usuario', usuario);
    }
    if (modulo === 'salto' && tipo && tipo !== 'todos') {
        params.set('tipo', tipo);
    }

    const payload = await fetchJson(config.videosUrl(params.toString()));

    // Guarda en caché para evitar refetch dentro de 5 minutos.
    CacheManager.set(cacheKey, payload, { modulo, usuario, tipo });

    galeriaState.cargando = false;
    galeriaState.modulo = modulo;

    document.getElementById('library-title').textContent = config.titulo;
    document.getElementById('library-subtitle').textContent = config.subtitulo;

    const totales = payload.totales || {};
    const visibles = buildVisibleGroups(modulo, payload);
    const totalVideos = visibles.reduce((acumulado, grupo) => {
        if (grupo.category === 'comparativas') {
            return acumulado + grupo.items.reduce((suma, item) => suma + (Array.isArray(item.videos) ? item.videos.length : 0), 0);
        }
        return acumulado + grupo.items.length;
    }, 0);

    let descripcion = `${totalVideos} vídeo${totalVideos === 1 ? '' : 's'} visibles`;
    if (totales.individuales !== undefined || totales.comparativas !== undefined) {
        descripcion += ` · ${totales.individuales || 0} individuales, ${totales.comparativas || 0} comparativas`;
    }
    setEstado(descripcion);

    renderLibrary(modulo, payload);
}

function actualizarCabeceraModulo(modulo) {
    const config = getConfigModulo(modulo);
    if (!config) {
        return;
    }
    document.getElementById('library-title').textContent = config.titulo;
    document.getElementById('library-subtitle').textContent = config.subtitulo;
}

async function activarModulo(modulo, forzarRecarga = false) {
    if (!getConfigModulo(modulo)) {
        return;
    }

    galeriaState.modulo = modulo;
    setActiveModuleButton(modulo);
    toggleJumpTypeVisibility(modulo);
    setFiltersEnabled(true);
    actualizarCabeceraModulo(modulo);

    if (galeriaState.usuarios.length === 0 || forzarRecarga) {
        galeriaState.usuarios = await cargarUsuariosModulo(modulo);
    }

    await cargarBiblioteca();
}

function conectarEventos() {
    // Debouncida handler para evitar múltiples llamadas mientras el usuario interactúa.
    const cargarBibliotecaDebouncida = GalleryHelper.debounce(() => {
        if (!galeriaState.modulo) return;
        cargarBiblioteca().catch((error) => setEstado(`Error: ${error.message}`, true));
    }, 300);

    document.querySelectorAll('.module-option').forEach((button) => {
        button.addEventListener('click', () => {
            const modulo = button.dataset.module;
            if (modulo && modulo !== galeriaState.modulo) {
                resetFiltersForModule(modulo);
                activarModulo(modulo, true).catch((error) => {
                    setEstado(`Error: ${error.message}`, true);
                });
            }
        });
    });

    // Listeners con debounce: evita cargar múltiples veces mientras el usuario cambia filtros.
    document.getElementById('filtro-usuario')?.addEventListener('change', cargarBibliotecaDebouncida);
    document.getElementById('filtro-categoria')?.addEventListener('change', cargarBibliotecaDebouncida);
    document.getElementById('filtro-tipo-salto')?.addEventListener('change', cargarBibliotecaDebouncida);

    // Botón de actualizar: sin debounce, el usuario lo pulsa deliberadamente para refrescar.
    document.getElementById('btn-refrescar-videos')?.addEventListener('click', () => {
        if (!galeriaState.modulo) return;
        CacheManager.clear(); // Limpia caché para forzar refetch.
        cargarBiblioteca().catch((error) => setEstado(`Error: ${error.message}`, true));
    });

    // Reset de filtros: también sin debounce, es una acción deliberada.
    document.getElementById('btn-reset-filtros')?.addEventListener('click', () => {
        if (!galeriaState.modulo) return;
        resetFiltersForModule(galeriaState.modulo);
        cargarBiblioteca().catch((error) => setEstado(`Error: ${error.message}`, true));
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    conectarEventos();
    setFiltersEnabled(false);

    const initialModule = new URLSearchParams(window.location.search).get('module')
        || new URLSearchParams(window.location.search).get('modulo')
        || '';

    if (getConfigModulo(initialModule)) {
        resetFiltersForModule(initialModule);
        try {
            await activarModulo(initialModule, true);
        } catch (error) {
            setEstado(`Error: ${error.message}`, true);
        }
    }
});