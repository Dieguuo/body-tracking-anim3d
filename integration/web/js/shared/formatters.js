// shared/formatters.js — utilidades de formateo compartidas entre galerías y módulos

(function (global) {
    function formatearNumero(valor, decimales = 1) {
        if (valor === null || valor === undefined || Number.isNaN(Number(valor))) {
            return '--';
        }
        return Number(valor).toFixed(decimales);
    }

    function formatearGrados(valor) {
        if (valor === null || valor === undefined || Number.isNaN(Number(valor))) {
            return '-- deg';
        }
        return `${Number(valor).toFixed(1)} deg`;
    }

    function formatearScore(score) {
        if (score === null || score === undefined || Number.isNaN(Number(score))) {
            return '--';
        }
        const s = Number(score);
        return s >= 0 && s <= 100 ? formatearNumero(s, 1) : '--';
    }

    function formatearFechaSoloFecha(fechaIso) {
        if (!fechaIso) {
            return '--';
        }
        const fecha = new Date(fechaIso);
        if (Number.isNaN(fecha.getTime())) {
            return '--';
        }
        return fecha.toLocaleDateString('es-ES');
    }

    function formatearFechaSoloHora(fechaIso) {
        if (!fechaIso) {
            return '--';
        }
        const fecha = new Date(fechaIso);
        if (Number.isNaN(fecha.getTime())) {
            return '--';
        }
        return fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }

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

    global.formatearNumero = formatearNumero;
    global.formatearGrados = formatearGrados;
    global.formatearScore = formatearScore;
    global.formatearFechaSoloFecha = formatearFechaSoloFecha;
    global.formatearFechaSoloHora = formatearFechaSoloHora;
    global.formatearFecha = formatearFecha;
})(window);
