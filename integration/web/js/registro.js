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

    document.dispatchEvent(new CustomEvent('usuarioSeleccionCambio', {
        detail: { seleccionado: true, usuario }
    }));
}

function limpiarUsuarioActivo(mensaje = 'Sin usuario activo.') {
    sessionStorage.removeItem('idUser');
    sessionStorage.removeItem('aliasUser');
    sessionStorage.removeItem('nombreUser');
    sessionStorage.removeItem('alturaUser');

    const alturaInput = document.getElementById('altura-usuario');
    if (alturaInput) {
        alturaInput.value = '';
    }

    const estado = document.getElementById('usuario-estado');
    if (estado) {
        estado.textContent = mensaje;
        estado.style.color = 'var(--text-muted)';
    }

    document.dispatchEvent(new CustomEvent('usuarioSeleccionCambio', {
        detail: { seleccionado: false }
    }));
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

async function actualizarUsuario(idUsuario, alias, nombreCompleto, alturaM) {
    const url = `${getBackendBaseUrl()}/api/usuarios/${idUsuario}`;
    const respuesta = await fetch(url, {
        method: 'PUT',
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
}

async function eliminarUsuario(idUsuario) {
    const url = `${getBackendBaseUrl()}/api/usuarios/${idUsuario}`;
    const respuesta = await fetch(url, { method: 'DELETE' });
    const payload = await respuesta.json();
    if (!respuesta.ok) {
        throw new Error(payload.error || payload.mensaje || `Error HTTP: ${respuesta.status}`);
    }
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
    const btnEditar = document.getElementById('btn-editar-usuario');
    const btnEliminar = document.getElementById('btn-eliminar-usuario');
    const btnCancelarEdicion = document.getElementById('btn-cancelar-edicion');
    const inputAlias = document.getElementById('nuevo-alias');
    const inputNombre = document.getElementById('nuevo-nombre');
    const inputAltura = document.getElementById('nuevo-altura');

    const PAGE_SIZE = 20;
    let usuariosOffset = 0;
    let usuariosHasMore = true;
    let usuariosLoadingPage = false;
    let terminoBusqueda = '';
    let usuarioActivoId = Number(sessionStorage.getItem('idUser') || '0');
    let usuarioActivoData = null;
    let modoEdicion = false;

    function setEstado(mensaje, color = 'var(--text-muted)') {
        const estado = document.getElementById('usuario-estado');
        if (estado) {
            estado.textContent = mensaje;
            estado.style.color = color;
        }
    }

    function limpiarFormularioUsuario() {
        if (inputAlias) inputAlias.value = '';
        if (inputNombre) inputNombre.value = '';
        if (inputAltura) inputAltura.value = '';
    }

    function activarModoEdicion(usuario) {
        if (!usuario || !inputAlias || !inputNombre || !inputAltura || !btnCrearInline || !btnCancelarEdicion) {
            return;
        }
        modoEdicion = true;
        inputAlias.value = usuario.alias || '';
        inputNombre.value = usuario.nombre_completo || '';
        inputAltura.value = String(usuario.altura_m ?? '');
        btnCrearInline.textContent = 'Guardar cambios';
        btnCancelarEdicion.style.display = 'block';
        setEstado(`Editando usuario: ${usuario.alias}`, '#c897ff');
    }

    function desactivarModoEdicion() {
        modoEdicion = false;
        if (btnCrearInline) btnCrearInline.textContent = 'Crear usuario';
        if (btnCancelarEdicion) btnCancelarEdicion.style.display = 'none';
        limpiarFormularioUsuario();
    }

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
            usuarioActivoData = u;
            setUsuarioActivo({
                id_usuario: u.id_usuario,
                alias: u.alias,
                nombre_completo: u.nombre_completo,
                altura_m: Number(u.altura_m)
            });
        }

        tr.innerHTML = `
            <td>${u.alias || ''}</td>
            <td>${u.nombre_completo || ''}</td>
            <td>${obtenerEdadTexto(u)}</td>
        `;

        tr.addEventListener('click', () => {
            usuarioActivoId = Number(u.id_usuario);
            usuarioActivoData = u;
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
            setEstado(`No se pudo cargar usuarios: ${error.message}`, '#ff6b6b');
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
            setEstado(`No se pudo cargar usuarios: ${error.message}`, '#ff6b6b');
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
            try {
                await recargarUsuariosSelect();
                setEstado('Lista de usuarios actualizada.');
            } catch (error) {
                setEstado(`Error al actualizar: ${error.message}`, '#ff6b6b');
            }
        });
    }

    if (btnEditar) {
        btnEditar.addEventListener('click', () => {
            if (!usuarioActivoData) {
                setEstado('Selecciona un usuario para editar.', '#ffb020');
                return;
            }
            activarModoEdicion(usuarioActivoData);
        });
    }

    if (btnEliminar) {
        btnEliminar.addEventListener('click', async () => {
            if (!usuarioActivoData) {
                setEstado('Selecciona un usuario para eliminar.', '#ffb020');
                return;
            }

            const confirmado = window.confirm(`¿Eliminar al usuario ${usuarioActivoData.alias}? Esta accion no se puede deshacer.`);
            if (!confirmado) {
                return;
            }

            btnEliminar.disabled = true;
            const texto = btnEliminar.textContent;
            btnEliminar.textContent = 'Eliminando...';
            try {
                await eliminarUsuario(usuarioActivoData.id_usuario);
                if (Number(sessionStorage.getItem('idUser') || '0') === Number(usuarioActivoData.id_usuario)) {
                    limpiarUsuarioActivo('Usuario eliminado. Selecciona otro para continuar.');
                }
                usuarioActivoId = 0;
                usuarioActivoData = null;
                desactivarModoEdicion();
                await recargarUsuariosSelect();
                setEstado('Usuario eliminado correctamente.', '#34c759');
            } catch (error) {
                setEstado(`No se pudo eliminar: ${error.message}`, '#ff6b6b');
            } finally {
                btnEliminar.disabled = false;
                btnEliminar.textContent = texto;
            }
        });
    }

    if (btnCancelarEdicion) {
        btnCancelarEdicion.addEventListener('click', () => {
            desactivarModoEdicion();
            setEstado('Edicion cancelada.');
        });
    }

    if (btnCrearInline) {
        btnCrearInline.addEventListener('click', async () => {
            const alias = (inputAlias?.value || '').trim();
            const nombre = (inputNombre?.value || '').trim();
            const altura = parseFloat(inputAltura?.value || '0');

            if (!alias || !nombre || !(altura > 0)) {
                setEstado('Completa alias, nombre y altura.', '#ffb020');
                return;
            }

            btnCrearInline.disabled = true;
            const texto = btnCrearInline.textContent;
            const eraEdicion = modoEdicion;
            btnCrearInline.textContent = modoEdicion ? 'Guardando...' : 'Creando...';
            try {
                if (modoEdicion && usuarioActivoData) {
                    await actualizarUsuario(usuarioActivoData.id_usuario, alias, nombre, altura);
                    usuarioActivoId = usuarioActivoData.id_usuario;
                } else {
                    const idUsuario = await crearUsuario(alias, nombre, altura);
                    usuarioActivoId = idUsuario;
                }

                await recargarUsuariosSelect();

                const idFinal = usuarioActivoId;
                const usuarioFinal = {
                    id_usuario: idFinal,
                    alias,
                    nombre_completo: nombre,
                    altura_m: altura
                };
                usuarioActivoData = usuarioFinal;

                setUsuarioActivo({
                    id_usuario: idFinal,
                    alias,
                    nombre_completo: nombre,
                    altura_m: altura
                });

                desactivarModoEdicion();
                setEstado(eraEdicion ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.', '#34c759');
            } catch (error) {
                setEstado(`No se pudo guardar el usuario: ${error.message}`, '#ff6b6b');
            } finally {
                btnCrearInline.disabled = false;
                btnCrearInline.textContent = texto;
            }
        });
    }
});
