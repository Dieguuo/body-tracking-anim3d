import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

const video = document.getElementById('vista-camara');
const canvasElement = document.getElementById('canvas-esqueleto');
const canvasCtx = canvasElement.getContext('2d');
const indicador = document.getElementById('indicador-ia');
const btnGrabar = document.getElementById('btn-grabar');

let poseLandmarker;
let analisisActivo = false;
let lastVideoTime = -1;
let finalizandoSalto = false;

let modoSalto = 'vertical';
let estadoSalto = 'suelo';
let tiempoDespegue = 0;
let alturaBaseY = 0;
let framesCalibracion = 0;
let escalaMetrosPorUnidad = 0;
let yPicoVuelo = 1.0;
let despegueX = 0;
let angulosDespegueActual = {
    angulo_rodilla_deg: null,
    angulo_cadera_deg: null
};
let asimetriaDespegueActual = null;

// ── Tracking biomecánico durante el salto ──
let angulosAterrizajeActual = { angulo_rodilla_deg: null, angulo_cadera_deg: null };
let asimetriaAterrizajeActual = null;
let minRodillaDuranteVuelo = null;   // Flexión máxima de rodilla en vuelo
let minCaderaDuranteVuelo = null;    // Flexión máxima de cadera en vuelo
let visibilidadAcumulada = 0;        // Suma de visibility de landmarks clave
let framesConVisibilidad = 0;        // Nº de frames con landmarks detectados
let yPostAterrizaje = [];            // Posiciones Y de pies post-aterrizaje para estabilidad

let mediaRecorder = null;
let chunksGrabacion = [];
let stopRecorderResolver = null;
let toastTimer = null;

// ── Suavizado EMA de landmarks (reduce jitter) ──
const EMA_ALPHA = 0.4;          // 0 = muy suave, 1 = sin filtro
let landmarksSuavizados = null;  // array de 33 {x,y,z,visibility}

const SALTOS_OBJETIVO_COMPARATIVA = 4;
let medidasComparativa = [];
let graficaTendencia = null;
let graficaAsimetria = null;
let graficaCorrPesoPotencia = null;
let graficaCorrAsimEstabilidad = null;
let ultimaAlertaFatigaClave = '';
const CHART_BOX_HEIGHT_PX = 220;

function fijarTamanoGraficasAnalitica() {
    const wrapperIds = [
        'wrap-grafica-tendencia',
        'wrap-grafica-asimetria',
        'wrap-grafica-corr-peso-potencia',
        'wrap-grafica-corr-asim-estabilidad'
    ];

    wrapperIds.forEach((id) => {
        const wrapper = document.getElementById(id);
        if (!wrapper) {
            return;
        }
        const h = `${CHART_BOX_HEIGHT_PX}px`;
        wrapper.style.setProperty('height', h, 'important');
        wrapper.style.setProperty('min-height', h, 'important');
        wrapper.style.setProperty('max-height', h, 'important');
        wrapper.style.setProperty('overflow', 'hidden', 'important');

        const canvas = wrapper.querySelector('canvas');
        if (canvas) {
            canvas.style.setProperty('height', '100%', 'important');
            canvas.style.setProperty('max-height', '100%', 'important');
            canvas.style.setProperty('width', '100%', 'important');
        }
    });
}

// getBackendBaseUrl() se carga desde js/config.js

function getUsuarioActivo() {
    const idUsuario = sessionStorage.getItem('idUser');
    const altura = parseFloat(sessionStorage.getItem('alturaUser') || '0');

    if (!idUsuario || !(altura > 0)) {
        return null;
    }

    return {
        idUsuario: Number(idUsuario),
        altura: altura
    };
}

function hayUsuarioSeleccionadoParaDeteccion() {
    const usuario = getUsuarioActivo();
    if (!usuario) {
        return false;
    }

    const tablaBody = document.getElementById('tabla-usuarios-body');
    if (!tablaBody) {
        return true;
    }

    return Boolean(tablaBody.querySelector('tr.activo'));
}

function getPreferenciaGuardarVideoTiempoReal() {
    const opcion = document.querySelector('input[name="guardar-video-tiempo-real"]:checked');
    return opcion ? opcion.value : 'no';
}

function getModoAnalisis() {
    const selector = document.getElementById('modo-analisis');
    return selector ? selector.value : 'individual';
}

function getMetricaAnalitica() {
    const selector = document.getElementById('metrica-analitica');
    return selector ? selector.value : 'distancia';
}

function getPesoUsuarioActivo() {
    const raw = sessionStorage.getItem('pesoUser');
    const peso = Number(raw);
    return Number.isFinite(peso) && peso > 0 ? peso : null;
}

function calcularPotenciaVerticalLocal(alturaCm) {
    const peso = getPesoUsuarioActivo();
    const altura = Number(alturaCm);
    if (!Number.isFinite(altura) || altura <= 0 || !peso) {
        return null;
    }
    const potencia = (60.7 * altura) + (45.3 * peso) - 2055;
    return Number.isFinite(potencia) ? Number(potencia.toFixed(1)) : null;
}

function calcularPotenciaHorizontalLocal(distanciaCm, tiempoVueloS) {
    const peso = getPesoUsuarioActivo();
    const distanciaM = Number(distanciaCm) / 100;
    const t = Number(tiempoVueloS);
    if (!peso || !Number.isFinite(distanciaM) || distanciaM <= 0 || !Number.isFinite(t) || t <= 0) {
        return null;
    }

    const g = 9.81;
    const vx = distanciaM / t;
    const vy = (g * t) / 2;
    const energiaJ = 0.5 * peso * ((vx * vx) + (vy * vy));
    const tImpulso = Math.min(0.35, Math.max(0.18, 0.45 * t));
    if (!(tImpulso > 0)) {
        return null;
    }

    const potencia = energiaJ / tImpulso;
    return Number.isFinite(potencia) && potencia > 0 ? Number(potencia.toFixed(1)) : null;
}

function calcularPotenciaLocal(tipoSalto, distanciaCm, tiempoVueloS) {
    if (String(tipoSalto || '').toLowerCase() === 'horizontal') {
        return calcularPotenciaHorizontalLocal(distanciaCm, tiempoVueloS);
    }
    return calcularPotenciaVerticalLocal(distanciaCm);
}

function calcularEstabilidadLocal(asimetriaPct, confianza) {
    const asim = Number.isFinite(Number(asimetriaPct)) ? Number(asimetriaPct) : 8.0;
    const conf = Number.isFinite(Number(confianza)) ? Number(confianza) : 0.9;
    const penalizacionAsim = Math.min(45, asim * 2);
    const penalizacionConf = Math.max(0, (1 - conf) * 35);
    const score = 100 - penalizacionAsim - penalizacionConf;
    return Number(Math.max(0, Math.min(100, score)).toFixed(2));
}

function calcularConfianzaDesdeVisibilidad(landmarks) {
    // Landmarks clave para un salto: caderas, rodillas, tobillos, talones
    const indices = [23, 24, 25, 26, 27, 28, 29, 30];
    let suma = 0;
    let count = 0;
    for (const i of indices) {
        const v = landmarks?.[i]?.visibility;
        if (v !== undefined && v !== null) {
            suma += v;
            count++;
        }
    }
    return count > 0 ? suma / count : 0.5;
}

function calcularEstabilidadPostAterrizaje(muestrasY) {
    if (!muestrasY || muestrasY.length < 3) {
        return null;
    }
    // Oscilación: desviación estándar de las posiciones Y post-aterrizaje
    const media = muestrasY.reduce((a, b) => a + b, 0) / muestrasY.length;
    const varianza = muestrasY.reduce((sum, y) => sum + Math.pow(y - media, 2), 0) / muestrasY.length;
    const desviacion = Math.sqrt(varianza);
    // Convertir oscilación a score 0-100 (menor oscilación = mayor estabilidad)
    // En coords normalizadas, una oscilación de 0.02 es bastante inestable
    const score = Math.max(0, 100 - (desviacion * 5000));
    return Number(Math.min(100, score).toFixed(2));
}

function calcularAsimetriaDesdeLandmarks(landmarks) {
    if (!Array.isArray(landmarks) || landmarks.length < 31) {
        return null;
    }

    const izq = normalizarNumeroOpcional(landmarks?.[29]?.y ?? landmarks?.[27]?.y);
    const der = normalizarNumeroOpcional(landmarks?.[30]?.y ?? landmarks?.[28]?.y);
    if (izq === null || der === null) {
        return null;
    }

    const maximo = Math.max(Math.abs(izq), Math.abs(der), 1e-6);
    const asi = (Math.abs(izq - der) / maximo) * 100;
    return Number.isFinite(asi) ? Number(asi.toFixed(1)) : null;
}

function mostrarToast(mensaje, tipo = 'info', duracionMs = 2200) {
    const toast = document.getElementById('toast-aviso');
    if (!toast) {
        return;
    }

    toast.textContent = mensaje;
    toast.classList.remove('info', 'success', 'warn', 'error', 'show');
    toast.classList.add(tipo);

    clearTimeout(toastTimer);
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, duracionMs);
}

function resetComparativa() {
    medidasComparativa = [];
    actualizarBadgeComparativa();
}

function actualizarBadgeComparativa() {
    const badge = document.getElementById('comparativa-progreso');
    if (!badge) {
        return;
    }

    if (getModoAnalisis() !== 'comparativa') {
        badge.style.display = 'none';
        badge.textContent = '';
        return;
    }

    badge.style.display = 'block';
    const intentoActual = Math.min(medidasComparativa.length + 1, SALTOS_OBJETIVO_COMPARATIVA);
    badge.textContent = `Salto ${intentoActual}/${SALTOS_OBJETIVO_COMPARATIVA}`;
}

function normalizarTextoTipo(tipo) {
    if (!tipo) {
        return 'Salto';
    }
    if (tipo.toLowerCase() === 'horizontal') {
        return 'Horizontal';
    }
    if (tipo.toLowerCase() === 'vertical') {
        return 'Vertical';
    }
    return tipo;
}

function normalizarNumeroOpcional(valor) {
    if (valor === null || valor === undefined || valor === '') {
        return null;
    }
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

function anguloEntreVectoresDeg(v1, v2) {
    const dot = (v1.x * v2.x) + (v1.y * v2.y);
    const cross = (v1.x * v2.y) - (v1.y * v2.x);
    const mod1 = Math.hypot(v1.x, v1.y);
    const mod2 = Math.hypot(v2.x, v2.y);
    if (mod1 === 0 || mod2 === 0) {
        return null;
    }
    return Math.abs(Math.atan2(Math.abs(cross), dot) * (180 / Math.PI));
}

function promedioPunto(landmarks, idxA, idxB) {
    const a = landmarks?.[idxA];
    const b = landmarks?.[idxB];
    if (!a || !b) {
        return null;
    }
    const ax = normalizarNumeroOpcional(a.x);
    const ay = normalizarNumeroOpcional(a.y);
    const bx = normalizarNumeroOpcional(b.x);
    const by = normalizarNumeroOpcional(b.y);
    if (ax === null || ay === null || bx === null || by === null) {
        return null;
    }
    return {
        x: (ax + bx) / 2,
        y: (ay + by) / 2
    };
}

function calcularAngulosDespegueDesdeLandmarks(landmarks) {
    const hombro = promedioPunto(landmarks, 11, 12);
    const cadera = promedioPunto(landmarks, 23, 24);
    const rodilla = promedioPunto(landmarks, 25, 26);
    const tobillo = promedioPunto(landmarks, 27, 28);

    if (!hombro || !cadera || !rodilla || !tobillo) {
        return {
            angulo_rodilla_deg: null,
            angulo_cadera_deg: null
        };
    }

    const vCaderaRodilla = { x: rodilla.x - cadera.x, y: rodilla.y - cadera.y };
    const vTobilloRodilla = { x: rodilla.x - tobillo.x, y: rodilla.y - tobillo.y };
    const vHombroCadera = { x: cadera.x - hombro.x, y: cadera.y - hombro.y };
    const vRodillaCadera = { x: cadera.x - rodilla.x, y: cadera.y - rodilla.y };

    return {
        angulo_rodilla_deg: anguloEntreVectoresDeg(vCaderaRodilla, vTobilloRodilla),
        angulo_cadera_deg: anguloEntreVectoresDeg(vHombroCadera, vRodillaCadera)
    };
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function asignarTexto(id, texto) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = texto;
    }
}

function actualizarEstadoGrafica({ wrapperId, canvasId, emptyId, hasData, emptyMessage }) {
    const wrapper = document.getElementById(wrapperId);
    const canvas = document.getElementById(canvasId);
    const empty = document.getElementById(emptyId);

    if (wrapper) {
        wrapper.classList.toggle('is-empty', !hasData);
    }

    if (canvas) {
        canvas.style.display = hasData ? 'block' : 'none';
    }

    if (empty) {
        if (!hasData && emptyMessage) {
            empty.textContent = emptyMessage;
        }
        empty.style.display = hasData ? 'none' : 'block';
    }
}

function limpiarAnaliticaPanel(mensaje = 'Selecciona un usuario para ver su tendencia.') {
    asignarTexto('analitica-estado', mensaje);
    asignarTexto('metrica-pendiente-historial', '-- cm/sem');
    asignarTexto('metrica-r2', '--');
    asignarTexto('metrica-prediccion', '-- cm');
    asignarTexto('metrica-estado', '--');
    asignarTexto('metrica-pendiente-sesion', '-- cm/salto');
    asignarTexto('metrica-caida', '--%');
    asignarTexto('sesiones-resumen', '--');
    asignarTexto('correlaciones-resumen', '--');
    asignarTexto('estancamiento-resumen', '--');
    asignarTexto('comparativa-tipos-resumen', '--');
    asignarTexto('prediccion-multi-resumen', '--');
    asignarTexto('ranking-resumen', '--');

    const alerta = document.getElementById('fatiga-alerta');
    if (alerta) {
        alerta.style.display = 'none';
        alerta.textContent = '';
    }

    const alertasTendencia = document.getElementById('alertas-tendencia');
    if (alertasTendencia) {
        alertasTendencia.style.display = 'none';
        alertasTendencia.textContent = '';
    }

    const canvas = document.getElementById('grafica-tendencia');
    if (graficaTendencia) {
        graficaTendencia.destroy();
        graficaTendencia = null;
    }
    if (graficaAsimetria) {
        graficaAsimetria.destroy();
        graficaAsimetria = null;
    }
    if (graficaCorrPesoPotencia) {
        graficaCorrPesoPotencia.destroy();
        graficaCorrPesoPotencia = null;
    }
    if (graficaCorrAsimEstabilidad) {
        graficaCorrAsimEstabilidad.destroy();
        graficaCorrAsimEstabilidad = null;
    }
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const canvasAsim = document.getElementById('grafica-asimetria');
    if (canvasAsim) {
        const ctxAsim = canvasAsim.getContext('2d');
        ctxAsim.clearRect(0, 0, canvasAsim.width, canvasAsim.height);
    }

    const canvasCorr1 = document.getElementById('grafica-corr-peso-potencia');
    if (canvasCorr1) {
        const ctxCorr1 = canvasCorr1.getContext('2d');
        ctxCorr1.clearRect(0, 0, canvasCorr1.width, canvasCorr1.height);
    }

    const canvasCorr2 = document.getElementById('grafica-corr-asim-estabilidad');
    if (canvasCorr2) {
        const ctxCorr2 = canvasCorr2.getContext('2d');
        ctxCorr2.clearRect(0, 0, canvasCorr2.width, canvasCorr2.height);
    }

    actualizarEstadoGrafica({
        wrapperId: 'wrap-grafica-asimetria',
        canvasId: 'grafica-asimetria',
        emptyId: 'empty-grafica-asimetria',
        hasData: false,
        emptyMessage: 'No hay datos de asimetria suficientes para graficar.'
    });
    actualizarEstadoGrafica({
        wrapperId: 'wrap-grafica-corr-peso-potencia',
        canvasId: 'grafica-corr-peso-potencia',
        emptyId: 'empty-grafica-corr-peso-potencia',
        hasData: false,
        emptyMessage: 'No hay muestras suficientes para esta correlacion.'
    });
    actualizarEstadoGrafica({
        wrapperId: 'wrap-grafica-corr-asim-estabilidad',
        canvasId: 'grafica-corr-asim-estabilidad',
        emptyId: 'empty-grafica-corr-asim-estabilidad',
        hasData: false,
        emptyMessage: 'Aun no hay datos de asimetria/estabilidad suficientes.'
    });
}

function capitalizarEstado(estado) {
    if (!estado) {
        return '--';
    }
    return `${estado.charAt(0).toUpperCase()}${estado.slice(1)}`;
}

function renderGraficaTendencia(historial, tipo, metrica = 'distancia', unidad = 'cm') {
    fijarTamanoGraficasAnalitica();
    const canvas = document.getElementById('grafica-tendencia');
    if (!canvas || !window.Chart || !Array.isArray(historial)) {
        return;
    }

    const labels = historial.map((punto, idx) => {
        const fecha = new Date(punto.fecha);
        if (Number.isNaN(fecha.getTime())) {
            return `Salto ${idx + 1}`;
        }
        return fecha.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit'
        });
    });

    const valoresReales = historial.map((p) => Number(p.valor ?? p.distancia_cm ?? 0));
    const valoresTendencia = historial.map((p) => Number(p.tendencia_valor ?? p.tendencia_cm ?? 0));
    const tituloMetrica = metrica === 'potencia_estimada' ? 'Potencia estimada' : 'Distancia';

    if (graficaTendencia) {
        graficaTendencia.destroy();
        graficaTendencia = null;
    }

    graficaTendencia = new window.Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: `${tituloMetrica} ${normalizarTextoTipo(tipo)}`,
                    data: valoresReales,
                    borderColor: '#59ffc7',
                    backgroundColor: 'rgba(89, 255, 199, 0.16)',
                    pointRadius: 3,
                    tension: 0.28,
                    fill: true
                },
                {
                    label: 'Línea de tendencia',
                    data: valoresTendencia,
                    borderColor: '#cb9cff',
                    borderDash: [7, 5],
                    pointRadius: 0,
                    tension: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff',
                        boxWidth: 10,
                        boxHeight: 10
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#c9b8da' },
                    grid: { color: 'rgba(255,255,255,0.08)' }
                },
                y: {
                    ticks: { color: '#c9b8da' },
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    title: {
                        display: true,
                        text: `${tituloMetrica} (${unidad})`,
                        color: '#c9b8da'
                    }
                }
            }
        }
    });
    fijarTamanoGraficasAnalitica();
}

function renderGraficaAsimetria(payload) {
    fijarTamanoGraficasAnalitica();
    const canvas = document.getElementById('grafica-asimetria');
    const historial = Array.isArray(payload?.historial) ? payload.historial : [];
    if (!canvas || !window.Chart || historial.length === 0) {
        if (graficaAsimetria) {
            graficaAsimetria.destroy();
            graficaAsimetria = null;
        }
        actualizarEstadoGrafica({
            wrapperId: 'wrap-grafica-asimetria',
            canvasId: 'grafica-asimetria',
            emptyId: 'empty-grafica-asimetria',
            hasData: false,
            emptyMessage: 'No hay datos de asimetria suficientes para graficar.'
        });
        return;
    }

    const labels = historial.map((punto, idx) => {
        const fecha = new Date(punto.fecha);
        if (Number.isNaN(fecha.getTime())) {
            return `Salto ${idx + 1}`;
        }
        return fecha.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit'
        });
    });

    const valores = historial.map((p) => Number(p.asimetria_pct ?? 0));
    const tendencia = historial.map((p) => Number(p.tendencia_asimetria_pct ?? 0));

    if (graficaAsimetria) {
        graficaAsimetria.destroy();
        graficaAsimetria = null;
    }

    graficaAsimetria = new window.Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Asimetría (%)',
                    data: valores,
                    borderColor: '#ffd666',
                    backgroundColor: 'rgba(255, 214, 102, 0.18)',
                    pointRadius: 3,
                    tension: 0.26,
                    fill: true
                },
                {
                    label: 'Tendencia asimetría',
                    data: tendencia,
                    borderColor: '#ff9f6e',
                    borderDash: [7, 5],
                    pointRadius: 0,
                    tension: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff',
                        boxWidth: 10,
                        boxHeight: 10
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#c9b8da' },
                    grid: { color: 'rgba(255,255,255,0.08)' }
                },
                y: {
                    ticks: { color: '#c9b8da' },
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    title: {
                        display: true,
                        text: 'Asimetría (%)',
                        color: '#c9b8da'
                    }
                }
            }
        }
    });
    fijarTamanoGraficasAnalitica();

    actualizarEstadoGrafica({
        wrapperId: 'wrap-grafica-asimetria',
        canvasId: 'grafica-asimetria',
        emptyId: 'empty-grafica-asimetria',
        hasData: true
    });
}

function renderGraficaCorrelaciones(payload) {
    fijarTamanoGraficasAnalitica();
    const canvasPesoPot = document.getElementById('grafica-corr-peso-potencia');
    const canvasAsimEst = document.getElementById('grafica-corr-asim-estabilidad');

    function percentil(valores, p) {
        if (!Array.isArray(valores) || valores.length === 0) {
            return null;
        }
        const arr = valores
            .map((v) => Number(v))
            .filter((v) => Number.isFinite(v))
            .sort((a, b) => a - b);
        if (arr.length === 0) {
            return null;
        }
        const idx = Math.max(0, Math.min(arr.length - 1, Math.floor((arr.length - 1) * p)));
        return arr[idx];
    }

    function limiteSuperiorRobusto(valores, { min = 100, max = 3000, p = 0.92, margen = 1.25 } = {}) {
        const pVal = percentil(valores, p);
        if (!Number.isFinite(pVal)) {
            return max;
        }
        const limite = pVal * margen;
        return Math.max(min, Math.min(max, limite));
    }

    const puntosPesoPot = Array.isArray(payload?.correlaciones?.peso_potencia_distancia?.puntos)
        ? payload.correlaciones.peso_potencia_distancia.puntos
        : [];
    const puntosAsimEst = Array.isArray(payload?.correlaciones?.asimetria_estabilidad?.puntos)
        ? payload.correlaciones.asimetria_estabilidad.puntos
        : [];

    if (!window.Chart) {
        return;
    }

    if (graficaCorrPesoPotencia) {
        graficaCorrPesoPotencia.destroy();
        graficaCorrPesoPotencia = null;
    }
    if (graficaCorrAsimEstabilidad) {
        graficaCorrAsimEstabilidad.destroy();
        graficaCorrAsimEstabilidad = null;
    }

    if (canvasPesoPot && puntosPesoPot.length > 0) {
        const datosPesoPotRaw = puntosPesoPot
            .map((p) => ({ x: Number(p.peso_kg), y: Number(p.potencia_w) }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 0 && p.y > 0);

        const maxPotVisual = limiteSuperiorRobusto(
            datosPesoPotRaw.map((p) => p.y),
            { min: 900, max: 3200, p: 0.90, margen: 1.2 }
        );

        const datosPesoPotVisual = datosPesoPotRaw.map((p) => ({
            x: p.x,
            y: Math.min(p.y, maxPotVisual)
        }));

        graficaCorrPesoPotencia = new window.Chart(canvasPesoPot.getContext('2d'), {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: 'Peso vs Potencia',
                        data: datosPesoPotVisual,
                        backgroundColor: 'rgba(89, 255, 199, 0.65)'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    x: {
                        ticks: { color: '#c9b8da' },
                        title: { display: true, text: 'Peso (kg)', color: '#c9b8da' },
                        grid: { color: 'rgba(255,255,255,0.08)' }
                    },
                    y: {
                        ticks: { color: '#c9b8da' },
                        title: { display: true, text: 'Potencia (W)', color: '#c9b8da' },
                        grid: { color: 'rgba(255,255,255,0.08)' },
                        min: 0,
                        max: maxPotVisual
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#ffffff' }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const raw = datosPesoPotRaw[ctx.dataIndex];
                                if (!raw) {
                                    return '';
                                }
                                const truncado = raw.y > maxPotVisual;
                                return `Peso ${raw.x.toFixed(1)} kg · Potencia ${raw.y.toFixed(1)} W${truncado ? ' (cap visual)' : ''}`;
                            }
                        }
                    }
                }
            }
        });
        fijarTamanoGraficasAnalitica();
        actualizarEstadoGrafica({
            wrapperId: 'wrap-grafica-corr-peso-potencia',
            canvasId: 'grafica-corr-peso-potencia',
            emptyId: 'empty-grafica-corr-peso-potencia',
            hasData: true
        });
    } else {
        actualizarEstadoGrafica({
            wrapperId: 'wrap-grafica-corr-peso-potencia',
            canvasId: 'grafica-corr-peso-potencia',
            emptyId: 'empty-grafica-corr-peso-potencia',
            hasData: false,
            emptyMessage: 'No hay muestras suficientes para esta correlacion.'
        });
    }

    if (canvasAsimEst && puntosAsimEst.length > 0) {
        const datosAsimEst = puntosAsimEst
            .map((p) => ({
                x: Number(p.asimetria_pct),
                y: Number(p.estabilidad_aterrizaje)
            }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

        const maxAsimVisual = limiteSuperiorRobusto(
            datosAsimEst.map((p) => p.x),
            { min: 12, max: 45, p: 0.92, margen: 1.15 }
        );

        graficaCorrAsimEstabilidad = new window.Chart(canvasAsimEst.getContext('2d'), {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: 'Asimetria vs Estabilidad',
                        data: datosAsimEst,
                        backgroundColor: 'rgba(255, 159, 110, 0.7)'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    x: {
                        ticks: { color: '#c9b8da' },
                        title: { display: true, text: 'Asimetria (%)', color: '#c9b8da' },
                        grid: { color: 'rgba(255,255,255,0.08)' },
                        min: 0,
                        max: maxAsimVisual
                    },
                    y: {
                        ticks: { color: '#c9b8da' },
                        title: { display: true, text: 'Estabilidad', color: '#c9b8da' },
                        grid: { color: 'rgba(255,255,255,0.08)' },
                        min: 0,
                        max: 100
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#ffffff' }
                    }
                }
            }
        });
        fijarTamanoGraficasAnalitica();
        actualizarEstadoGrafica({
            wrapperId: 'wrap-grafica-corr-asim-estabilidad',
            canvasId: 'grafica-corr-asim-estabilidad',
            emptyId: 'empty-grafica-corr-asim-estabilidad',
            hasData: true
        });
    } else {
        actualizarEstadoGrafica({
            wrapperId: 'wrap-grafica-corr-asim-estabilidad',
            canvasId: 'grafica-corr-asim-estabilidad',
            emptyId: 'empty-grafica-corr-asim-estabilidad',
            hasData: false,
            emptyMessage: 'Aun no hay datos de asimetria/estabilidad suficientes.'
        });
    }
}

function fmt(valor, digits = 2) {
    const n = Number(valor);
    return Number.isFinite(n) ? n.toFixed(digits) : '--';
}

function actualizarPanelAnaliticaAvanzada(payload) {
    const sesiones = payload?.comparativa_sesiones?.sesiones || [];
    if (sesiones.length >= 2) {
        const a = sesiones[0];
        const b = sesiones[1];
        const delta = Number(b.media || 0) - Number(a.media || 0);
        const unidad = payload?.comparativa_sesiones?.unidad || '';
        asignarTexto(
            'sesiones-resumen',
            `Sesion 1: ${fmt(a.media)} ${unidad}\nSesion 2: ${fmt(b.media)} ${unidad}\nVariacion: ${delta >= 0 ? '+' : ''}${fmt(delta)} ${unidad}`
        );
    } else {
        asignarTexto('sesiones-resumen', 'No hay sesiones suficientes para superponer.');
    }

    const corr1 = payload?.correlaciones?.peso_potencia_distancia || {};
    const corr2 = payload?.correlaciones?.asimetria_estabilidad || {};
    asignarTexto(
        'correlaciones-resumen',
        `r peso-potencia: ${fmt(corr1.corr_peso_potencia, 3)}\nr potencia-distancia: ${fmt(corr1.corr_potencia_distancia, 3)}\nr asimetria-estabilidad: ${fmt(corr2.corr_asimetria_estabilidad, 3)}`
    );

    const em = payload?.estancamiento_mejora || {};
    if (em.suficientes_datos) {
        let estado = 'estable';
        if (em.mejora_significativa) estado = 'mejora significativa';
        if (em.empeora_significativa) estado = 'caida significativa';
        if (em.estancado) estado = 'estancamiento';
        asignarTexto('estancamiento-resumen', `Estado: ${estado}\nDelta: ${fmt(em.delta)}\nDelta %: ${fmt(em.delta_pct)}%`);
    } else {
        asignarTexto('estancamiento-resumen', em.mensaje || 'No hay datos suficientes.');
    }

    const ct = payload?.comparativa_tipos || {};
    const v = ct.vertical || {};
    const h = ct.horizontal || {};
    asignarTexto(
        'comparativa-tipos-resumen',
        `Vertical: ${fmt(v.distancia_media_cm)} cm\nHorizontal: ${fmt(h.distancia_media_cm)} cm\n${ct.recomendacion || ''}`
    );

    const pm = payload?.prediccion_multivariable || {};
    if (pm.suficientes_datos) {
        asignarTexto(
            'prediccion-multi-resumen',
            `Prediccion 4 semanas: ${fmt(pm.prediccion_4_semanas)} cm\nR2: ${fmt(pm.r2, 3)}\nMuestras: ${Number(pm.muestras || 0)}`
        );
    } else {
        asignarTexto('prediccion-multi-resumen', pm.mensaje || 'No hay datos suficientes para prediccion.');
    }

    const top = payload?.rankings?.top_sesiones || [];
    if (top.length > 0) {
        const primeros = top.slice(0, 3).map((t, idx) => `${idx + 1}. ${t.alias || 'Usuario'} - ${fmt(t.media_distancia_cm)} cm`);
        asignarTexto('ranking-resumen', primeros.join('\n'));
    } else {
        asignarTexto('ranking-resumen', 'No hay ranking disponible.');
    }

    renderGraficaAsimetria(payload?.asimetria_evolucion || {});
    renderGraficaCorrelaciones(payload || {});
}

function actualizarPanelAnalitica(tendencia, fatiga, alertasTendencia, tipo) {
    const pendienteHistorial = Number(tendencia.pendiente_cm_semana || tendencia.pendiente || 0);
    const r2 = Number(tendencia.r2 || 0);
    const prediccion = Number(tendencia.prediccion_4_semanas || 0);
    const pendienteSesion = Number(fatiga.pendiente || 0);
    const caidaPct = Number(fatiga.caida_porcentual || 0);
    const unidad = tendencia.unidad || 'cm';

    asignarTexto('metrica-pendiente-historial', `${pendienteHistorial.toFixed(2)} ${unidad}/sem`);
    asignarTexto('metrica-r2', r2.toFixed(3));
    asignarTexto('metrica-prediccion', `${prediccion.toFixed(2)} ${unidad}`);
    asignarTexto('metrica-estado', capitalizarEstado(tendencia.estado));
    asignarTexto('metrica-pendiente-sesion', `${pendienteSesion.toFixed(2)} cm/salto`);
    asignarTexto('metrica-caida', `${caidaPct.toFixed(2)}% (${Number(fatiga.numero_saltos || 0)} saltos)`);

    const info = [
        `${Number(tendencia.numero_saltos || 0)} saltos en historial`,
        `modo ${normalizarTextoTipo(tipo)}`
    ];
    if (fatiga.sesion && fatiga.sesion.inicio && fatiga.sesion.fin) {
        const ini = new Date(fatiga.sesion.inicio);
        const fin = new Date(fatiga.sesion.fin);
        if (!Number.isNaN(ini.getTime()) && !Number.isNaN(fin.getTime())) {
            info.push(`sesión ${ini.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - ${fin.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`);
        }
    }
    asignarTexto('analitica-estado', info.join(' | '));

    const alerta = document.getElementById('fatiga-alerta');
    if (alerta) {
        if (Boolean(fatiga.fatiga_significativa)) {
            alerta.style.display = 'block';
            alerta.textContent = `Alerta de fatiga: caída de ${caidaPct.toFixed(1)}% en la sesión actual con pendiente negativa.`;
        } else {
            alerta.style.display = 'none';
            alerta.textContent = '';
        }
    }

    const panelAlertasTendencia = document.getElementById('alertas-tendencia');
    if (panelAlertasTendencia) {
        if (Array.isArray(alertasTendencia) && alertasTendencia.length > 0) {
            panelAlertasTendencia.style.display = 'block';
            panelAlertasTendencia.textContent = alertasTendencia.map((a) => `• ${a.mensaje}`).join(' ');
        } else {
            panelAlertasTendencia.style.display = 'none';
            panelAlertasTendencia.textContent = '';
        }
    }

    renderGraficaTendencia(tendencia.historial || [], tipo, tendencia.metrica || getMetricaAnalitica(), unidad);
}

function renderInsightsSalto(datos) {
    const clasificacionEl = document.getElementById('clasificacion-salto');
    const alertasPanel = document.getElementById('alertas-salto-panel');
    const alertasList = document.getElementById('lista-alertas-salto');
    const obsPanel = document.getElementById('observaciones-panel');
    const obsList = document.getElementById('lista-observaciones');

    if (clasificacionEl) {
        const cls = String(datos.clasificacion || '').replace(/_/g, ' ');
        clasificacionEl.textContent = `Clasificación: ${cls || '--'}`;
    }

    if (alertasPanel && alertasList) {
        alertasList.innerHTML = '';
        const alertas = Array.isArray(datos.alertas) ? datos.alertas : [];
        if (alertas.length === 0) {
            alertasPanel.style.display = 'none';
        } else {
            alertas.forEach((a) => {
                const li = document.createElement('li');
                const sev = a.severidad ? ` (${String(a.severidad).toUpperCase()})` : '';
                li.textContent = `${a.mensaje || a.codigo || 'Alerta'}${sev}`;
                alertasList.appendChild(li);
            });
            alertasPanel.style.display = 'block';
        }
    }

    if (obsPanel && obsList) {
        obsList.innerHTML = '';
        const observaciones = Array.isArray(datos.observaciones) ? datos.observaciones : [];
        if (observaciones.length === 0) {
            obsPanel.style.display = 'none';
        } else {
            observaciones.forEach((texto) => {
                const li = document.createElement('li');
                li.textContent = texto;
                obsList.appendChild(li);
            });
            obsPanel.style.display = 'block';
        }
    }
}

async function cargarAnaliticaUsuario({ mostrarErrores = false, lanzarToastFatiga = false } = {}) {
    const usuario = getUsuarioActivo();
    if (!usuario) {
        limpiarAnaliticaPanel();
        return;
    }

    const tipo = (document.getElementById('tipo-salto')?.value || 'vertical').toLowerCase();
    const metrica = getMetricaAnalitica();
    asignarTexto('analitica-estado', 'Actualizando analítica...');

    try {
        const [respuestaFatiga, respuestaTendencia, respuestaAlertasTendencia, respuestaAvanzada] = await Promise.all([
            fetch(`${getBackendBaseUrl()}/api/usuarios/${usuario.idUsuario}/fatiga?tipo=${encodeURIComponent(tipo)}`),
            fetch(`${getBackendBaseUrl()}/api/usuarios/${usuario.idUsuario}/tendencia?tipo=${encodeURIComponent(tipo)}&metrica=${encodeURIComponent(metrica)}`),
            fetch(`${getBackendBaseUrl()}/api/usuarios/${usuario.idUsuario}/alertas_tendencia?tipo=${encodeURIComponent(tipo)}`),
            fetch(`${getBackendBaseUrl()}/api/usuarios/${usuario.idUsuario}/analitica_avanzada?tipo=${encodeURIComponent(tipo)}&metrica=${encodeURIComponent(metrica)}`)
        ]);

        const [fatiga, tendencia, alertasTendenciaPayload, avanzada] = await Promise.all([
            respuestaFatiga.json(),
            respuestaTendencia.json(),
            respuestaAlertasTendencia.json(),
            respuestaAvanzada.json()
        ]);

        if (!respuestaFatiga.ok) {
            throw new Error(fatiga.error || `Error fatiga: HTTP ${respuestaFatiga.status}`);
        }
        if (!respuestaTendencia.ok) {
            throw new Error(tendencia.error || `Error tendencia: HTTP ${respuestaTendencia.status}`);
        }
        if (!respuestaAlertasTendencia.ok) {
            throw new Error(alertasTendenciaPayload.error || `Error alertas tendencia: HTTP ${respuestaAlertasTendencia.status}`);
        }
        if (!respuestaAvanzada.ok) {
            throw new Error(avanzada.error || `Error analitica avanzada: HTTP ${respuestaAvanzada.status}`);
        }

        actualizarPanelAnalitica(tendencia, fatiga, alertasTendenciaPayload.alertas || [], tipo);
        actualizarPanelAnaliticaAvanzada(avanzada);

        if (lanzarToastFatiga && Boolean(fatiga.fatiga_significativa)) {
            const claveAlerta = [
                usuario.idUsuario,
                tipo,
                fatiga.sesion?.fin || '',
                Number(fatiga.caida_porcentual || 0).toFixed(2)
            ].join('|');

            if (claveAlerta !== ultimaAlertaFatigaClave) {
                mostrarToast(`Alerta de fatiga detectada: caída del ${Number(fatiga.caida_porcentual || 0).toFixed(1)}%`, 'warn', 3500);
                ultimaAlertaFatigaClave = claveAlerta;
            }
        }
    } catch (error) {
        asignarTexto('analitica-estado', `No se pudo cargar la analítica: ${error.message}`);
        if (mostrarErrores) {
            mostrarToast(`No se pudo cargar la analítica: ${error.message}`, 'error', 3200);
        }
    }
}

function mostrarComparativa(alias, tipoSalto, medidas) {
    const panelResultados = document.getElementById('panel-resultados');
    const resumen = document.getElementById('comparativa-resumen');
    const gridTecnico = document.querySelector('.technical-data-grid');
    const distanciaTitulo = document.getElementById('distancia-resultado');
    const subtitulo = document.getElementById('tipo-resultado');
    const clasificacion = document.getElementById('clasificacion-salto');
    const alertasPanel = document.getElementById('alertas-salto-panel');
    const observacionesPanel = document.getElementById('observaciones-panel');

    if (!resumen || !panelResultados || !gridTecnico || !distanciaTitulo || !subtitulo) {
        return;
    }

    const media = medidas.reduce((acc, n) => acc + n, 0) / medidas.length;

    distanciaTitulo.textContent = `${media.toFixed(2)} cm`;
    subtitulo.textContent = 'Comparativa completada';

    resumen.textContent = '';

    if (clasificacion) {
        clasificacion.textContent = 'Clasificación: --';
    }
    if (alertasPanel) {
        alertasPanel.style.display = 'none';
    }
    if (observacionesPanel) {
        observacionesPanel.style.display = 'none';
    }

    const p1 = document.createElement('p');
    const spanAlias = document.createElement('span');
    spanAlias.className = 'comparativa-alias';
    spanAlias.textContent = alias;
    const spanTipo = document.createElement('span');
    spanTipo.className = 'comparativa-tipo';
    spanTipo.textContent = normalizarTextoTipo(tipoSalto);
    p1.append(spanAlias, ' ha obtenido las siguientes medidas en salto ', spanTipo, ':');

    const ul = document.createElement('ul');
    medidas.forEach((m, i) => {
        const li = document.createElement('li');
        li.textContent = `${i + 1}. ${m.toFixed(2)} cm`;
        ul.appendChild(li);
    });

    const p2 = document.createElement('p');
    const spanMedia = document.createElement('span');
    spanMedia.className = 'comparativa-media';
    spanMedia.textContent = `${media.toFixed(2)} cm`;
    p2.append('La media de los saltos es ', spanMedia, '.');

    resumen.append(p1, ul, p2);
    resumen.style.display = 'block';
    gridTecnico.style.display = 'none';
    panelResultados.classList.add('show');
}

async function crearPoseLandmarker() {
    try {
        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.6,
            minTrackingConfidence: 0.6
        });

        indicador.textContent = 'Motor Listo';
        indicador.classList.add('ia-lista');
        document.dispatchEvent(new CustomEvent('iaEstadoCambio', {
            detail: { lista: true }
        }));

        setTimeout(() => {
            indicador.style.display = 'none';
        }, 3000);
    } catch (error) {
        indicador.textContent = 'Error IA. Usa archivos.';
        indicador.style.background = 'red';
        document.dispatchEvent(new CustomEvent('iaEstadoCambio', {
            detail: { lista: false }
        }));
    }
}

crearPoseLandmarker();

function renderLoop() {
    if (!analisisActivo) {
        return;
    }

    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;

    const startTimeMs = performance.now();

    if (lastVideoTime !== video.currentTime && video.readyState >= 2) {
        lastVideoTime = video.currentTime;

        const resultados = poseLandmarker.detectForVideo(video, startTimeMs);

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        if (resultados.landmarks && resultados.landmarks.length > 0) {
            const drawingUtils = new DrawingUtils(canvasCtx);
            const raw = resultados.landmarks[0];

            // Suavizado EMA: reduce temblor manteniendo reactividad
            if (!landmarksSuavizados) {
                landmarksSuavizados = raw.map(p => ({ ...p }));
            } else {
                for (let i = 0; i < raw.length; i++) {
                    landmarksSuavizados[i].x += EMA_ALPHA * (raw[i].x - landmarksSuavizados[i].x);
                    landmarksSuavizados[i].y += EMA_ALPHA * (raw[i].y - landmarksSuavizados[i].y);
                    landmarksSuavizados[i].z += EMA_ALPHA * (raw[i].z - landmarksSuavizados[i].z);
                    landmarksSuavizados[i].visibility = raw[i].visibility;
                }
            }

            const puntosCuerpo = landmarksSuavizados;

            drawingUtils.drawConnectors(puntosCuerpo, PoseLandmarker.POSE_CONNECTIONS, {
                color: '#00FF00',
                lineWidth: 3
            });
            drawingUtils.drawLandmarks(puntosCuerpo, { color: '#FF0000', lineWidth: 1 });

            calcularFaseSalto(puntosCuerpo);
        }

        canvasCtx.restore();
    }

    if (analisisActivo) {
        window.requestAnimationFrame(renderLoop);
    }
}

function calcularFaseSalto(landmarks) {
    const yPieActual = (landmarks[27].y + landmarks[28].y) / 2;
    const xPieActual = (landmarks[27].x + landmarks[28].x) / 2;

    // Acumular visibilidad para confianza real
    const visFrame = calcularConfianzaDesdeVisibilidad(landmarks);
    visibilidadAcumulada += visFrame;
    framesConVisibilidad += 1;

    if (framesCalibracion < 30) {
        alturaBaseY += yPieActual;
        framesCalibracion += 1;

        if (framesCalibracion === 30) {
            const alturaInput = parseFloat(document.getElementById('altura-usuario').value || '0');
            const alturaRealMetros = alturaInput > 0 ? alturaInput : parseFloat(sessionStorage.getItem('alturaUser') || '0');
            const narizY = landmarks[0].y;
            const posicionSueloNormal = alturaBaseY / 30;
            const alturaPersonaNorm = posicionSueloNormal - narizY;

            if (alturaPersonaNorm > 0) {
                escalaMetrosPorUnidad = alturaRealMetros / alturaPersonaNorm;
            }
        }
        return;
    }

    const posicionSueloNormal = alturaBaseY / 30;
    const umbralDespegue = posicionSueloNormal - 0.04;

    if (estadoSalto === 'suelo' && yPieActual < umbralDespegue) {
        estadoSalto = 'aire';
        tiempoDespegue = performance.now();
        despegueX = xPieActual;
        yPicoVuelo = yPieActual;
        angulosDespegueActual = calcularAngulosDespegueDesdeLandmarks(landmarks);
        asimetriaDespegueActual = calcularAsimetriaDesdeLandmarks(landmarks);
        // Reset tracking de vuelo
        minRodillaDuranteVuelo = angulosDespegueActual.angulo_rodilla_deg;
        minCaderaDuranteVuelo = angulosDespegueActual.angulo_cadera_deg;
        yPostAterrizaje = [];
    } else if (estadoSalto === 'aire') {
        if (yPieActual < yPicoVuelo) {
            yPicoVuelo = yPieActual;
        }

        // Trackear ángulos durante el vuelo (flexión máxima)
        const angulosVuelo = calcularAngulosDespegueDesdeLandmarks(landmarks);
        if (angulosVuelo.angulo_rodilla_deg !== null) {
            if (minRodillaDuranteVuelo === null || angulosVuelo.angulo_rodilla_deg < minRodillaDuranteVuelo) {
                minRodillaDuranteVuelo = angulosVuelo.angulo_rodilla_deg;
            }
        }
        if (angulosVuelo.angulo_cadera_deg !== null) {
            if (minCaderaDuranteVuelo === null || angulosVuelo.angulo_cadera_deg < minCaderaDuranteVuelo) {
                minCaderaDuranteVuelo = angulosVuelo.angulo_cadera_deg;
            }
        }

        if (yPieActual > umbralDespegue) {
            estadoSalto = 'aterrizaje_reciente';
            angulosAterrizajeActual = calcularAngulosDespegueDesdeLandmarks(landmarks);
            asimetriaAterrizajeActual = calcularAsimetriaDesdeLandmarks(landmarks);
            yPostAterrizaje = [yPieActual];

            const tiempoAterrizaje = performance.now();
            const aterrizajeX = xPieActual;

            const tiempoVueloSegundos = (tiempoAterrizaje - tiempoDespegue) / 1000;
            if (tiempoVueloSegundos > 0.15) {
                // Recoger muestras post-aterrizaje antes de finalizar
                setTimeout(() => {
                    estadoSalto = 'suelo';
                    finalizarSaltoEnVivo(tiempoVueloSegundos, despegueX, aterrizajeX, posicionSueloNormal, yPicoVuelo)
                        .catch((error) => {
                            mostrarToast(`No se pudo guardar el salto: ${error.message}`, 'error', 3200);
                        });
                }, 500); // 500ms para recoger estabilidad post-aterrizaje
            } else {
                estadoSalto = 'suelo';
            }
        }
    } else if (estadoSalto === 'aterrizaje_reciente') {
        // Recoger muestras de estabilidad post-aterrizaje
        yPostAterrizaje.push(yPieActual);
    }
}

function iniciarGrabacionVideoSiAplica() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        return;
    }

    if (!window.MediaRecorder) {
        console.warn('MediaRecorder no está disponible en este navegador.');
        return;
    }

    const stream = video.srcObject;
    if (!stream) {
        return;
    }

    const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    let mimeTypeElegido = '';

    for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
            mimeTypeElegido = mime;
            break;
        }
    }

    chunksGrabacion = [];
    mediaRecorder = mimeTypeElegido ? new MediaRecorder(stream, { mimeType: mimeTypeElegido }) : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            chunksGrabacion.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        if (stopRecorderResolver) {
            const blob = chunksGrabacion.length > 0 ? new Blob(chunksGrabacion, { type: mediaRecorder.mimeType || 'video/webm' }) : null;
            stopRecorderResolver(blob);
            stopRecorderResolver = null;
        }
    };

    mediaRecorder.start();
}

function detenerGrabacionYObtenerBlob() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        stopRecorderResolver = resolve;
        try {
            if (typeof mediaRecorder.requestData === 'function') {
                mediaRecorder.requestData();
            }
        } catch (_e) {
            // Ignorar si el navegador no permite requestData en este estado.
        }
        mediaRecorder.stop();
    });
}

async function guardarResultadoEnBackend(datosLocales, guardarVideo, videoBlob) {
    const usuario = getUsuarioActivo();
    if (!usuario) {
        throw new Error('No hay usuario activo. Selecciona o crea un usuario.');
    }

    async function guardarLocalEnSaltos() {
        const respuestaLocal = await fetch(`${getBackendBaseUrl()}/api/saltos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_usuario: usuario.idUsuario,
                tipo_salto: modoSalto,
                distancia_cm: Math.round(datosLocales.distancia),
                tiempo_vuelo_s: Number(datosLocales.tiempo_vuelo_s),
                confianza_ia: datosLocales.confianza,
                metodo_origen: 'ia_vivo',
                potencia_w: datosLocales.potencia_w,
                asimetria_pct: datosLocales.asimetria_pct,
                estabilidad_aterrizaje: datosLocales.estabilidad_aterrizaje,
                angulo_rodilla_deg: datosLocales.angulo_rodilla_deg,
                angulo_cadera_deg: datosLocales.angulo_cadera_deg
            })
        });

        const payloadLocal = await respuestaLocal.json();
        if (!respuestaLocal.ok) {
            throw new Error(payloadLocal.error || `Error HTTP: ${respuestaLocal.status}`);
        }

        return {
            ...datosLocales,
            id_salto: payloadLocal.id_salto,
            datos_parciales: true,
            observaciones: ["Salto medido en tiempo real."],
            alertas: [],
            clasificacion: 'medido_en_vivo',
        };
    }

    if (videoBlob) {
        const formData = new FormData();
        formData.append('video', videoBlob, 'salto_tiempo_real.webm');
        formData.append('tipo_salto', modoSalto);
        formData.append('altura_real_m', String(usuario.altura));
        formData.append('id_usuario', String(usuario.idUsuario));
        formData.append('metodo_origen', 'ia_vivo');
        formData.append('guardar_video_bd', guardarVideo ? 'true' : 'false');

        const respuesta = await fetch(`${getBackendBaseUrl()}/api/salto/calcular`, {
            method: 'POST',
            body: formData
        });

        const payload = await respuesta.json();
        if (!respuesta.ok) {
            throw new Error(payload.error || `Error HTTP: ${respuesta.status}`);
        }

        const potenciaPayload = normalizarNumeroOpcional(payload.potencia_w);
        const asimetriaPayload = normalizarNumeroOpcional(payload.asimetria_pct);
        const estabilidadPayload = normalizarNumeroOpcional(payload.estabilidad_aterrizaje);
        const potenciaLocal = normalizarNumeroOpcional(datosLocales.potencia_w);
        const asimetriaLocal = normalizarNumeroOpcional(datosLocales.asimetria_pct);
        const estabilidadLocal = normalizarNumeroOpcional(datosLocales.estabilidad_aterrizaje);

        const distanciaBackend = Number(payload.distancia || 0);
        if (distanciaBackend <= 0 && Number(datosLocales.distancia || 0) > 0) {
            mostrarToast('El backend devolvió 0 cm; se aplica la distancia local calibrada.', 'warn', 3200);
            const fallbackLocal = await guardarLocalEnSaltos();
            return {
                ...payload,
                ...fallbackLocal,
                potencia_w: potenciaPayload ?? potenciaLocal,
                asimetria_pct: asimetriaPayload ?? asimetriaLocal,
                estabilidad_aterrizaje: estabilidadPayload ?? estabilidadLocal,
                angulo_rodilla_deg: normalizarNumeroOpcional(payload.angulo_rodilla_deg) ?? datosLocales.angulo_rodilla_deg ?? null,
                angulo_cadera_deg: normalizarNumeroOpcional(payload.angulo_cadera_deg) ?? datosLocales.angulo_cadera_deg ?? null,
                // Sobreescribir interpretación del backend (que dice "no_detectado")
                // porque la detección local SÍ midió un salto válido.
                observaciones: ["Salto medido en tiempo real. El vídeo grabado no pudo ser reprocesado por el backend."],
                alertas: payload.alertas && payload.alertas.length > 0 && payload.clasificacion !== 'no_detectado'
                    ? payload.alertas : [],
                clasificacion: 'medido_en_vivo',
            };
        }

        return {
            ...payload,
            potencia_w: potenciaPayload ?? potenciaLocal,
            asimetria_pct: asimetriaPayload ?? asimetriaLocal,
            estabilidad_aterrizaje: estabilidadPayload ?? estabilidadLocal,
            angulo_rodilla_deg: normalizarNumeroOpcional(payload.angulo_rodilla_deg) ?? datosLocales.angulo_rodilla_deg ?? null,
            angulo_cadera_deg: normalizarNumeroOpcional(payload.angulo_cadera_deg) ?? datosLocales.angulo_cadera_deg ?? null,
        };
    }

    if (guardarVideo && !videoBlob) {
        mostrarToast('No se pudo capturar el vídeo para guardar en BD; se guarda solo la medicion local.', 'warn', 3400);
    }

    return guardarLocalEnSaltos();
}

async function finalizarSaltoEnVivo(tiempoVuelo, startX, endX, ySuelo, yPico) {
    if (finalizandoSalto) {
        return;
    }
    finalizandoSalto = true;

    let distanciaFinalCm = 0;
    let textoTipo = '';

    if (modoSalto === 'vertical') {
        const gravedad = 9.81;
        const alturaCinematicaM = (gravedad * Math.pow(tiempoVuelo, 2)) / 8;
        const alturaCinematicaCm = alturaCinematicaM * 100;

        const desplazamientoNorm = ySuelo - yPico;
        const alturaVisualM = desplazamientoNorm * escalaMetrosPorUnidad;
        const alturaVisualCm = alturaVisualM * 100;

        distanciaFinalCm = Math.round((0.6 * alturaVisualCm) + (0.4 * alturaCinematicaCm));
        textoTipo = 'vertical';
    } else {
        const distanciaUnidades = Math.abs(endX - startX);
        const distanciaMetros = distanciaUnidades * escalaMetrosPorUnidad;
        distanciaFinalCm = Math.round(distanciaMetros * 100);
        textoTipo = 'horizontal';
    }

    const datosLocales = {
        distancia: distanciaFinalCm,
        unidad: 'cm',
        tipo_salto: textoTipo,
        confianza: framesConVisibilidad > 0
            ? Number((visibilidadAcumulada / framesConVisibilidad).toFixed(3))
            : 0.5,
        tiempo_vuelo_s: Number(tiempoVuelo.toFixed(3)),
        frame_despegue: 'Directo',
        frame_aterrizaje: 'Directo',
        // Ángulos de despegue
        angulo_rodilla_deg: normalizarNumeroOpcional(angulosDespegueActual.angulo_rodilla_deg),
        angulo_cadera_deg: normalizarNumeroOpcional(angulosDespegueActual.angulo_cadera_deg),
        // Ángulos de aterrizaje
        angulo_rodilla_aterrizaje_deg: normalizarNumeroOpcional(angulosAterrizajeActual.angulo_rodilla_deg),
        angulo_cadera_aterrizaje_deg: normalizarNumeroOpcional(angulosAterrizajeActual.angulo_cadera_deg),
        // Flexión máxima durante vuelo
        flexion_rodilla_max_deg: normalizarNumeroOpcional(minRodillaDuranteVuelo),
        flexion_cadera_max_deg: normalizarNumeroOpcional(minCaderaDuranteVuelo),
        potencia_w: calcularPotenciaLocal(textoTipo, distanciaFinalCm, tiempoVuelo),
        // Asimetría: preferir la del aterrizaje si existe, sino la de despegue
        asimetria_pct: normalizarNumeroOpcional(asimetriaAterrizajeActual) ?? normalizarNumeroOpcional(asimetriaDespegueActual),
        // Estabilidad real basada en oscilación post-aterrizaje
        estabilidad_aterrizaje: calcularEstabilidadPostAterrizaje(yPostAterrizaje)
            ?? calcularEstabilidadLocal(
                normalizarNumeroOpcional(asimetriaAterrizajeActual) ?? normalizarNumeroOpcional(asimetriaDespegueActual),
                framesConVisibilidad > 0 ? visibilidadAcumulada / framesConVisibilidad : 0.5
            )
    };

    const guardarVideo = getPreferenciaGuardarVideoTiempoReal() === 'si';
    const videoBlob = await detenerGrabacionYObtenerBlob();

    document.dispatchEvent(new Event('detenerDeteccion'));
    document.dispatchEvent(new Event('restaurarBotonCamara'));

    const respuestaPersistida = await guardarResultadoEnBackend(datosLocales, guardarVideo, videoBlob);
    if (respuestaPersistida?.datos_parciales) {
        mostrarToast('Analisis guardado con datos locales; algunas metricas avanzadas pueden no estar disponibles.', 'warn', 3200);
    }
    procesarResultadoSegunModo(respuestaPersistida);

    finalizandoSalto = false;
}

function procesarResultadoSegunModo(datos) {
    const modo = getModoAnalisis();
    if (modo !== 'comparativa') {
        animarResultados(datos);
        cargarAnaliticaUsuario({ lanzarToastFatiga: true }).catch(() => {
            // La UI principal ya mostró el resultado del salto.
        });
        return;
    }

    medidasComparativa.push(Number(datos.distancia || 0));

    if (medidasComparativa.length < SALTOS_OBJETIVO_COMPARATIVA) {
        actualizarBadgeComparativa();
        mostrarToast(
            `Salto ${medidasComparativa.length}/${SALTOS_OBJETIVO_COMPARATIVA} registrado: ${Number(datos.distancia || 0).toFixed(2)} cm`,
            'success',
            2200
        );
        cargarAnaliticaUsuario({ lanzarToastFatiga: true }).catch(() => {
            // No interrumpir modo comparativa si falla la analítica.
        });
        return;
    }

    const alias = sessionStorage.getItem('aliasUser') || 'Usuario';
    const tipo = (datos.tipo_salto || document.getElementById('tipo-salto')?.value || 'vertical').toString().toLowerCase();
    mostrarComparativa(alias, tipo, medidasComparativa);
    resetComparativa();
    cargarAnaliticaUsuario({ lanzarToastFatiga: true }).catch(() => {
        // No interrumpir modo comparativa si falla la analítica.
    });
}

document.addEventListener('iniciarDeteccion', () => {
    if (!hayUsuarioSeleccionadoParaDeteccion()) {
        mostrarToast('Debes seleccionar o crear un usuario para registrar el salto.', 'warn', 3000);
        document.dispatchEvent(new Event('restaurarBotonCamara'));
        return;
    }

    const usuario = getUsuarioActivo();

    const alturaInput = document.getElementById('altura-usuario');
    if (alturaInput && !alturaInput.value) {
        alturaInput.value = String(usuario.altura);
    }

    modoSalto = document.getElementById('tipo-salto').value;

    analisisActivo = true;
    estadoSalto = 'suelo';
    framesCalibracion = 0;
    alturaBaseY = 0;
    yPicoVuelo = 1.0;
    landmarksSuavizados = null;  // Reset suavizado para nueva sesión
    angulosDespegueActual = {
        angulo_rodilla_deg: null,
        angulo_cadera_deg: null
    };
    asimetriaDespegueActual = null;
    angulosAterrizajeActual = { angulo_rodilla_deg: null, angulo_cadera_deg: null };
    asimetriaAterrizajeActual = null;
    minRodillaDuranteVuelo = null;
    minCaderaDuranteVuelo = null;
    visibilidadAcumulada = 0;
    framesConVisibilidad = 0;
    yPostAterrizaje = [];
    finalizandoSalto = false;

    actualizarBadgeComparativa();

    iniciarGrabacionVideoSiAplica();
    renderLoop();
});

document.addEventListener('detenerDeteccion', () => {
    analisisActivo = false;
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (!finalizandoSalto) {
        detenerGrabacionYObtenerBlob().catch(() => {
            // Ignorar errores al detener manualmente la grabación.
        });
    }
});

document.addEventListener('videoListo', async (evento) => {
    const videoArchivo = evento.detail;
    ultimoArchivoSubido = videoArchivo;  // Guardar referencia para vídeo anotado
    const tipoSalto = document.getElementById('tipo-salto').value;
    const alturaUsuario = document.getElementById('altura-usuario').value;
    const idUsuario = sessionStorage.getItem('idUser');

    if (!alturaUsuario || Number(alturaUsuario) <= 0) {
        mostrarToast('Selecciona un usuario valido para definir la altura.', 'warn', 2800);
        return;
    }

    const formData = new FormData();
    formData.append('video', videoArchivo, 'archivo_subido.webm');
    formData.append('tipo_salto', tipoSalto);
    formData.append('altura_real_m', alturaUsuario);

    if (idUsuario) {
        formData.append('id_usuario', idUsuario);
        formData.append('metodo_origen', 'video_galeria');
    }

    try {
        const respuesta = await fetch(`${getBackendBaseUrl()}/api/salto/calcular`, {
            method: 'POST',
            body: formData
        });

        const datosGenerados = await respuesta.json();
        if (!respuesta.ok) {
            throw new Error(datosGenerados.error || `Error HTTP: ${respuesta.status}`);
        }

        procesarResultadoSegunModo(datosGenerados);
    } catch (error) {
        mostrarToast(`Error al conectar con el backend. Comprueba que app.py esta arrancado.`, 'error', 3600);
    } finally {
        document.dispatchEvent(new Event('resultadoProcesado'));
    }
});

function animarResultados(datos) {
    const panelResultados = document.getElementById('panel-resultados');
    const resumen = document.getElementById('comparativa-resumen');
    const gridTecnico = document.querySelector('.technical-data-grid');

    if (resumen) {
        resumen.style.display = 'none';
    }

    // Si no se detectó salto válido (distancia 0), mostrar mensaje claro
    const distancia = Number(datos.distancia || 0);
    if (distancia <= 0) {
        document.getElementById('distancia-resultado').textContent = 'No detectado';
        document.getElementById('tipo-resultado').textContent = `Salto ${normalizarTextoTipo(datos.tipo_salto)}`;

        if (gridTecnico) {
            gridTecnico.style.display = 'none';
        }

        // Ocultar paneles técnicos que no tienen sentido sin salto
        const panelAterrizaje = document.getElementById('panel-aterrizaje');
        if (panelAterrizaje) panelAterrizaje.style.display = 'none';
        const panelGesto = document.getElementById('panel-resumen-gesto');
        if (panelGesto) panelGesto.style.display = 'none';
        const panelTimeline = document.getElementById('panel-timeline');
        if (panelTimeline) panelTimeline.style.display = 'none';
        const panelCurvas = document.getElementById('panel-curvas');
        if (panelCurvas) panelCurvas.style.display = 'none';

        // Mostrar solo las observaciones del backend (que ahora incluyen el motivo)
        renderInsightsSalto(datos);

        mostrarToast('No se detectó un salto válido. Usa un vídeo con cuerpo completo, cámara fija y vista lateral.', 'warn', 5000);
        panelResultados.classList.add('show');
        return;
    }

    if (gridTecnico) {
        gridTecnico.style.display = 'grid';
    }

    document.getElementById('distancia-resultado').textContent = `${datos.distancia} ${datos.unidad || 'cm'}`;
    document.getElementById('tipo-resultado').textContent = `Salto ${normalizarTextoTipo(datos.tipo_salto)}`;

    const porcentaje = Math.round((datos.confianza || 0) * 100);
    const anguloRodilla = Number(datos.angulo_rodilla_deg);
    const anguloCadera = Number(datos.angulo_cadera_deg);
    document.getElementById('data-confianza').textContent = `${porcentaje}%`;
    document.getElementById('data-tiempo').textContent = datos.tiempo_vuelo_s ? `${datos.tiempo_vuelo_s}s` : '--';
    document.getElementById('data-despegue').textContent = datos.frame_despegue || '--';
    document.getElementById('data-aterrizaje').textContent = datos.frame_aterrizaje || '--';
    document.getElementById('data-angulo-rodilla').textContent = Number.isFinite(anguloRodilla) ? `${anguloRodilla.toFixed(2)} deg` : '--';
    document.getElementById('data-angulo-cadera').textContent = Number.isFinite(anguloCadera) ? `${anguloCadera.toFixed(2)} deg` : '--';

    const potencia = Number(datos.potencia_w);
    document.getElementById('data-potencia').textContent = Number.isFinite(potencia) ? `${potencia} W` : '--';

    const asimetria = Number(datos.asimetria_pct);
    const elAsimetria = document.getElementById('data-asimetria');
    if (Number.isFinite(asimetria)) {
        elAsimetria.textContent = `${asimetria}%`;
        elAsimetria.style.color = asimetria > 15 ? '#ff6b6b' : '';
    } else {
        elAsimetria.textContent = '--';
        elAsimetria.style.color = '';
    }

    // Fase 6 — Panel de aterrizaje
    renderPanelAterrizaje(datos);

    // Fase 7 — Resumen del gesto
    renderResumenGesto(datos);

    // Fase 8.1 — Timeline
    renderTimeline(datos);

    // Fase 8.2 — Gráficas
    renderGraficasCurvas(datos);

    // Fase 8.3 — Botón vídeo anotado (solo si vino de archivo, no de tiempo real)
    configurarBotonVideoAnotado(datos);

    // Fase 9 — Interpretación automática (alertas, observaciones, clasificación)
    renderInsightsSalto(datos);

    // Fase 12 — Indicador de slow-motion
    if (datos.slowmo_factor && datos.slowmo_factor > 1.3) {
        mostrarToast(
            `Slow-motion detectado (×${datos.slowmo_factor.toFixed(1)}). Tiempo de vuelo corregido automáticamente.`,
            'info', 4500
        );
    }

    panelResultados.classList.add('show');
}

// ── Fase 6 — Panel de aterrizaje ──

function renderPanelAterrizaje(datos) {
    const panel = document.getElementById('panel-aterrizaje');
    if (!panel) {
        return;
    }

    const estab = datos.estabilidad_aterrizaje;
    const amort = datos.amortiguacion;
    const asimRecep = normalizarNumeroOpcional(datos.asimetria_recepcion_pct);

    if (!estab && !amort && asimRecep === null) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';

    if (estab) {
        asignarTexto('data-oscilacion', `${estab.oscilacion_px} px`);
        asignarTexto('data-t-estabilizacion', `${estab.tiempo_estabilizacion_s} s`);
        asignarTexto('data-estable', estab.estable ? 'Sí' : 'No');
    }

    if (amort) {
        asignarTexto('data-rod-aterrizaje', `${amort.angulo_rodilla_aterrizaje_deg} deg`);
        asignarTexto('data-flex-maxima', `${amort.flexion_maxima_deg} deg`);
        asignarTexto('data-amortiguacion', `${amort.rango_amortiguacion_deg} deg`);

        const alertaRigidez = document.getElementById('alerta-rigidez');
        if (alertaRigidez) {
            alertaRigidez.style.display = amort.alerta_rigidez ? 'block' : 'none';
        }
    }

    const elAsimRecep = document.getElementById('data-asim-recepcion');
    const alertaAsim = document.getElementById('alerta-asim-recep');
    if (asimRecep !== null) {
        elAsimRecep.textContent = `${asimRecep}%`;
        elAsimRecep.style.color = asimRecep > 15 ? '#ff6b6b' : '';
        if (alertaAsim) {
            if (asimRecep > 15) {
                alertaAsim.textContent = `Alerta: asimetría de recepción ${asimRecep}% > 15% — riesgo de lesión.`;
                alertaAsim.style.display = 'block';
            } else {
                alertaAsim.style.display = 'none';
            }
        }
    } else {
        elAsimRecep.textContent = '--';
        elAsimRecep.style.color = '';
        if (alertaAsim) {
            alertaAsim.style.display = 'none';
        }
    }
}

// ── Fase 7 — Resumen del gesto ──

function renderResumenGesto(datos) {
    const panel = document.getElementById('panel-resumen-gesto');
    if (!panel) {
        return;
    }

    const resumen = datos.resumen_gesto;
    const vels = datos.velocidades_articulares;

    if (!resumen) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';

    asignarTexto('data-rom-rodilla', `${resumen.rom_rodilla_deg} deg`);
    asignarTexto('data-rom-cadera', `${resumen.rom_cadera_deg} deg`);
    asignarTexto('data-ratio-ec', resumen.ratio_excentrico_concentrico != null
        ? String(resumen.ratio_excentrico_concentrico) : '--');

    if (vels && vels.pico_vel_rodilla) {
        asignarTexto('data-pico-vel-rod', `${vels.pico_vel_rodilla.valor_deg_s} °/s`);
    } else {
        asignarTexto('data-pico-vel-rod', '-- °/s');
    }
}

// ── Fase 8.1 — Timeline interactivo ──

const COLORES_FASE = {
    preparatoria: '#7c4dff',
    impulsion: '#00e5ff',
    vuelo: '#69f0ae',
    recepcion: '#ff9100'
};

function renderTimeline(datos) {
    const panel = document.getElementById('panel-timeline');
    const barra = document.getElementById('timeline-barra');
    const detalle = document.getElementById('timeline-detalle');
    if (!panel || !barra) {
        return;
    }

    const fases = datos.fases_salto;
    if (!Array.isArray(fases) || fases.length === 0) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    barra.textContent = '';

    const frameMin = fases[0].frame_inicio;
    const frameMax = fases[fases.length - 1].frame_fin;
    const total = frameMax - frameMin || 1;

    fases.forEach((f) => {
        const dur = f.frame_fin - f.frame_inicio;
        const pct = (dur / total) * 100;
        const seg = document.createElement('div');
        seg.className = 'timeline-segmento';
        seg.style.width = `${pct}%`;
        seg.style.backgroundColor = COLORES_FASE[f.fase] || '#888';
        seg.title = `${f.fase} (frames ${f.frame_inicio}–${f.frame_fin})`;
        seg.textContent = f.fase.charAt(0).toUpperCase() + f.fase.slice(1, 4);

        seg.addEventListener('click', () => {
            if (detalle) {
                detalle.textContent = `${f.fase.charAt(0).toUpperCase() + f.fase.slice(1)}: frames ${f.frame_inicio}–${f.frame_fin} (${dur} frames)`;
            }
        });

        barra.appendChild(seg);
    });

    // Marcadores de eventos sobre la barra
    const eventos = [
        { frame: datos.frame_despegue, label: '▲', color: COLOR_DESPEGUE_HEX },
        { frame: datos.frame_aterrizaje, label: '▼', color: COLOR_ATERRIZAJE_HEX },
    ];

    eventos.forEach((ev) => {
        if (ev.frame == null) {
            return;
        }
        const pos = ((ev.frame - frameMin) / total) * 100;
        const marcador = document.createElement('span');
        marcador.className = 'timeline-marcador';
        marcador.style.left = `${pos}%`;
        marcador.style.color = ev.color;
        marcador.textContent = ev.label;
        marcador.title = `Frame ${ev.frame}`;
        barra.appendChild(marcador);
    });
}

const COLOR_DESPEGUE_HEX = '#ffeb3b';
const COLOR_ATERRIZAJE_HEX = '#ff5722';

// ── Fase 8.2 — Gráficas de curvas articulares ──

let graficaRodilla = null;
let graficaCadera = null;
let datosActuales = null; // Referencia al último resultado para comparar

function renderGraficasCurvas(datos) {
    const panel = document.getElementById('panel-graficas');
    if (!panel || !window.Chart) {
        return;
    }

    const curvas = datos.curvas_angulares;
    const fases = datos.fases_salto;
    if (!curvas || !Array.isArray(curvas.rodilla_deg)) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    datosActuales = datos;

    const labels = curvas.indices.map((idx) => String(idx));
    const faseBg = crearFondoFases(curvas.indices, fases);

    graficaRodilla = renderCurvaArticular(
        'grafica-rodilla', graficaRodilla, labels,
        curvas.rodilla_deg, 'Ángulo Rodilla (°)', '#59ffc7', faseBg
    );

    graficaCadera = renderCurvaArticular(
        'grafica-cadera', graficaCadera, labels,
        curvas.cadera_deg, 'Ángulo Cadera (°)', '#cb9cff', faseBg
    );

    // Poblar selector de comparación si hay usuario con historial
    poblarSelectorComparacion(datos);
}

function renderCurvaArticular(canvasId, instanciaPrevia, labels, datos, titulo, color, faseBg) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        return null;
    }

    if (instanciaPrevia) {
        instanciaPrevia.destroy();
    }

    return new window.Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: titulo,
                    data: datos,
                    borderColor: color,
                    backgroundColor: `${color}33`,
                    pointRadius: 1,
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#fff', boxWidth: 10 } },
                annotation: faseBg ? { annotations: faseBg } : undefined
            },
            scales: {
                x: {
                    ticks: { color: '#c9b8da', maxTicksLimit: 15 },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    title: { display: true, text: 'Frame', color: '#c9b8da' }
                },
                y: {
                    ticks: { color: '#c9b8da' },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    title: { display: true, text: 'Ángulo (°)', color: '#c9b8da' }
                }
            }
        }
    });
}

function crearFondoFases(indices, fases) {
    if (!Array.isArray(fases) || !Array.isArray(indices) || indices.length === 0) {
        return null;
    }

    // Sin el plugin chartjs-plugin-annotation, usamos un approach simple:
    // Devolvemos null y los colores se ven en el timeline.
    return null;
}

// ── Fase 8.2 — Comparar dos intentos superpuestos ──

async function poblarSelectorComparacion(datos) {
    const wrap = document.getElementById('comparar-salto-wrap');
    const select = document.getElementById('select-salto-comparar');
    const btnQuitar = document.getElementById('btn-quitar-comparacion');
    if (!wrap || !select) return;

    const usuario = getUsuarioActivo();
    const idSaltoActual = datos.id_salto;

    // Sin usuario o sin salto guardado → ocultar
    if (!usuario || !idSaltoActual) {
        wrap.style.display = 'none';
        return;
    }

    try {
        const resp = await fetch(
            `${getBackendBaseUrl()}/api/usuarios/${usuario.idUsuario}/saltos`
        );
        if (!resp.ok) { wrap.style.display = 'none'; return; }
        const saltos = await resp.json();

        // Filtrar el salto actual y quedarnos con los que tienen curvas
        const otros = saltos.filter(s => s.id_salto !== idSaltoActual);
        if (otros.length === 0) { wrap.style.display = 'none'; return; }

        // Poblar opciones
        select.innerHTML = '<option value="">— ninguno —</option>';
        otros.forEach(s => {
            const fecha = s.fecha ? s.fecha.replace('T', ' ').slice(0, 16) : '?';
            const dist = s.distancia_cm != null ? `${s.distancia_cm} cm` : '';
            const opt = document.createElement('option');
            opt.value = s.id_salto;
            opt.textContent = `#${s.id_salto} — ${s.tipo_salto} ${dist} (${fecha})`;
            select.appendChild(opt);
        });

        wrap.style.display = 'flex';

        // Evento: al seleccionar, superponer curvas
        select.onchange = async () => {
            const idComp = select.value;
            if (!idComp) {
                quitarComparacion();
                return;
            }
            await superponerCurvas(Number(idComp));
        };

        // Botón quitar
        if (btnQuitar) {
            btnQuitar.onclick = () => {
                select.value = '';
                quitarComparacion();
            };
        }
    } catch (err) {
        console.warn('Error al poblar selector de comparación:', err);
        wrap.style.display = 'none';
    }
}

async function superponerCurvas(idSaltoComp) {
    const btnQuitar = document.getElementById('btn-quitar-comparacion');
    try {
        const resp = await fetch(
            `${getBackendBaseUrl()}/api/saltos/${idSaltoComp}/curvas`
        );
        if (!resp.ok) {
            console.warn('No se pudieron obtener curvas del salto', idSaltoComp);
            return;
        }
        const payload = await resp.json();
        const curvas = payload.curvas_angulares;
        if (!curvas) {
            alert('El salto seleccionado no tiene curvas guardadas.');
            return;
        }

        // Añadir segunda serie a la gráfica de rodilla
        if (graficaRodilla && Array.isArray(curvas.rodilla_deg)) {
            agregarDatasetComparacion(
                graficaRodilla, curvas.rodilla_deg,
                `Rodilla #${idSaltoComp}`, '#ff9966'
            );
        }

        // Añadir segunda serie a la gráfica de cadera
        if (graficaCadera && Array.isArray(curvas.cadera_deg)) {
            agregarDatasetComparacion(
                graficaCadera, curvas.cadera_deg,
                `Cadera #${idSaltoComp}`, '#66ccff'
            );
        }

        if (btnQuitar) btnQuitar.style.display = 'inline-block';
    } catch (err) {
        console.warn('Error al superponer curvas:', err);
    }
}

function agregarDatasetComparacion(chart, datos, label, color) {
    // Eliminar dataset de comparación previo si existe
    while (chart.data.datasets.length > 1) {
        chart.data.datasets.pop();
    }

    chart.data.datasets.push({
        label: label,
        data: datos,
        borderColor: color,
        backgroundColor: color + '22',
        borderWidth: 2,
        borderDash: [6, 3],
        pointRadius: 0,
        tension: 0.3,
        fill: false
    });

    chart.update();
}

function quitarComparacion() {
    const btnQuitar = document.getElementById('btn-quitar-comparacion');

    [graficaRodilla, graficaCadera].forEach(chart => {
        if (chart && chart.data.datasets.length > 1) {
            while (chart.data.datasets.length > 1) {
                chart.data.datasets.pop();
            }
            chart.update();
        }
    });

    if (btnQuitar) btnQuitar.style.display = 'none';
}

// ── Fase 8.3 — Vídeo anotado ──

let ultimoArchivoSubido = null;

function configurarBotonVideoAnotado(datos) {
    const panel = document.getElementById('panel-video-anotado');
    const btn = document.getElementById('btn-video-anotado');
    if (!panel || !btn) {
        return;
    }

    // Solo mostrar si el salto tiene datos válidos y vino de archivo
    if (!datos.frame_despegue || !ultimoArchivoSubido) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    const estado = document.getElementById('video-anotado-estado');

    btn.onclick = async () => {
        btn.disabled = true;
        if (estado) {
            estado.textContent = 'Generando vídeo anotado...';
        }

        try {
            const formData = new FormData();
            formData.append('video', ultimoArchivoSubido, 'video_para_anotar.webm');
            formData.append('tipo_salto', datos.tipo_salto || 'vertical');
            formData.append('altura_real_m', String(
                document.getElementById('altura-usuario')?.value || sessionStorage.getItem('alturaUser') || '1.70'
            ));

            const idUsuario = sessionStorage.getItem('idUser');
            if (idUsuario) {
                formData.append('id_usuario', idUsuario);
            }

            const respuesta = await fetch(`${getBackendBaseUrl()}/api/salto/video-anotado`, {
                method: 'POST',
                body: formData
            });

            if (!respuesta.ok) {
                const err = await respuesta.json().catch(() => ({ error: 'Error desconocido' }));
                throw new Error(err.error || `HTTP ${respuesta.status}`);
            }

            const blob = await respuesta.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'salto_anotado.mp4';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (estado) {
                estado.textContent = 'Descarga completada.';
            }
        } catch (error) {
            if (estado) {
                estado.textContent = `Error: ${error.message}`;
            }
        } finally {
            btn.disabled = false;
        }
    };
}

document.getElementById('btn-reintentar').addEventListener('click', () => {
    document.getElementById('panel-resultados').classList.remove('show');
    ultimoArchivoSubido = null;

    // Limpiar paneles de análisis avanzado
    ['panel-aterrizaje', 'panel-resumen-gesto', 'panel-timeline', 'panel-graficas', 'panel-video-anotado'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
        }
    });
    if (graficaRodilla) {
        graficaRodilla.destroy();
        graficaRodilla = null;
    }
    if (graficaCadera) {
        graficaCadera.destroy();
        graficaCadera = null;
    }
});

document.getElementById('modo-analisis')?.addEventListener('change', () => {
    resetComparativa();
});

document.getElementById('tipo-salto')?.addEventListener('change', () => {
    if (getModoAnalisis() === 'comparativa') {
        resetComparativa();
    }
    cargarAnaliticaUsuario().catch(() => {
        // El usuario puede seguir usando la app aunque falle la analítica.
    });
});

document.addEventListener('usuarioSeleccionCambio', () => {
    cargarAnaliticaUsuario().catch(() => {
        // El flujo de usuario activo sigue funcionando aunque falle la analítica.
    });
});

document.getElementById('btn-actualizar-analitica')?.addEventListener('click', () => {
    cargarAnaliticaUsuario({ mostrarErrores: true }).catch(() => {
        // El error ya se notifica con toast.
    });
});

document.getElementById('metrica-analitica')?.addEventListener('change', () => {
    cargarAnaliticaUsuario().catch(() => {
        // Mantener experiencia principal aunque falle actualización de analítica.
    });
});

actualizarBadgeComparativa();
limpiarAnaliticaPanel();
fijarTamanoGraficasAnalitica();
cargarAnaliticaUsuario().catch(() => {
    // Si falla al iniciar, se mantiene el panel en estado neutral.
});
