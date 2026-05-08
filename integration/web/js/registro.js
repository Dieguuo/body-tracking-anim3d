// getBackendBaseUrl() se carga desde js/config.js
// fetchJson() se carga desde js/api-client.js
//
// Esta pantalla pertenece al modulo SALTO y consume su propia API
// (`/api/usuarios` en el backend de salto, puerto 5001). Como la BD
// `bd_anim3d` esta unificada, los usuarios creados aqui son los mismos
// que vera el modulo de futbol.

function _baseUsuarios() {
    return `${getBackendBaseUrl()}/api/usuarios`;
}

async function obtenerUsuariosPaginados({ search = '', limit = 20, offset = 0 } = {}) {
    const query = new URLSearchParams({
        paginado: '1',
        search,
        limit: String(limit),
        offset: String(offset),
    });
    const payload = await fetchJson(`${_baseUsuarios()}?${query.toString()}`);
    const items = Array.isArray(payload.items) ? payload.items : [];
    return {
        items,
        total: Number(payload.total || 0),
        limit: Number(payload.limit || limit),
        offset: Number(payload.offset || offset),
        has_more: Boolean(payload.has_more),
    };
}

function setUsuarioActivo(usuario) {
    const nombreCompleto = usuario.nombre_completo || usuario.nombre || '';
    const altura = (usuario.altura_m !== undefined && usuario.altura_m !== null && String(usuario.altura_m).trim() !== '')
        ? Number(usuario.altura_m)
        : null;
    const peso = (usuario.peso_kg !== undefined && usuario.peso_kg !== null && String(usuario.peso_kg).trim() !== '')
        ? Number(usuario.peso_kg)
        : null;

    sessionStorage.setItem('idUser', String(usuario.id_usuario));
    sessionStorage.setItem('aliasUser', usuario.alias || '');
    sessionStorage.setItem('nombreUser', nombreCompleto);
    sessionStorage.setItem('alturaUser', altura != null ? String(altura) : '');
    sessionStorage.setItem('pesoUser', peso != null ? String(peso) : '');

    const alturaInput = document.getElementById('altura-usuario');
    if (alturaInput) {
        alturaInput.value = altura != null ? String(altura) : '';
    }

    const estado = document.getElementById('usuario-estado');
    if (estado) {
        estado.textContent = `Usuario activo: ${usuario.alias || '-'} (ID ${usuario.id_usuario})`;
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
    sessionStorage.removeItem('pesoUser');

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

async function crearUsuario(data) {
    const payload = await fetchJson(_baseUsuarios(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const idUsuario = Number(payload.id_usuario);
    if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
        throw new Error('El backend no devolvio un id_usuario valido');
    }
    return idUsuario;
}

async function actualizarUsuario(id, data) {
    return await fetchJson(`${_baseUsuarios()}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

async function eliminarUsuario(id) {
    return await fetchJson(`${_baseUsuarios()}/${id}`, {
        method: 'DELETE'
    });
}

async function fetchUsuarios(paginado = true, search = '', limit = 20, offset = 0) {
    const params = new URLSearchParams({
        paginado: paginado ? '1' : '0',
        search,
        limit: String(limit),
        offset: String(offset)
    });
    return await fetchJson(`${_baseUsuarios()}?${params.toString()}`);
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
            const pesoRaw = (document.getElementById('peso_kg')?.value || '').trim();
            const pesoKg = pesoRaw ? parseFloat(pesoRaw) : null;

            if (isNaN(alturaM) || alturaM < 0.50 || alturaM > 2.50) {
                mensajeEstado.textContent = 'La altura debe estar entre 0.50 y 2.50 metros.';
                mensajeEstado.style.color = '#ffb020';
                return;
            }

            if (pesoKg !== null && (Number.isNaN(pesoKg) || pesoKg < 20 || pesoKg > 300)) {
                mensajeEstado.textContent = 'El peso debe estar entre 20 y 300 kg.';
                mensajeEstado.style.color = '#ffb020';
                return;
            }

            const textoOriginal = btnSubmit.textContent;
            btnSubmit.textContent = 'Guardando...';
            btnSubmit.disabled = true;
            mensajeEstado.textContent = '';

            try {
                const idUsuario = await crearUsuario({
                    alias: alias,
                    nombre_completo: nombreCompleto,
                    altura_m: alturaM,
                    peso_kg: pesoKg,
                });

                setUsuarioActivo({
                    id_usuario: idUsuario,
                    alias: alias,
                    nombre_completo: nombreCompleto,
                    altura_m: alturaM,
                    peso_kg: pesoKg,
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
    const inputPeso = document.getElementById('nuevo-peso');

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
        if (inputPeso) inputPeso.value = '';
    }

    function activarModoEdicion(usuario) {
        if (!usuario || !inputAlias || !inputNombre || !inputAltura || !btnCrearInline || !btnCancelarEdicion) {
            return;
        }
        modoEdicion = true;
        inputAlias.value = usuario.alias || '';
        inputNombre.value = usuario.nombre_completo || '';
        inputAltura.value = String(usuario.altura_m ?? '');
        if (inputPeso) inputPeso.value = usuario.peso_kg != null ? String(usuario.peso_kg) : '';
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

    function obtenerAlturaTexto(u) {
        if (u.altura_m !== undefined && u.altura_m !== null && String(u.altura_m).trim() !== '') {
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
        }

        const tdAlias = document.createElement('td');
        tdAlias.textContent = u.alias || '';
        const tdNombre = document.createElement('td');
        tdNombre.textContent = u.nombre_completo || '';
        const tdAltura = document.createElement('td');
        tdAltura.textContent = obtenerAlturaTexto(u);
        const tdPeso = document.createElement('td');
        tdPeso.textContent = u.peso_kg != null ? `${u.peso_kg} kg` : '-';
        tr.append(tdAlias, tdNombre, tdAltura, tdPeso);

        tr.addEventListener('click', () => {
            usuarioActivoId = Number(u.id_usuario);
            usuarioActivoData = u;
            document.querySelectorAll('#tabla-usuarios-body tr').forEach((row) => row.classList.remove('activo'));
            tr.classList.add('activo');
            setUsuarioActivo({
                id_usuario: u.id_usuario,
                alias: u.alias,
                nombre_completo: u.nombre_completo || '',
                altura_m: (u.altura_m !== undefined && u.altura_m !== null && String(u.altura_m).trim() !== '') ? Number(u.altura_m) : null,
                peso_kg: (u.peso_kg !== undefined && u.peso_kg !== null && String(u.peso_kg).trim() !== '') ? Number(u.peso_kg) : null,
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
            usuarioActivoData = null;
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

            // Si es la carga inicial y el usuario activo estaba en la lista,
            // restaurar su estado en UI una sola vez (sin llamarlo por cada fila).
            if (reset && usuarioActivoData) {
                const u = usuarioActivoData;
                setUsuarioActivo({
                    id_usuario: u.id_usuario,
                    alias: u.alias,
                    nombre_completo: u.nombre_completo || u.nombre || '',
                    altura_m: u.altura_m,
                    peso_kg: u.peso_kg,
                });
            }
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
            const pesoRaw = (inputPeso?.value || '').trim();
            const peso = pesoRaw ? parseFloat(pesoRaw) : null;

            if (!alias || !nombre || !(altura > 0)) {
                setEstado('Completa alias, nombre y altura.', '#ffb020');
                return;
            }

            if (altura < 0.50 || altura > 2.50) {
                setEstado('La altura debe estar entre 0.50 y 2.50 metros.', '#ffb020');
                return;
            }

            if (peso !== null && (peso < 20 || peso > 300)) {
                setEstado('El peso debe estar entre 20 y 300 kg.', '#ffb020');
                return;
            }

            btnCrearInline.disabled = true;
            const texto = btnCrearInline.textContent;
            const eraEdicion = modoEdicion;
            btnCrearInline.textContent = modoEdicion ? 'Guardando...' : 'Creando...';
            try {
                if (modoEdicion && usuarioActivoData) {
                    await actualizarUsuario(usuarioActivoData.id_usuario, {
                        alias: alias,
                        nombre_completo: nombre,
                        altura_m: altura,
                        peso_kg: peso,
                    });
                    usuarioActivoId = usuarioActivoData.id_usuario;
                } else {
                    const idUsuario = await crearUsuario({
                        alias: alias,
                        nombre_completo: nombre,
                        altura_m: altura,
                        peso_kg: peso,
                    });
                    usuarioActivoId = idUsuario;
                }

                await recargarUsuariosSelect();

                const idFinal = usuarioActivoId;
                const usuarioFinal = {
                    id_usuario: idFinal,
                    alias,
                    nombre_completo: nombre,
                    altura_m: altura,
                    peso_kg: peso
                };
                usuarioActivoData = usuarioFinal;

                setUsuarioActivo({
                    id_usuario: idFinal,
                    alias,
                    nombre_completo: nombre,
                    altura_m: altura,
                    peso_kg: peso
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
