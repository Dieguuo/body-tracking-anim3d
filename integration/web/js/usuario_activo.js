// usuario_activo.js — Punto único de verdad para el usuario activo en frontend.
// Todos los módulos (futbol, salto, etc.) deben usar estas funciones para leer
// el usuario activo en lugar de redefinir helpers locales.
//
// Convención de claves en sessionStorage:
//   - idUser:     ID numérico del usuario activo (string)
//   - aliasUser:  alias del usuario
//   - nombreUser: nombre completo
//   - alturaUser: altura en metros (string)
//   - pesoUser:   peso en kg (string)

(function (global) {
    'use strict';

    function _safeGet(key) {
        try {
            return sessionStorage.getItem(key);
        } catch (_e) {
            return null;
        }
    }

    function _safeNum(value) {
        if (value === null || value === undefined || value === '') return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    /**
     * Devuelve los datos del usuario activo o null si no hay usuario seleccionado.
     * @returns {{idUsuario: number, alias: string|null, nombreCompleto: string|null,
     *           alturaM: number|null, pesoKg: number|null} | null}
     */
    function obtenerUsuarioActivo() {
        const idRaw = _safeGet('idUser');
        const idUsuario = _safeNum(idRaw);
        if (!idUsuario) return null;

        return {
            idUsuario: idUsuario,
            alias: _safeGet('aliasUser'),
            nombreCompleto: _safeGet('nombreUser'),
            alturaM: _safeNum(_safeGet('alturaUser')),
            pesoKg: _safeNum(_safeGet('pesoUser')),
        };
    }

    /**
     * Devuelve sólo el id numérico del usuario activo, o null.
     * @returns {number|null}
     */
    function obtenerIdUsuarioActivo() {
        const u = obtenerUsuarioActivo();
        return u ? u.idUsuario : null;
    }

    /**
     * Comprueba si hay un usuario activo válido.
     * @returns {boolean}
     */
    function hayUsuarioActivo() {
        return obtenerIdUsuarioActivo() !== null;
    }

    // Exponer en window para uso global.
    global.UsuarioActivo = {
        obtener: obtenerUsuarioActivo,
        obtenerId: obtenerIdUsuarioActivo,
        hay: hayUsuarioActivo,
    };
})(typeof window !== 'undefined' ? window : this);
