// getBackendBaseUrl() se carga desde js/config.js

function setUsuarioActivo(usuario) {
    sessionStorage.setItem('idUser', String(usuario.id_usuario));
    sessionStorage.setItem('aliasUser', usuario.alias);
    sessionStorage.setItem('nombreUser', usuario.nombre_completo);
    sessionStorage.setItem('alturaUser', String(usuario.altura_m));

    const alturaInput = document.getElementById('altura-usuario');
    if (alturaInput) {
        alturaInput.value = usuario.altura_m;
    }

    const estado = document.getElementById('usuario-estado');
    if (estado) {
        estado.textContent = `Usuario activo: ${usuario.alias} (ID ${usuario.id_usuario})`;
        estado.style.color = '#34c759';
    }
}

async function crearUsuario(alias, nombreCompleto, alturaM) {
    const url = `${getBackendBaseUrl()}/api/usuarios`;
    const respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            alias: alias,
            nombre_completo: nombreCompleto,
            altura_m: alturaM
        })
    });

    const payload = await respuesta.json();
    if (!respuesta.ok) {
        throw new Error(payload.error || payload.mensaje || `Error HTTP: ${respuesta.status}`);
    }

    return payload.id_usuario;
}

async function obtenerUsuarios() {
    const url = `${getBackendBaseUrl()}/api/usuarios`;
    const respuesta = await fetch(url);
    const payload = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(payload.error || `Error HTTP: ${respuesta.status}`);
    }

    return payload;
}

async function obtenerUsuariosPaginados({ search = '', limit = 20, offset = 0 }) {
    const query = new URLSearchParams({
        paginado: '1',
        search,
        limit: String(limit),
        offset: String(offset)
    });
    const url = `${getBackendBaseUrl()}/api/usuarios?${query.toString()}`;
    const respuesta = await fetch(url);
    const payload = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(payload.error || `Error HTTP: ${respuesta.status}`);
    }

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

document.addEventListener('DOMContentLoaded', () => {
    const formRegistro = document.getElementById('registro-form');
    const mensajeEstado = document.getElementById('mensaje-estado');
    const btnSubmit = document.getElementById('btn-submit');

    if (formRegistro && btnSubmit && mensajeEstado) {
        formRegistro.addEventListener('submit', async (evento) => {
            evento.preventDefault();

            const alias = document.getElementById('alias').value.trim();
            const nombreCompleto = document.getElementById('nombre_completo').value.trim();
            const alturaM = parseFloat(document.getElementById('altura_m').value);

            const textoOriginal = btnSubmit.textContent;
            btnSubmit.textContent = 'Guardando...';
            btnSubmit.disabled = true;
            mensajeEstado.textContent = '';

            try {
                const idUsuario = await crearUsuario(alias, nombreCompleto, alturaM);
                setUsuarioActivo({
                    id_usuario: idUsuario,
                    alias: alias,
                    nombre_completo: nombreCompleto,
                    altura_m: alturaM
                });

                mensajeEstado.textContent = 'Usuario registrado correctamente.';
                mensajeEstado.style.color = '#34c759';
                formRegistro.reset();
                setTimeout(() => {
                    window.location.href = 'salto.html';
                }, 1200);
            } catch (error) {
                mensajeEstado.textContent = `Error: ${error.message}`;
                mensajeEstado.style.color = '#ff6b6b';
            } finally {
                btnSubmit.textContent = textoOriginal;
                btnSubmit.disabled = false;
            }
        });
    }

    const tablaBody = document.getElementById('tabla-usuarios-body');
    const tablaWrapper = document.getElementById('tabla-usuarios-wrapper');
    const inputBuscar = document.getElementById('buscar-usuario');
    const usuariosLoading = document.getElementById('usuarios-loading');
    const usuariosEmpty = document.getElementById('usuarios-empty');
    const btnRefrescar = document.getElementById('btn-refrescar-usuarios');
    const btnCrearInline = document.getElementById('btn-crear-usuario-inline');

    const PAGE_SIZE = 20;
    let usuariosOffset = 0;
    let usuariosHasMore = true;
    let usuariosLoadingPage = false;
    let terminoBusqueda = '';
    let usuarioActivoId = Number(sessionStorage.getItem('idUser') || '0');

    function obtenerEdadTexto(u) {
        if (u.edad !== undefined && u.edad !== null && String(u.edad).trim() !== '') {
            return String(u.edad);
        }
        if (u.altura_m !== undefined && u.altura_m !== null) {
            return `${u.altura_m} m`;
        }
        return '-';
    }

    function pintarFilaUsuario(u) {
        if (!tablaBody) {
            return;
        }
        const tr = document.createElement('tr');
        tr.dataset.idUsuario = String(u.id_usuario);
        if (Number(u.id_usuario) === usuarioActivoId) {
            tr.classList.add('activo');
        }

        tr.innerHTML = `
            <td>${u.alias || ''}</td>
            <td>${u.nombre_completo || ''}</td>
            <td>${obtenerEdadTexto(u)}</td>
        `;

        tr.addEventListener('click', () => {
            usuarioActivoId = Number(u.id_usuario);
            document.querySelectorAll('#tabla-usuarios-body tr').forEach((row) => row.classList.remove('activo'));
            tr.classList.add('activo');
            setUsuarioActivo({
                id_usuario: u.id_usuario,
                alias: u.alias,
                nombre_completo: u.nombre_completo,
                altura_m: Number(u.altura_m)
            });
        });

        tablaBody.appendChild(tr);
    }

    function actualizarEstadosTabla() {
        if (!usuariosLoading || !usuariosEmpty || !tablaBody) {
            return;
        }
        usuariosLoading.style.display = usuariosLoadingPage ? 'block' : 'none';
        usuariosEmpty.style.display = (!usuariosLoadingPage && tablaBody.children.length === 0) ? 'block' : 'none';
    }

    async function cargarSiguientePaginaUsuarios(reset = false) {
        if (!tablaBody || usuariosLoadingPage || (!usuariosHasMore && !reset)) {
            return;
        }

        if (reset) {
            usuariosOffset = 0;
            usuariosHasMore = true;
            tablaBody.innerHTML = '';
        }

        usuariosLoadingPage = true;
        actualizarEstadosTabla();

        try {
            const data = await obtenerUsuariosPaginados({
                search: terminoBusqueda,
                limit: PAGE_SIZE,
                offset: usuariosOffset
            });

            data.items.forEach((u) => pintarFilaUsuario(u));
            usuariosOffset += data.items.length;
            usuariosHasMore = Boolean(data.has_more);
        } catch (error) {
            const estado = document.getElementById('usuario-estado');
            if (estado) {
                estado.textContent = `No se pudo cargar usuarios: ${error.message}`;
                estado.style.color = '#ff6b6b';
            }
        } finally {
            usuariosLoadingPage = false;
            actualizarEstadosTabla();
        }
    }

    async function recargarUsuariosSelect() {
        if (!tablaBody) {
            return;
        }
        await cargarSiguientePaginaUsuarios(true);
    }

    if (tablaBody) {
        recargarUsuariosSelect().catch((error) => {
            const estado = document.getElementById('usuario-estado');
            if (estado) {
                estado.textContent = `No se pudo cargar usuarios: ${error.message}`;
                estado.style.color = '#ff6b6b';
            }
        });
    }

    if (tablaWrapper) {
        tablaWrapper.addEventListener('scroll', () => {
            const cercaDelFinal = tablaWrapper.scrollTop + tablaWrapper.clientHeight >= (tablaWrapper.scrollHeight - 40);
            if (cercaDelFinal) {
                cargarSiguientePaginaUsuarios(false);
            }
        });
    }

    if (inputBuscar) {
        let timer = null;
        inputBuscar.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                terminoBusqueda = inputBuscar.value.trim();
                cargarSiguientePaginaUsuarios(true);
            }, 250);
        });
    }

    if (btnRefrescar) {
        btnRefrescar.addEventListener('click', async () => {
            const estado = document.getElementById('usuario-estado');
            try {
                await recargarUsuariosSelect();
                if (estado) {
                    estado.textContent = 'Lista de usuarios actualizada.';
                    estado.style.color = 'var(--text-muted)';
                }
            } catch (error) {
                if (estado) {
                    estado.textContent = `Error al actualizar: ${error.message}`;
                    estado.style.color = '#ff6b6b';
                }
            }
        });
    }

    if (btnCrearInline) {
        btnCrearInline.addEventListener('click', async () => {
            const alias = (document.getElementById('nuevo-alias')?.value || '').trim();
            const nombre = (document.getElementById('nuevo-nombre')?.value || '').trim();
            const altura = parseFloat(document.getElementById('nuevo-altura')?.value || '0');
            const estado = document.getElementById('usuario-estado');

            if (!alias || !nombre || !(altura > 0)) {
                if (estado) {
                    estado.textContent = 'Completa alias, nombre y altura para crear usuario.';
                    estado.style.color = '#ffb020';
                }
                return;
            }

            btnCrearInline.disabled = true;
            const texto = btnCrearInline.textContent;
            btnCrearInline.textContent = 'Creando...';
            try {
                const idUsuario = await crearUsuario(alias, nombre, altura);
                usuarioActivoId = idUsuario;
                await recargarUsuariosSelect();

                setUsuarioActivo({
                    id_usuario: idUsuario,
                    alias: alias,
                    nombre_completo: nombre,
                    altura_m: altura
                });

                const aliasInput = document.getElementById('nuevo-alias');
                const nombreInput = document.getElementById('nuevo-nombre');
                const alturaInput = document.getElementById('nuevo-altura');
                if (aliasInput) aliasInput.value = '';
                if (nombreInput) nombreInput.value = '';
                if (alturaInput) alturaInput.value = '';
            } catch (error) {
                if (estado) {
                    estado.textContent = `No se pudo crear el usuario: ${error.message}`;
                    estado.style.color = '#ff6b6b';
                }
            } finally {
                btnCrearInline.disabled = false;
                btnCrearInline.textContent = texto;
            }
        });
    }
});
