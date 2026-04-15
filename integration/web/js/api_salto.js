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

let mediaRecorder = null;
let chunksGrabacion = [];
let stopRecorderResolver = null;
let toastTimer = null;
// Buffer local de landmarks capturados en tiempo real.
// Se usa como respaldo cuando la respuesta del backend no trae landmarks.
let landmarksFramesLocalBuffer = [];
let landmarksFrameSeq = 0;
const MAX_LANDMARKS_LOCAL_FRAMES = 1500;

const SALTOS_OBJETIVO_COMPARATIVA = 4;
let medidasComparativa = [];
let graficaTendencia = null;
let graficaAsimetria = null;
let graficaCorrPesoPotencia = null;
let graficaCorrAsimEstabilidad = null;
let ultimaAlertaFatigaClave = '';
const CHART_BOX_HEIGHT_PX = 220;

// Mapa explicito de conexiones del esqueleto (33 puntos de MediaPipe Pose).
// Se reutiliza tanto en el render 2D como en el render 3D.
const POSE_CONNECTIONS_33 = [
    [0, 1], [1, 2], [2, 3], [3, 7],
    [0, 4], [4, 5], [5, 6], [6, 8],
    [9, 10],
    [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
    [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
    [11, 23], [12, 24], [23, 24], [23, 25], [24, 26],
    [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32],
    [27, 31], [28, 32]
];

// Cache de landmarks por id_salto para evitar recargas repetidas al backend.
const landmarksCache = new Map();
// Promesa singleton para cargar dependencias 3D solo una vez.
let threeDepsPromise = null;
// Estado central del visor de landmarks (modo, frame activo e instancia 3D).
const landmarksViewerState = {
    idSalto: null,
    frames: [],
    currentFrame: 0,
    mode: '2d',
    three: null,
    // Paso 4 — Animación
    playing: false,
    speed: 1,
    animTimerId: null,
    // Paso 5 — Datos del salto (fases, curvas) para overlays
    datos: null,
    overlays: { angulos: false, trayectoria: false, fases: false },
    // Paso 6 — Comparación
    compareFrames: null,
    compareIdSalto: null
};

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

// Heuristicas locales minimas para no perder clasificacion/alertas
// cuando el backend no devuelve insights completos.
function construirInsightsLocales(datos) {
    const alertas = [];
    const observaciones = [];

    const angRod = normalizarNumeroOpcional(datos?.angulo_rodilla_deg);
    const angCad = normalizarNumeroOpcional(datos?.angulo_cadera_deg);
    const asim = normalizarNumeroOpcional(datos?.asimetria_pct);
    const conf = normalizarNumeroOpcional(datos?.confianza);

    if (angRod !== null && angRod >= 165) {
        alertas.push({
            codigo: 'amortiguacion_insuficiente',
            mensaje: 'Amortiguacion insuficiente detectada (recepcion rigida).',
            severidad: 'media'
        });
    }
    if (angCad !== null && angCad < 145) {
        alertas.push({
            codigo: 'extension_cadera_limitada',
            mensaje: 'Extension de cadera limitada en el despegue.',
            severidad: 'media'
        });
    }
    if (asim !== null && asim > 15) {
        alertas.push({
            codigo: 'desequilibrio_recepcion',
            mensaje: 'Asimetria superior al 15% en la recepcion.',
            severidad: 'alta'
        });
    }
    if (conf !== null && conf < 0.6) {
        alertas.push({
            codigo: 'recepcion_inestable',
            mensaje: 'Confianza baja; revisa encuadre e iluminacion.',
            severidad: 'media'
        });
    }

    if (alertas.length === 0) {
        observaciones.push('Tecnica estable sin desviaciones relevantes en este intento.');
    } else {
        observaciones.push('Se detectaron alertas; repite con mejor encuadre para confirmar.');
    }

    let clasificacion = 'tecnicamente_correcto';
    if (asim !== null && asim > 15) {
        clasificacion = 'asimetrico';
    } else if (alertas.length > 0) {
        clasificacion = 'equilibrado';
    }

    return { alertas, observaciones, clasificacion };
}

// Fusion robusta backend + local:
// - Prioriza datos backend cuando existen.
// - Mantiene distancia local si backend devuelve 0 y local es valida.
// - Preserva campos avanzados y dispara enriquecimiento local si faltan.
function combinarResultadoConFallback(payload, datosLocales) {
    const distanciaPayload = normalizarNumeroOpcional(payload?.distancia);
    const distanciaLocal = normalizarNumeroOpcional(datosLocales?.distancia);
    const usarDistanciaLocal = (distanciaPayload !== null && distanciaPayload <= 0)
        && (distanciaLocal !== null && distanciaLocal > 0);

    const combinado = {
        ...payload,
        distancia: usarDistanciaLocal ? distanciaLocal : (distanciaPayload ?? distanciaLocal ?? 0),
        unidad: payload?.unidad || datosLocales?.unidad || 'cm',
        tipo_salto: payload?.tipo_salto || datosLocales?.tipo_salto || modoSalto,
        confianza: normalizarNumeroOpcional(payload?.confianza) ?? normalizarNumeroOpcional(datosLocales?.confianza) ?? 0,
        tiempo_vuelo_s: normalizarNumeroOpcional(payload?.tiempo_vuelo_s) ?? normalizarNumeroOpcional(datosLocales?.tiempo_vuelo_s),
        frame_despegue: payload?.frame_despegue ?? datosLocales?.frame_despegue ?? null,
        frame_aterrizaje: payload?.frame_aterrizaje ?? datosLocales?.frame_aterrizaje ?? null,
    };

    const landmarksPayload = _normalizarFramesLandmarks(payload?.landmarks_frames || []);
    const landmarksLocal = _normalizarFramesLandmarks(datosLocales?.landmarks_frames || []);
    combinado.landmarks_frames = landmarksPayload.length > 0 ? landmarksPayload : landmarksLocal;

    const potenciaPayload = normalizarNumeroOpcional(payload?.potencia_w);
    const asimetriaPayload = normalizarNumeroOpcional(payload?.asimetria_pct);
    const estabilidadPayload = normalizarNumeroOpcional(payload?.estabilidad_aterrizaje);
    const potenciaLocal = normalizarNumeroOpcional(datosLocales?.potencia_w);
    const asimetriaLocal = normalizarNumeroOpcional(datosLocales?.asimetria_pct);
    const estabilidadLocal = normalizarNumeroOpcional(datosLocales?.estabilidad_aterrizaje);

    combinado.potencia_w = potenciaPayload ?? potenciaLocal;
    combinado.asimetria_pct = asimetriaPayload ?? asimetriaLocal;
    combinado.estabilidad_aterrizaje = estabilidadPayload ?? estabilidadLocal;
    combinado.angulo_rodilla_deg = normalizarNumeroOpcional(payload?.angulo_rodilla_deg)
        ?? normalizarNumeroOpcional(datosLocales?.angulo_rodilla_deg);
    combinado.angulo_cadera_deg = normalizarNumeroOpcional(payload?.angulo_cadera_deg)
        ?? normalizarNumeroOpcional(datosLocales?.angulo_cadera_deg);

    if (!Array.isArray(combinado.alertas) || typeof combinado.clasificacion !== 'string' || !combinado.clasificacion) {
        const insights = construirInsightsLocales(combinado);
        combinado.alertas = Array.isArray(combinado.alertas) ? combinado.alertas : insights.alertas;
        combinado.observaciones = Array.isArray(combinado.observaciones) ? combinado.observaciones : insights.observaciones;
        if (!combinado.clasificacion) {
            combinado.clasificacion = insights.clasificacion;
        }
    }

    const necesitaAnalisisLocal = !combinado.curvas_angulares
        || !Array.isArray(combinado.curvas_angulares?.rodilla_deg)
        || !Array.isArray(combinado.fases_salto)
        || !combinado.resumen_gesto
        || !combinado.amortiguacion
        || !combinado.estabilidad_detalle;

    if (necesitaAnalisisLocal) {
        enriquecerAnalisisDesdeLandmarks(combinado);
    }

    return combinado;
}

// Punto unico de normalizacion para UI.
// Garantiza paridad entre flujo de tiempo real y flujo de video de galeria.
function normalizarResultadoParaUI(payload, datosLocales = null) {
    const basePayload = (payload && typeof payload === 'object') ? payload : {};
    const baseLocales = (datosLocales && typeof datosLocales === 'object') ? datosLocales : {};

    const localesParaMerge = {
        distancia: normalizarNumeroOpcional(baseLocales.distancia) ?? normalizarNumeroOpcional(basePayload.distancia),
        unidad: baseLocales.unidad || basePayload.unidad,
        tipo_salto: baseLocales.tipo_salto || basePayload.tipo_salto,
        confianza: normalizarNumeroOpcional(baseLocales.confianza) ?? normalizarNumeroOpcional(basePayload.confianza),
        tiempo_vuelo_s: normalizarNumeroOpcional(baseLocales.tiempo_vuelo_s) ?? normalizarNumeroOpcional(basePayload.tiempo_vuelo_s),
        frame_despegue: baseLocales.frame_despegue ?? basePayload.frame_despegue,
        frame_aterrizaje: baseLocales.frame_aterrizaje ?? basePayload.frame_aterrizaje,
        potencia_w: normalizarNumeroOpcional(baseLocales.potencia_w) ?? normalizarNumeroOpcional(basePayload.potencia_w),
        asimetria_pct: normalizarNumeroOpcional(baseLocales.asimetria_pct) ?? normalizarNumeroOpcional(basePayload.asimetria_pct),
        estabilidad_aterrizaje: normalizarNumeroOpcional(baseLocales.estabilidad_aterrizaje)
            ?? normalizarNumeroOpcional(basePayload.estabilidad_aterrizaje),
        angulo_rodilla_deg: normalizarNumeroOpcional(baseLocales.angulo_rodilla_deg)
            ?? normalizarNumeroOpcional(basePayload.angulo_rodilla_deg),
        angulo_cadera_deg: normalizarNumeroOpcional(baseLocales.angulo_cadera_deg)
            ?? normalizarNumeroOpcional(basePayload.angulo_cadera_deg),
        landmarks_frames: Array.isArray(baseLocales.landmarks_frames)
            ? baseLocales.landmarks_frames
            : (Array.isArray(basePayload.landmarks_frames) ? basePayload.landmarks_frames : [])
    };

    return combinarResultadoConFallback(basePayload, localesParaMerge);
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

// Estima FPS real a partir de timestamps de landmarks para analisis local.
function estimarFpsDesdeLandmarksFrames(frames) {
    if (!Array.isArray(frames) || frames.length < 2) {
        return 30;
    }

    const deltas = [];
    for (let i = 1; i < frames.length; i += 1) {
        const t0 = normalizarNumeroOpcional(frames[i - 1]?.timestamp_s);
        const t1 = normalizarNumeroOpcional(frames[i]?.timestamp_s);
        if (t0 === null || t1 === null) {
            continue;
        }
        const dt = t1 - t0;
        if (dt > 0) {
            deltas.push(dt);
        }
    }
    if (deltas.length === 0) {
        return 30;
    }
    deltas.sort((a, b) => a - b);
    const mediana = deltas[Math.floor(deltas.length / 2)] || 1 / 30;
    const fps = 1 / mediana;
    return Number.isFinite(fps) && fps > 0 ? fps : 30;
}

function extraerYMedioPies(landmarks) {
    const y1 = normalizarNumeroOpcional(landmarks?.[27]?.y);
    const y2 = normalizarNumeroOpcional(landmarks?.[28]?.y);
    if (y1 === null && y2 === null) {
        return null;
    }
    if (y1 === null) {
        return y2;
    }
    if (y2 === null) {
        return y1;
    }
    return (y1 + y2) / 2;
}

function estimarDespegueAterrizajeLocal(frames) {
    if (!Array.isArray(frames) || frames.length < 8) {
        return { despegue: null, aterrizaje: null };
    }

    const y = frames.map((f) => extraerYMedioPies(f?.landmarks));
    const validos = y.filter((v) => v !== null);
    if (validos.length < 8) {
        return { despegue: null, aterrizaje: null };
    }

    const nBase = Math.max(6, Math.min(30, Math.floor(validos.length * 0.25)));
    const base = validos.slice(0, nBase).reduce((a, b) => a + b, 0) / nBase;
    const umbral = base - 0.02;

    let despegue = null;
    let aterrizaje = null;
    let enAire = false;

    for (let i = 0; i < y.length; i += 1) {
        const yi = y[i];
        if (yi === null) {
            continue;
        }
        if (!enAire && yi < umbral) {
            enAire = true;
            despegue = i;
            continue;
        }
        if (enAire && yi >= umbral) {
            aterrizaje = i;
            break;
        }
    }

    if (despegue === null || aterrizaje === null || aterrizaje <= despegue) {
        return { despegue: null, aterrizaje: null };
    }

    return { despegue, aterrizaje };
}

// Reconstruye analisis avanzado desde landmarks cuando el payload llega incompleto:
// curvas, fases, resumen de gesto, velocidad articular y metrica de aterrizaje.
function enriquecerAnalisisDesdeLandmarks(resultado) {
    const frames = _normalizarFramesLandmarks(resultado?.landmarks_frames || []);
    if (!Array.isArray(frames) || frames.length < 8) {
        return;
    }

    const fps = estimarFpsDesdeLandmarksFrames(frames);
    let frameDespegue = Number.isFinite(Number(resultado?.frame_despegue)) ? Number(resultado.frame_despegue) : null;
    let frameAterrizaje = Number.isFinite(Number(resultado?.frame_aterrizaje)) ? Number(resultado.frame_aterrizaje) : null;

    if (frameDespegue === null || frameAterrizaje === null || frameAterrizaje <= frameDespegue) {
        const est = estimarDespegueAterrizajeLocal(frames);
        frameDespegue = est.despegue;
        frameAterrizaje = est.aterrizaje;
        if (frameDespegue !== null && frameAterrizaje !== null) {
            resultado.frame_despegue = frameDespegue;
            resultado.frame_aterrizaje = frameAterrizaje;
            if (normalizarNumeroOpcional(resultado.tiempo_vuelo_s) === null) {
                resultado.tiempo_vuelo_s = Number(((frameAterrizaje - frameDespegue) / fps).toFixed(3));
            }
        }
    }

    const indices = [];
    const rodilla = [];
    const cadera = [];

    for (let i = 0; i < frames.length; i += 1) {
        const lm = frames[i]?.landmarks;
        const ang = calcularAngulosDespegueDesdeLandmarks(lm);
        indices.push(i);
        rodilla.push(normalizarNumeroOpcional(ang?.angulo_rodilla_deg));
        cadera.push(normalizarNumeroOpcional(ang?.angulo_cadera_deg));
    }

    const hayCurvas = rodilla.some((v) => v !== null) && cadera.some((v) => v !== null);
    if ((!resultado.curvas_angulares || !Array.isArray(resultado.curvas_angulares.rodilla_deg)) && hayCurvas) {
        resultado.curvas_angulares = {
            indices,
            rodilla_deg: rodilla,
            cadera_deg: cadera
        };
    }

    const rodVal = rodilla.filter((v) => v !== null);
    const cadVal = cadera.filter((v) => v !== null);

    if (!resultado.resumen_gesto && rodVal.length > 0 && cadVal.length > 0) {
        const romRod = Math.max(...rodVal) - Math.min(...rodVal);
        const romCad = Math.max(...cadVal) - Math.min(...cadVal);
        resultado.resumen_gesto = {
            rom_rodilla_deg: Number(romRod.toFixed(2)),
            rom_cadera_deg: Number(romCad.toFixed(2)),
            ratio_excentrico_concentrico: null
        };
    }

    if (!resultado.velocidades_articulares && rodVal.length > 1) {
        let maxVel = 0;
        let idxVel = 0;
        for (let i = 1; i < rodilla.length; i += 1) {
            const a0 = rodilla[i - 1];
            const a1 = rodilla[i];
            if (a0 === null || a1 === null) {
                continue;
            }
            const vel = Math.abs((a1 - a0) * fps);
            if (vel > maxVel) {
                maxVel = vel;
                idxVel = i;
            }
        }
        resultado.velocidades_articulares = {
            pico_vel_rodilla: {
                valor_deg_s: Number(maxVel.toFixed(1)),
                frame_idx: idxVel
            }
        };
    }

    if ((!resultado.fases_salto || !Array.isArray(resultado.fases_salto) || resultado.fases_salto.length === 0)
        && frameDespegue !== null && frameAterrizaje !== null && frameAterrizaje > frameDespegue) {
        const prepIni = Math.max(0, frameDespegue - Math.max(4, Math.floor(fps * 0.2)));
        const impIni = Math.max(prepIni, frameDespegue - Math.max(2, Math.floor(fps * 0.08)));
        const recepFin = Math.min(frames.length - 1, frameAterrizaje + Math.max(6, Math.floor(fps * 0.25)));
        resultado.fases_salto = [
            { fase: 'preparatoria', frame_inicio: prepIni, frame_fin: Math.max(prepIni, impIni - 1) },
            { fase: 'impulsion', frame_inicio: impIni, frame_fin: frameDespegue },
            { fase: 'vuelo', frame_inicio: frameDespegue, frame_fin: frameAterrizaje },
            { fase: 'recepcion', frame_inicio: frameAterrizaje, frame_fin: recepFin }
        ];
    }

    if ((!resultado.estabilidad_detalle || typeof resultado.estabilidad_detalle !== 'object')
        && frameAterrizaje !== null) {
        const fin = Math.min(frames.length, frameAterrizaje + Math.max(6, Math.floor(fps * 0.8)));
        const caderasY = [];
        for (let i = frameAterrizaje; i < fin; i += 1) {
            const yL = normalizarNumeroOpcional(frames[i]?.landmarks?.[23]?.y);
            const yR = normalizarNumeroOpcional(frames[i]?.landmarks?.[24]?.y);
            if (yL === null && yR === null) {
                continue;
            }
            caderasY.push((yL ?? yR));
        }
        if (caderasY.length >= 3) {
            const media = caderasY.reduce((a, b) => a + b, 0) / caderasY.length;
            const varianza = caderasY.reduce((a, b) => a + ((b - media) ** 2), 0) / caderasY.length;
            const std = Math.sqrt(varianza);
            const escalaPx = video?.videoHeight || 1080;
            const oscilacionPx = std * escalaPx;

            let idxEst = null;
            for (let i = 1; i < caderasY.length - 1; i += 1) {
                const d1 = Math.abs(caderasY[i] - caderasY[i - 1]);
                const d2 = Math.abs(caderasY[i + 1] - caderasY[i]);
                if (d1 < 0.0015 && d2 < 0.0015) {
                    idxEst = i;
                    break;
                }
            }

            const tEst = idxEst === null ? ((fin - frameAterrizaje) / fps) : (idxEst / fps);
            resultado.estabilidad_detalle = {
                oscilacion_px: Number(oscilacionPx.toFixed(2)),
                tiempo_estabilizacion_s: Number(tEst.toFixed(3)),
                estable: idxEst !== null
            };
        }
    }

    if ((!resultado.amortiguacion || typeof resultado.amortiguacion !== 'object')
        && frameAterrizaje !== null && rodVal.length > 0) {
        const fin = Math.min(rodilla.length, frameAterrizaje + Math.max(6, Math.floor(fps * 0.8)));
        let angAterr = null;
        for (let i = frameAterrizaje; i < fin; i += 1) {
            if (rodilla[i] !== null) {
                angAterr = rodilla[i];
                break;
            }
        }
        if (angAterr !== null) {
            const tramo = rodilla.slice(frameAterrizaje, fin).filter((v) => v !== null);
            if (tramo.length > 0) {
                const flexMin = Math.min(...tramo);
                const rango = angAterr - flexMin;
                resultado.amortiguacion = {
                    angulo_rodilla_aterrizaje_deg: Number(angAterr.toFixed(2)),
                    flexion_maxima_deg: Number(flexMin.toFixed(2)),
                    rango_amortiguacion_deg: Number(rango.toFixed(2)),
                    alerta_rigidez: rango < 20
                };
            }
        }
    }

    if (normalizarNumeroOpcional(resultado.asimetria_recepcion_pct) === null && frameAterrizaje !== null) {
        const lm = frames[frameAterrizaje]?.landmarks;
        const yl = normalizarNumeroOpcional(lm?.[29]?.y ?? lm?.[27]?.y);
        const yr = normalizarNumeroOpcional(lm?.[30]?.y ?? lm?.[28]?.y);
        if (yl !== null && yr !== null) {
            const maximo = Math.max(Math.abs(yl), Math.abs(yr), 1e-6);
            resultado.asimetria_recepcion_pct = Number((((Math.abs(yl - yr)) / maximo) * 100).toFixed(1));
        }
    }
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

    _ocultarPanelLandmarks();

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
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numPoses: 1
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
            const puntosCuerpo = resultados.landmarks[0];

            registrarLandmarksLocales(puntosCuerpo);

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

// Guarda landmarks frame a frame durante deteccion en vivo.
// Este registro permite mostrar el panel 2D/3D aunque falle la ruta remota.
function registrarLandmarksLocales(landmarks) {
    if (!Array.isArray(landmarks) || landmarks.length === 0) {
        return;
    }

    const serializados = landmarks.map((p) => ({
        x: normalizarNumeroOpcional(p?.x),
        y: normalizarNumeroOpcional(p?.y),
        z: normalizarNumeroOpcional(p?.z),
        visibility: normalizarNumeroOpcional(p?.visibility)
    }));

    landmarksFramesLocalBuffer.push({
        frame_idx: landmarksFrameSeq,
        timestamp_s: normalizarNumeroOpcional(video?.currentTime) ?? 0,
        landmarks: serializados
    });
    landmarksFrameSeq += 1;

    if (landmarksFramesLocalBuffer.length > MAX_LANDMARKS_LOCAL_FRAMES) {
        landmarksFramesLocalBuffer.shift();
    }
}

function calcularFaseSalto(landmarks) {
    const yPieActual = (landmarks[27].y + landmarks[28].y) / 2;
    const xPieActual = (landmarks[27].x + landmarks[28].x) / 2;

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
    } else if (estadoSalto === 'aire') {
        if (yPieActual < yPicoVuelo) {
            yPicoVuelo = yPieActual;
        }

        if (yPieActual > umbralDespegue) {
            estadoSalto = 'suelo';
            const tiempoAterrizaje = performance.now();
            const aterrizajeX = xPieActual;

            const tiempoVueloSegundos = (tiempoAterrizaje - tiempoDespegue) / 1000;
            if (tiempoVueloSegundos > 0.15) {
                finalizarSaltoEnVivo(tiempoVueloSegundos, despegueX, aterrizajeX, posicionSueloNormal, yPicoVuelo)
                    .catch((error) => {
                        mostrarToast(`No se pudo guardar el salto: ${error.message}`, 'error', 3200);
                    });
            }
        }
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

        const insights = construirInsightsLocales(datosLocales);

        return {
            ...datosLocales,
            id_salto: payloadLocal.id_salto,
            datos_parciales: true,
            alertas: insights.alertas,
            observaciones: insights.observaciones,
            clasificacion: insights.clasificacion
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
        // Solicita landmarks inline para render inmediato sin llamada extra.
        formData.append('incluir_landmarks', 'true');

        const respuesta = await fetch(`${getBackendBaseUrl()}/api/salto/calcular`, {
            method: 'POST',
            body: formData
        });

        const payload = await respuesta.json();
        if (!respuesta.ok) {
            throw new Error(payload.error || `Error HTTP: ${respuesta.status}`);
        }

        const distanciaBackend = Number(payload.distancia || 0);
        if (distanciaBackend <= 0 && Number(datosLocales.distancia || 0) > 0) {
            // Si backend devuelve 0 cm, mantenemos analisis avanzado y
            // aplicamos distancia local calibrada para no romper UX.
            mostrarToast('El backend devolvio 0 cm; se mantiene analisis avanzado y se muestra distancia local calibrada.', 'warn', 3200);
            return combinarResultadoConFallback(payload, datosLocales);
        }

        return combinarResultadoConFallback(payload, datosLocales);
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
        confianza: 0.95,
        tiempo_vuelo_s: Number(tiempoVuelo.toFixed(3)),
        frame_despegue: 'Directo',
        frame_aterrizaje: 'Directo',
        angulo_rodilla_deg: normalizarNumeroOpcional(angulosDespegueActual.angulo_rodilla_deg),
        angulo_cadera_deg: normalizarNumeroOpcional(angulosDespegueActual.angulo_cadera_deg),
        potencia_w: calcularPotenciaLocal(textoTipo, distanciaFinalCm, tiempoVuelo),
        asimetria_pct: normalizarNumeroOpcional(asimetriaDespegueActual),
        estabilidad_aterrizaje: calcularEstabilidadLocal(asimetriaDespegueActual, 0.95),
        landmarks_frames: landmarksFramesLocalBuffer.slice()
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
    // Normalizacion unica para todos los modos (individual/comparativa)
    // y para todos los origenes (tiempo real/galeria).
    const datosNormalizados = normalizarResultadoParaUI(datos);
    const modo = getModoAnalisis();
    if (modo !== 'comparativa') {
        animarResultados(datosNormalizados);
        cargarAnaliticaUsuario({ lanzarToastFatiga: true }).catch(() => {
            // La UI principal ya mostró el resultado del salto.
        });
        return;
    }

    medidasComparativa.push(Number(datosNormalizados.distancia || 0));

    if (medidasComparativa.length < SALTOS_OBJETIVO_COMPARATIVA) {
        actualizarBadgeComparativa();
        mostrarToast(
            `Salto ${medidasComparativa.length}/${SALTOS_OBJETIVO_COMPARATIVA} registrado: ${Number(datosNormalizados.distancia || 0).toFixed(2)} cm`,
            'success',
            2200
        );
        cargarAnaliticaUsuario({ lanzarToastFatiga: true }).catch(() => {
            // No interrumpir modo comparativa si falla la analítica.
        });
        return;
    }

    const alias = sessionStorage.getItem('aliasUser') || 'Usuario';
    const tipo = (datosNormalizados.tipo_salto || document.getElementById('tipo-salto')?.value || 'vertical').toString().toLowerCase();
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
    angulosDespegueActual = {
        angulo_rodilla_deg: null,
        angulo_cadera_deg: null
    };
    asimetriaDespegueActual = null;
    finalizandoSalto = false;
    landmarksFramesLocalBuffer = [];
    landmarksFrameSeq = 0;

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
    // Mantiene el mismo contrato de salida que tiempo real para visor landmarks.
    formData.append('incluir_landmarks', 'true');

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
    if (gridTecnico) {
        gridTecnico.style.display = 'grid';
    }

    const distancia = normalizarNumeroOpcional(datos.distancia);
    document.getElementById('distancia-resultado').textContent = `${(distancia ?? 0).toFixed(2)} ${datos.unidad || 'cm'}`;
    document.getElementById('tipo-resultado').textContent = `Salto ${normalizarTextoTipo(datos.tipo_salto)}`;

    const confianza = normalizarNumeroOpcional(datos.confianza) ?? 0;
    const porcentaje = Math.round(confianza * 100);
    const tiempoVuelo = normalizarNumeroOpcional(datos.tiempo_vuelo_s);
    const frameDespegue = (datos.frame_despegue ?? '--');
    const frameAterrizaje = (datos.frame_aterrizaje ?? '--');
    const anguloRodilla = Number(datos.angulo_rodilla_deg);
    const anguloCadera = Number(datos.angulo_cadera_deg);
    document.getElementById('data-confianza').textContent = `${porcentaje}%`;
    document.getElementById('data-tiempo').textContent = (tiempoVuelo !== null) ? `${tiempoVuelo.toFixed(3)} s` : '--';
    document.getElementById('data-despegue').textContent = String(frameDespegue);
    document.getElementById('data-aterrizaje').textContent = String(frameAterrizaje);
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

    const estabilidad = normalizarNumeroOpcional(datos.estabilidad_aterrizaje);
    const elEstabilidad = document.getElementById('data-estabilidad');
    if (elEstabilidad) {
        if (estabilidad !== null) {
            elEstabilidad.textContent = `${estabilidad.toFixed(1)} / 100`;
            elEstabilidad.style.color = estabilidad < 60 ? '#ff6b6b' : '';
        } else {
            elEstabilidad.textContent = '--';
            elEstabilidad.style.color = '';
        }
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

    // Fase 10 — Visualización frame a frame de landmarks 33 puntos
    renderPanelLandmarksResultado(datos).catch((error) => {
        console.warn('No se pudo renderizar el panel de landmarks:', error);
    });

    panelResultados.classList.add('show');
}

// ── Fase 6 — Panel de aterrizaje ──

function renderPanelAterrizaje(datos) {
    const panel = document.getElementById('panel-aterrizaje');
    if (!panel) {
        return;
    }

    const estab = (datos.estabilidad_detalle && typeof datos.estabilidad_detalle === 'object')
        ? datos.estabilidad_detalle
        : ((datos.estabilidad_aterrizaje && typeof datos.estabilidad_aterrizaje === 'object') ? datos.estabilidad_aterrizaje : null);
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

// ── Fase 10 — Viewer de landmarks frame a frame (2D + 3D) ──

function _landmarksUI() {
    return {
        panel: document.getElementById('panel-landmarks'),
        estado: document.getElementById('landmarks-estado'),
        controls: document.getElementById('landmarks-controls'),
        slider: document.getElementById('landmarks-slider'),
        frameEtiqueta: document.getElementById('landmarks-frame-etiqueta'),
        tiempoEtiqueta: document.getElementById('landmarks-tiempo-etiqueta'),
        canvas2d: document.getElementById('landmarks-canvas-2d'),
        view3d: document.getElementById('landmarks-view-3d'),
        btn2d: document.getElementById('btn-landmarks-2d'),
        btn3d: document.getElementById('btn-landmarks-3d'),
        // Paso 4
        btnPlay: document.getElementById('btn-landmarks-play'),
        btnSpeed: document.getElementById('btn-landmarks-speed'),
        faseActual: document.getElementById('landmarks-fase-actual'),
        // Paso 5
        chkAngulos: document.getElementById('chk-overlay-angulos'),
        chkTrayectoria: document.getElementById('chk-overlay-trayectoria'),
        chkFases: document.getElementById('chk-overlay-fases'),
        metricasPanel: document.getElementById('landmarks-metricas-panel'),
        metRodilla: document.getElementById('lm-met-rodilla'),
        metCadera: document.getElementById('lm-met-cadera'),
        metFase: document.getElementById('lm-met-fase'),
        // Paso 6
        compararWrap: document.getElementById('landmarks-comparar-wrap'),
        selectComparar: document.getElementById('select-landmarks-comparar')
    };
}

function _setLandmarksEstado(texto) {
    const { estado } = _landmarksUI();
    if (estado) {
        estado.textContent = texto;
    }
}

function _normalizarLandmark(p) {
    if (!p || typeof p !== 'object') {
        return null;
    }
    const x = Number(p.x);
    const y = Number(p.y);
    const z = Number(p.z);
    const visibility = p.visibility == null ? null : Number(p.visibility);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
    }
    return {
        x,
        y,
        z,
        visibility: Number.isFinite(visibility) ? visibility : null
    };
}

function _normalizarFramesLandmarks(frames) {
    if (!Array.isArray(frames)) {
        return [];
    }
    const salida = frames.map((f, idx) => ({
        frame_idx: Number.isFinite(Number(f?.frame_idx)) ? Number(f.frame_idx) : idx,
        timestamp_s: Number.isFinite(Number(f?.timestamp_s)) ? Number(f.timestamp_s) : 0,
        landmarks: Array.isArray(f?.landmarks) ? f.landmarks.map(_normalizarLandmark) : []
    }));

    // Normaliza timestamps a tiempo relativo del primer frame
    // para evitar valores absolutos grandes en la UI.
    const t0 = salida.length > 0 ? salida[0].timestamp_s : 0;
    return salida.map((f) => ({
        ...f,
        timestamp_s: Math.max(0, f.timestamp_s - t0)
    }));
}

function _dibujarFrame2D(frame) {
    const { canvas2d } = _landmarksUI();
    if (!canvas2d) {
        return;
    }

    const ctx = canvas2d.getContext('2d');
    const w = canvas2d.width;
    const h = canvas2d.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#130f1b';
    ctx.fillRect(0, 0, w, h);

    const lms = Array.isArray(frame?.landmarks) ? frame.landmarks : [];
    if (lms.length === 0) {
        ctx.fillStyle = '#d8c6ea';
        ctx.font = '14px Segoe UI';
        ctx.fillText('Sin landmarks para este frame', 16, 24);
        return;
    }

    // Color de hueso: por fase (si overlay activo) o por defecto
    const faseColor = _getBoneColorForFase(frame?.frame_idx ?? landmarksViewerState.currentFrame);
    const defaultBoneColor = 'rgba(89, 255, 199, 0.82)';

    ctx.lineWidth = 2;
    ctx.strokeStyle = faseColor || defaultBoneColor;
    POSE_CONNECTIONS_33.forEach(([a, b]) => {
        const pa = lms[a];
        const pb = lms[b];
        if (!pa || !pb) {
            return;
        }
        if (!Number.isFinite(pa.x) || !Number.isFinite(pa.y) || !Number.isFinite(pb.x) || !Number.isFinite(pb.y)) {
            return;
        }
        ctx.beginPath();
        ctx.moveTo(pa.x * w, pa.y * h);
        ctx.lineTo(pb.x * w, pb.y * h);
        ctx.stroke();
    });

    lms.forEach((p) => {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            return;
        }
        const vis = p.visibility == null ? 1 : Math.max(0, Math.min(1, p.visibility));
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 160, 110, ${0.3 + (0.7 * vis)})`;
        ctx.fill();
    });

    // Overlay: ángulos
    if (landmarksViewerState.overlays.angulos) {
        const rodIzq = _anguloEntreLandmarks(lms, 23, 25, 27);
        const rodDer = _anguloEntreLandmarks(lms, 24, 26, 28);
        const cadIzq = _anguloEntreLandmarks(lms, 11, 23, 25);
        const cadDer = _anguloEntreLandmarks(lms, 12, 24, 26);
        if (rodIzq != null) _dibujarArcoAngulo2D(ctx, lms, w, h, 23, 25, 27, rodIzq);
        if (rodDer != null) _dibujarArcoAngulo2D(ctx, lms, w, h, 24, 26, 28, rodDer);
        if (cadIzq != null) _dibujarArcoAngulo2D(ctx, lms, w, h, 11, 23, 25, cadIzq);
        if (cadDer != null) _dibujarArcoAngulo2D(ctx, lms, w, h, 12, 24, 26, cadDer);
    }

    // Overlay: trayectoria centro de masa
    if (landmarksViewerState.overlays.trayectoria) {
        _dibujarTrayectoriaCM2D(ctx, landmarksViewerState.frames, w, h);
        // Indicador del centro de masa actual
        if (lms[23] && lms[24]) {
            const cmx = ((lms[23].x + lms[24].x) / 2) * w;
            const cmy = ((lms[23].y + lms[24].y) / 2) * h;
            ctx.beginPath();
            ctx.arc(cmx, cmy, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
        }
    }
}

async function _cargarThreeDeps() {
    if (!threeDepsPromise) {
        threeDepsPromise = (async () => {
            // Carga escalonada de CDNs para mejorar compatibilidad ESM
            // en navegadores donde OrbitControls no resuelve "three" igual.
            const intentos = [
                {
                    threeUrl: 'https://esm.sh/three@0.160.0?bundle',
                    controlsUrl: 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js?deps=three@0.160.0'
                },
                {
                    threeUrl: 'https://unpkg.com/three@0.160.0/build/three.module.js',
                    controlsUrl: 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js?module'
                },
                {
                    threeUrl: 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm',
                    controlsUrl: 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm'
                }
            ];

            let ultimoError = null;
            for (const intento of intentos) {
                try {
                    const [threeMod, controlsMod] = await Promise.all([
                        import(intento.threeUrl),
                        import(intento.controlsUrl)
                    ]);
                    return {
                        THREE: threeMod,
                        OrbitControls: controlsMod.OrbitControls
                    };
                } catch (error) {
                    ultimoError = error;
                }
            }

            throw new Error(ultimoError?.message || 'No se pudieron cargar las dependencias 3D.');
        })();
    }
    return threeDepsPromise;
}

function _disposeThreeViewer() {
    // Limpieza completa de recursos WebGL/eventos para evitar fugas
    // al cambiar modo, recargar datos o reintentar visualizacion.
    const inst = landmarksViewerState.three;
    if (!inst) {
        return;
    }
    if (inst.rafId) {
        cancelAnimationFrame(inst.rafId);
    }
    if (inst.resizeObserver) {
        inst.resizeObserver.disconnect();
    }
    if (inst.onWindowResize) {
        window.removeEventListener('resize', inst.onWindowResize);
    }
    if (inst.controls && typeof inst.controls.dispose === 'function') {
        inst.controls.dispose();
    }
    if (inst.renderer) {
        inst.renderer.dispose();
        const el = inst.renderer.domElement;
        if (el && el.parentNode) {
            el.parentNode.removeChild(el);
        }
    }
    landmarksViewerState.three = null;
}

async function _ensureThreeViewer() {
    // Inicializa una unica escena 3D reutilizable para el panel actual.
    const { view3d } = _landmarksUI();
    if (!view3d) {
        return null;
    }
    if (landmarksViewerState.three?.container === view3d) {
        return landmarksViewerState.three;
    }

    _disposeThreeViewer();
    const { THREE, OrbitControls } = await _cargarThreeDeps();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 20);
    camera.position.set(0, 0.1, 2.4);

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
        throw new Error('WebGL no disponible en este dispositivo/navegador.');
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(1.8, 2.5, 2.1);
    scene.add(key);

    const jointMat = new THREE.MeshStandardMaterial({ color: 0xff9f6e, roughness: 0.5 });
    const joints = Array.from({ length: 33 }, () => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), jointMat.clone());
        mesh.visible = false;
        scene.add(mesh);
        return mesh;
    });

    const bones = POSE_CONNECTIONS_33.map(([a, b]) => {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(6);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x59ffc7 }));
        line.visible = false;
        scene.add(line);
        return { a, b, line, positions };
    });

    function resize() {
        const w = Math.max(1, view3d.clientWidth);
        const h = Math.max(1, view3d.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    let resizeObserver = null;
    let onWindowResize = null;
    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => resize());
        resizeObserver.observe(view3d);
    } else {
        onWindowResize = () => resize();
        window.addEventListener('resize', onWindowResize);
    }

    view3d.textContent = '';
    view3d.appendChild(renderer.domElement);
    resize();

    const inst = {
        container: view3d,
        THREE,
        scene,
        camera,
        renderer,
        controls,
        joints,
        bones,
        resizeObserver,
        onWindowResize,
        rafId: 0
    };

    const tick = () => {
        inst.controls.update();
        inst.renderer.render(inst.scene, inst.camera);
        inst.rafId = requestAnimationFrame(tick);
    };
    tick();

    landmarksViewerState.three = inst;
    return inst;
}

function _renderFrame3D(frame) {
    const inst = landmarksViewerState.three;
    if (!inst) {
        return;
    }
    const lms = Array.isArray(frame?.landmarks) ? frame.landmarks : [];

    const points = lms.map((p) => {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
            return null;
        }
        return {
            x: (p.x - 0.5) * 2,
            y: (0.5 - p.y) * 2,
            z: -(p.z || 0) * 2
        };
    });

    // Color por fase (si overlay activo)
    const faseColor3D = _getBoneColorForFase(frame?.frame_idx ?? landmarksViewerState.currentFrame);

    inst.joints.forEach((mesh, idx) => {
        const p = points[idx];
        mesh.visible = Boolean(p);
        if (p) {
            mesh.position.set(p.x, p.y, p.z);
        }
        if (faseColor3D && mesh.material) {
            mesh.material.color.set(faseColor3D);
        } else if (mesh.material) {
            mesh.material.color.set(0xff9933);
        }
    });

    inst.bones.forEach((b) => {
        const pa = points[b.a];
        const pb = points[b.b];
        if (!pa || !pb) {
            b.line.visible = false;
            return;
        }
        b.positions[0] = pa.x;
        b.positions[1] = pa.y;
        b.positions[2] = pa.z;
        b.positions[3] = pb.x;
        b.positions[4] = pb.y;
        b.positions[5] = pb.z;
        b.line.geometry.attributes.position.needsUpdate = true;
        b.line.visible = true;
        if (faseColor3D && b.line.material) {
            b.line.material.color.set(faseColor3D);
        } else if (b.line.material) {
            b.line.material.color.set(0x59ffc7);
        }
    });
}

function _actualizarFrameLandmarks(frameIndex) {
    const { slider, frameEtiqueta, tiempoEtiqueta } = _landmarksUI();
    const total = landmarksViewerState.frames.length;
    if (!total) {
        return;
    }

    const idx = Math.max(0, Math.min(total - 1, Number(frameIndex) || 0));
    landmarksViewerState.currentFrame = idx;
    if (slider) {
        slider.value = String(idx);
    }

    const frame = landmarksViewerState.frames[idx];
    if (frameEtiqueta) {
        frameEtiqueta.textContent = `Frame ${idx + 1} / ${total}`;
    }
    if (tiempoEtiqueta) {
        tiempoEtiqueta.textContent = `${Number(frame?.timestamp_s || 0).toFixed(3)} s`;
    }

    _dibujarFrame2D(frame);
    _renderFrame3D(frame);

    // Métricas sincronizadas y overlays
    _actualizarMetricas(frame);

    // Ghost de comparación
    if (landmarksViewerState.compareFrames) {
        const ghostFrame = _mapCompareFrame(idx);
        if (ghostFrame) {
            if (landmarksViewerState.mode === '2d') _dibujarFrameGhost2D(ghostFrame);
            else _renderFrameGhost3D(ghostFrame);
        }
    }
}

async function _cambiarModoLandmarks(mode) {
    const { canvas2d, view3d, btn2d, btn3d } = _landmarksUI();
    landmarksViewerState.mode = mode === '3d' ? '3d' : '2d';

    if (btn2d) {
        btn2d.classList.toggle('active', landmarksViewerState.mode === '2d');
    }
    if (btn3d) {
        btn3d.classList.toggle('active', landmarksViewerState.mode === '3d');
    }
    if (canvas2d) {
        canvas2d.style.display = landmarksViewerState.mode === '2d' ? 'block' : 'none';
    }
    if (view3d) {
        view3d.style.display = landmarksViewerState.mode === '3d' ? 'block' : 'none';
    }

    if (landmarksViewerState.mode === '3d') {
        await _ensureThreeViewer();
    }
    _actualizarFrameLandmarks(landmarksViewerState.currentFrame);
}

function _bindLandmarksControls() {
    const { slider, btn2d, btn3d } = _landmarksUI();
    if (slider && !slider.dataset.bound) {
        slider.addEventListener('input', (ev) => {
            _stopAnimation();
            _actualizarFrameLandmarks(Number(ev.target.value));
        });
        slider.dataset.bound = '1';
    }
    if (btn2d && !btn2d.dataset.bound) {
        btn2d.addEventListener('click', () => {
            _cambiarModoLandmarks('2d').catch(() => {
                _setLandmarksEstado('No se pudo activar la vista 2D.');
            });
        });
        btn2d.dataset.bound = '1';
    }
    if (btn3d && !btn3d.dataset.bound) {
        btn3d.addEventListener('click', () => {
            _cambiarModoLandmarks('3d').catch((error) => {
                _setLandmarksEstado(`No se pudo activar la vista 3D: ${error.message}. Se mantiene la vista 2D.`);
                _cambiarModoLandmarks('2d').catch(() => {});
            });
        });
        btn3d.dataset.bound = '1';
    }

    // ── Paso 4 — Controles de animación ──
    const { btnPlay, btnSpeed } = _landmarksUI();
    if (btnPlay && !btnPlay.dataset.bound) {
        btnPlay.addEventListener('click', () => {
            if (landmarksViewerState.playing) {
                _stopAnimation();
            } else {
                _startAnimation();
            }
        });
        btnPlay.dataset.bound = '1';
    }
    if (btnSpeed && !btnSpeed.dataset.bound) {
        btnSpeed.addEventListener('click', () => {
            const speeds = [0.25, 0.5, 1];
            const cur = landmarksViewerState.speed;
            const nextIdx = (speeds.indexOf(cur) + 1) % speeds.length;
            landmarksViewerState.speed = speeds[nextIdx];
            btnSpeed.textContent = `×${speeds[nextIdx]}`;
            if (landmarksViewerState.playing) {
                _stopAnimation();
                _startAnimation();
            }
        });
        btnSpeed.dataset.bound = '1';
    }

    // ── Paso 5 — Toggle overlays ──
    const { chkAngulos, chkTrayectoria, chkFases } = _landmarksUI();
    const overlayHandler = (key) => (ev) => {
        landmarksViewerState.overlays[key] = ev.target.checked;
        _actualizarOverlays();
        _actualizarFrameLandmarks(landmarksViewerState.currentFrame);
    };
    if (chkAngulos && !chkAngulos.dataset.bound) {
        chkAngulos.addEventListener('change', overlayHandler('angulos'));
        chkAngulos.dataset.bound = '1';
    }
    if (chkTrayectoria && !chkTrayectoria.dataset.bound) {
        chkTrayectoria.addEventListener('change', overlayHandler('trayectoria'));
        chkTrayectoria.dataset.bound = '1';
    }
    if (chkFases && !chkFases.dataset.bound) {
        chkFases.addEventListener('change', overlayHandler('fases'));
        chkFases.dataset.bound = '1';
    }

    // ── Paso 6 — Selector de comparación ──
    const { selectComparar } = _landmarksUI();
    if (selectComparar && !selectComparar.dataset.bound) {
        selectComparar.addEventListener('change', async (ev) => {
            const idComp = Number(ev.target.value);
            if (!idComp) {
                landmarksViewerState.compareFrames = null;
                landmarksViewerState.compareIdSalto = null;
                _removeCompareGhost();
                _actualizarFrameLandmarks(landmarksViewerState.currentFrame);
                return;
            }
            try {
                let frames = landmarksCache.get(idComp);
                if (!frames) {
                    const resp = await fetch(`${getBackendBaseUrl()}/api/salto/${idComp}/landmarks`);
                    const payload = await resp.json().catch(() => ({}));
                    if (!resp.ok) throw new Error(payload.error || `HTTP ${resp.status}`);
                    frames = _normalizarFramesLandmarks(payload.frames || []);
                    landmarksCache.set(idComp, frames);
                }
                landmarksViewerState.compareFrames = frames;
                landmarksViewerState.compareIdSalto = idComp;
                _actualizarFrameLandmarks(landmarksViewerState.currentFrame);
            } catch (err) {
                _setLandmarksEstado(`No se pudo cargar el salto de comparación: ${err.message}`);
            }
        });
        selectComparar.dataset.bound = '1';
    }
}

// ═══════════════════════════════════════════════════════════════════
// Paso 4 — Animación (play / pause / velocidad)
// ═══════════════════════════════════════════════════════════════════

function _startAnimation() {
    const total = landmarksViewerState.frames.length;
    if (total < 2) return;

    landmarksViewerState.playing = true;
    const { btnPlay } = _landmarksUI();
    if (btnPlay) btnPlay.textContent = '⏸';

    // Calcular intervalo entre frames basándose en timestamps reales
    const f0 = landmarksViewerState.frames[0];
    const fN = landmarksViewerState.frames[total - 1];
    const duracionTotal = (fN.timestamp_s || 0) - (f0.timestamp_s || 0);
    const intervaloBase = duracionTotal > 0 ? (duracionTotal / total) * 1000 : 33;
    const intervalo = Math.max(8, intervaloBase / landmarksViewerState.speed);

    landmarksViewerState.animTimerId = setInterval(() => {
        let next = landmarksViewerState.currentFrame + 1;
        if (next >= total) next = 0;
        _actualizarFrameLandmarks(next);
    }, intervalo);
}

function _stopAnimation() {
    landmarksViewerState.playing = false;
    if (landmarksViewerState.animTimerId) {
        clearInterval(landmarksViewerState.animTimerId);
        landmarksViewerState.animTimerId = null;
    }
    const { btnPlay } = _landmarksUI();
    if (btnPlay) btnPlay.textContent = '▶';
}

/** Devuelve la fase del salto a la que pertenece un frame_idx concreto. */
function _getFaseParaFrame(frameIdx) {
    const datos = landmarksViewerState.datos;
    if (!datos?.fases_salto || !Array.isArray(datos.fases_salto)) return null;
    for (const fase of datos.fases_salto) {
        if (frameIdx >= fase.frame_inicio && frameIdx <= fase.frame_fin) {
            return fase;
        }
    }
    return null;
}

const _FASE_COLORES = {
    preparatoria: '#5b8fff',
    impulsion: '#ffe44d',
    vuelo: '#59ffc7',
    recepcion: '#ff6e6e'
};

const _FASE_NOMBRES = {
    preparatoria: 'Preparación',
    impulsion: 'Impulsión',
    vuelo: 'Vuelo',
    recepcion: 'Recepción'
};

// ═══════════════════════════════════════════════════════════════════
// Paso 5 — Overlays biomecánicos
// ═══════════════════════════════════════════════════════════════════

/** Calcula el ángulo entre tres landmarks (en grados). */
function _anguloEntreLandmarks(lms, idxA, idxB, idxC) {
    const a = lms[idxA], b = lms[idxB], c = lms[idxC];
    if (!a || !b || !c) return null;
    const ba = { x: a.x - b.x, y: a.y - b.y };
    const bc = { x: c.x - b.x, y: c.y - b.y };
    const dot = ba.x * bc.x + ba.y * bc.y;
    const magA = Math.sqrt(ba.x * ba.x + ba.y * ba.y);
    const magC = Math.sqrt(bc.x * bc.x + bc.y * bc.y);
    if (magA < 1e-6 || magC < 1e-6) return null;
    const cosTheta = Math.max(-1, Math.min(1, dot / (magA * magC)));
    return Math.round(Math.acos(cosTheta) * (180 / Math.PI));
}

/** Dibuja un arco de ángulo sobre el canvas 2D. */
function _dibujarArcoAngulo2D(ctx, lms, w, h, idxA, idxB, idxC, label) {
    const a = lms[idxA], b = lms[idxB], c = lms[idxC];
    if (!a || !b || !c) return;
    const bx = b.x * w, by = b.y * h;
    const angA = Math.atan2((a.y * h) - by, (a.x * w) - bx);
    const angC = Math.atan2((c.y * h) - by, (c.x * w) - bx);
    const radio = 22;
    ctx.beginPath();
    ctx.arc(bx, by, radio, Math.min(angA, angC), Math.max(angA, angC));
    ctx.strokeStyle = '#ffe44d';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const midAng = (angA + angC) / 2;
    const tx = bx + Math.cos(midAng) * (radio + 12);
    const ty = by + Math.sin(midAng) * (radio + 12);
    ctx.fillStyle = '#ffe44d';
    ctx.font = '11px Segoe UI';
    ctx.fillText(`${label}°`, tx, ty);
}

/** Dibuja la trayectoria del centro de masa (promedio caderas) en 2D. */
function _dibujarTrayectoriaCM2D(ctx, frames, w, h) {
    if (!frames || frames.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.2;
    let started = false;
    for (const frame of frames) {
        const lms = frame?.landmarks;
        if (!lms || !lms[23] || !lms[24]) continue;
        const cx = ((lms[23].x + lms[24].x) / 2) * w;
        const cy = ((lms[23].y + lms[24].y) / 2) * h;
        if (!started) { ctx.moveTo(cx, cy); started = true; }
        else { ctx.lineTo(cx, cy); }
    }
    ctx.stroke();
}

/** Aplica color del esqueleto según la fase actual del salto. */
function _getBoneColorForFase(frameIdx) {
    if (!landmarksViewerState.overlays.fases) return null;
    const fase = _getFaseParaFrame(frameIdx);
    if (!fase) return null;
    return _FASE_COLORES[fase.fase] || null;
}

/** Actualiza el panel de métricas sincronizado al frame actual. */
function _actualizarMetricas(frame) {
    const { metricasPanel, metRodilla, metCadera, metFase, faseActual } = _landmarksUI();
    const datos = landmarksViewerState.datos;
    const lms = frame?.landmarks;

    // Mostrar u ocultar panel según overlays activos
    const anyOverlay = landmarksViewerState.overlays.angulos || landmarksViewerState.overlays.trayectoria || landmarksViewerState.overlays.fases;
    if (metricasPanel) metricasPanel.style.display = anyOverlay ? 'grid' : 'none';

    // Ángulos en tiempo real del frame actual
    if (metRodilla && lms) {
        // Rodilla: cadera(23/24) → rodilla(25/26) → tobillo(27/28)
        const rodillaIzq = _anguloEntreLandmarks(lms, 23, 25, 27);
        const rodillaDer = _anguloEntreLandmarks(lms, 24, 26, 28);
        if (rodillaIzq != null && rodillaDer != null) {
            metRodilla.textContent = `${Math.round((rodillaIzq + rodillaDer) / 2)}°`;
        } else {
            metRodilla.textContent = '—';
        }
    }
    if (metCadera && lms) {
        // Cadera: hombro(11/12) → cadera(23/24) → rodilla(25/26)
        const caderaIzq = _anguloEntreLandmarks(lms, 11, 23, 25);
        const caderaDer = _anguloEntreLandmarks(lms, 12, 24, 26);
        if (caderaIzq != null && caderaDer != null) {
            metCadera.textContent = `${Math.round((caderaIzq + caderaDer) / 2)}°`;
        } else {
            metCadera.textContent = '—';
        }
    }

    // Fase actual
    const frameIdx = frame?.frame_idx ?? landmarksViewerState.currentFrame;
    const fase = _getFaseParaFrame(frameIdx);
    const nombreFase = fase ? (_FASE_NOMBRES[fase.fase] || fase.fase) : '—';
    const colorFase = fase ? (_FASE_COLORES[fase.fase] || '#eee') : '#eee';
    if (metFase) { metFase.textContent = nombreFase; metFase.style.color = colorFase; }
    if (faseActual) { faseActual.textContent = nombreFase; faseActual.style.color = colorFase; }
}

/** Actualiza la visibilidad de controles de overlay. */
function _actualizarOverlays() {
    const { metricasPanel } = _landmarksUI();
    const anyActive = landmarksViewerState.overlays.angulos || landmarksViewerState.overlays.trayectoria || landmarksViewerState.overlays.fases;
    if (metricasPanel) metricasPanel.style.display = anyActive ? 'grid' : 'none';
}

// ═══════════════════════════════════════════════════════════════════
// Paso 6 — Comparación de saltos
// ═══════════════════════════════════════════════════════════════════

/** Dibuja el esqueleto de un segundo salto (ghost) en canvas 2D. */
function _dibujarFrameGhost2D(frame) {
    const { canvas2d } = _landmarksUI();
    if (!canvas2d) return;
    const ctx = canvas2d.getContext('2d');
    const w = canvas2d.width, h = canvas2d.height;
    const lms = Array.isArray(frame?.landmarks) ? frame.landmarks : [];
    if (lms.length === 0) return;

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 140, 255, 0.7)';
    POSE_CONNECTIONS_33.forEach(([a, b]) => {
        const pa = lms[a], pb = lms[b];
        if (!pa || !pb) return;
        if (!Number.isFinite(pa.x) || !Number.isFinite(pb.x)) return;
        ctx.beginPath();
        ctx.moveTo(pa.x * w, pa.y * h);
        ctx.lineTo(pb.x * w, pb.y * h);
        ctx.stroke();
    });
    lms.forEach((p) => {
        if (!p || !Number.isFinite(p.x)) return;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 140, 255, 0.6)';
        ctx.fill();
    });
    ctx.restore();
}

/** Renderiza el esqueleto ghost en la escena 3D. */
function _renderFrameGhost3D(frame) {
    const inst = landmarksViewerState.three;
    if (!inst) return;
    const lms = Array.isArray(frame?.landmarks) ? frame.landmarks : [];

    // Crear geometría ghost si no existe
    if (!inst.ghostJoints) {
        const mat = new inst.THREE.MeshStandardMaterial({ color: 0xff8cff, roughness: 0.5, transparent: true, opacity: 0.4 });
        inst.ghostJoints = Array.from({ length: 33 }, () => {
            const mesh = new inst.THREE.Mesh(new inst.THREE.SphereGeometry(0.02, 8, 8), mat.clone());
            mesh.visible = false;
            inst.scene.add(mesh);
            return mesh;
        });
        inst.ghostBones = POSE_CONNECTIONS_33.map(([a, b]) => {
            const geometry = new inst.THREE.BufferGeometry();
            const positions = new Float32Array(6);
            geometry.setAttribute('position', new inst.THREE.BufferAttribute(positions, 3));
            const line = new inst.THREE.Line(geometry, new inst.THREE.LineBasicMaterial({ color: 0xff8cff, transparent: true, opacity: 0.4 }));
            line.visible = false;
            inst.scene.add(line);
            return { a, b, line, positions };
        });
    }

    const points = lms.map((p) => {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null;
        return { x: (p.x - 0.5) * 2, y: (0.5 - p.y) * 2, z: -(p.z || 0) * 2 };
    });

    inst.ghostJoints.forEach((mesh, idx) => {
        const p = points[idx];
        mesh.visible = Boolean(p);
        if (p) mesh.position.set(p.x, p.y, p.z);
    });
    inst.ghostBones.forEach((b) => {
        const pa = points[b.a], pb = points[b.b];
        if (!pa || !pb) { b.line.visible = false; return; }
        b.positions[0] = pa.x; b.positions[1] = pa.y; b.positions[2] = pa.z;
        b.positions[3] = pb.x; b.positions[4] = pb.y; b.positions[5] = pb.z;
        b.line.geometry.attributes.position.needsUpdate = true;
        b.line.visible = true;
    });
}

/** Elimina la geometría ghost del 3D. */
function _removeCompareGhost() {
    const inst = landmarksViewerState.three;
    if (!inst) return;
    if (inst.ghostJoints) {
        inst.ghostJoints.forEach(m => { inst.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
        inst.ghostJoints = null;
    }
    if (inst.ghostBones) {
        inst.ghostBones.forEach(b => { inst.scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); });
        inst.ghostBones = null;
    }
}

/** Mapea el frame actual del salto principal al frame correspondiente del salto de comparación, sincronizando por fase (proporcionalmente). */
function _mapCompareFrame(idx) {
    const main = landmarksViewerState.frames;
    const comp = landmarksViewerState.compareFrames;
    if (!comp || comp.length === 0 || main.length === 0) return null;
    // Mapeo proporcional: misma fracción temporal
    const ratio = idx / (main.length - 1);
    const compIdx = Math.round(ratio * (comp.length - 1));
    return comp[Math.max(0, Math.min(comp.length - 1, compIdx))];
}

/** Puebla el selector de comparación con los saltos guardados del usuario actual. */
async function _poblarSelectorComparacion(idSaltoActual) {
    const { compararWrap, selectComparar } = _landmarksUI();
    if (!compararWrap || !selectComparar) return;

    const idUsuario = document.getElementById('id-usuario-actual')?.value
        || document.getElementById('select-usuario')?.value;
    if (!idUsuario) { compararWrap.style.display = 'none'; return; }

    try {
        const resp = await fetch(`${getBackendBaseUrl()}/api/saltos/usuario/${idUsuario}`);
        if (!resp.ok) { compararWrap.style.display = 'none'; return; }
        const saltos = await resp.json();
        if (!Array.isArray(saltos) || saltos.length < 2) { compararWrap.style.display = 'none'; return; }

        selectComparar.innerHTML = '<option value="">— Ninguno —</option>';
        saltos.forEach(s => {
            const id = s.id_salto || s.id;
            if (id === idSaltoActual) return;
            const fecha = s.fecha_salto ? new Date(s.fecha_salto).toLocaleDateString() : '';
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = `#${id} — ${s.tipo_salto} ${s.distancia_cm || s.distancia || '?'} cm ${fecha}`;
            selectComparar.appendChild(opt);
        });
        compararWrap.style.display = saltos.length > 1 ? 'flex' : 'none';
    } catch {
        compararWrap.style.display = 'none';
    }
}

// ═══════════════════════════════════════════════════════════════════

function _ocultarPanelLandmarks() {
    const { panel } = _landmarksUI();
    if (panel) {
        panel.style.display = 'none';
    }
    _stopAnimation();
    _removeCompareGhost();
    landmarksViewerState.idSalto = null;
    landmarksViewerState.frames = [];
    landmarksViewerState.currentFrame = 0;
    landmarksViewerState.datos = null;
    landmarksViewerState.compareFrames = null;
    landmarksViewerState.compareIdSalto = null;
    _disposeThreeViewer();
}

async function renderPanelLandmarksPorSalto(idSalto) {
    const ui = _landmarksUI();
    if (!ui.panel || !idSalto) {
        _ocultarPanelLandmarks();
        return;
    }

    ui.panel.style.display = 'block';
    if (ui.controls) {
        ui.controls.style.display = 'none';
    }
    if (ui.canvas2d) {
        ui.canvas2d.style.display = 'none';
    }
    if (ui.view3d) {
        ui.view3d.style.display = 'none';
    }
    _setLandmarksEstado('Cargando landmarks frame a frame...');

    _bindLandmarksControls();

    let frames = landmarksCache.get(idSalto);
    if (!frames) {
        const resp = await fetch(`${getBackendBaseUrl()}/api/salto/${idSalto}/landmarks`);
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            throw new Error(payload.error || `HTTP ${resp.status}`);
        }
        frames = _normalizarFramesLandmarks(payload.frames || []);
        landmarksCache.set(idSalto, frames);
    }

    if (!Array.isArray(frames) || frames.length === 0) {
        _setLandmarksEstado('Este salto no tiene landmarks completos guardados.');
        return;
    }

    landmarksViewerState.idSalto = idSalto;
    landmarksViewerState.frames = frames;
    landmarksViewerState.currentFrame = 0;

    if (ui.slider) {
        ui.slider.min = '0';
        ui.slider.max = String(frames.length - 1);
        ui.slider.value = '0';
    }
    if (ui.controls) {
        ui.controls.style.display = 'grid';
    }

    _setLandmarksEstado('Desliza para inspeccionar la postura frame a frame.');
    await _cambiarModoLandmarks(landmarksViewerState.mode || '2d');
}

async function renderPanelLandmarksResultado(datos) {
    // Prioridad de datos:
    // 1) landmarks inline del resultado actual,
    // 2) endpoint por id_salto,
    // 3) ocultar panel si no hay datos.
    const framesInline = _normalizarFramesLandmarks(datos?.landmarks_frames || []);

    if (Boolean(datos?.datos_parciales) && framesInline.length === 0) {
        _ocultarPanelLandmarks();
        return;
    }

    if (Array.isArray(framesInline) && framesInline.length > 0) {
        const ui = _landmarksUI();
        if (!ui.panel) {
            return;
        }

        ui.panel.style.display = 'block';
        if (ui.controls) {
            ui.controls.style.display = 'grid';
        }

        const idSaltoInline = Number(datos?.id_salto);
        if (Number.isFinite(idSaltoInline) && idSaltoInline > 0) {
            landmarksCache.set(idSaltoInline, framesInline);
            landmarksViewerState.idSalto = idSaltoInline;
        } else {
            landmarksViewerState.idSalto = null;
        }

        landmarksViewerState.frames = framesInline;
        landmarksViewerState.currentFrame = 0;
        landmarksViewerState.datos = datos;

        if (ui.slider) {
            ui.slider.min = '0';
            ui.slider.max = String(framesInline.length - 1);
            ui.slider.value = '0';
        }

        _bindLandmarksControls();
        _setLandmarksEstado('Landmarks cargados desde el analisis actual.');
        await _cambiarModoLandmarks(landmarksViewerState.mode || '2d');

        if (Number.isFinite(idSaltoInline) && idSaltoInline > 0) {
            _poblarSelectorComparacion(idSaltoInline);
        }
        return;
    }

    const idSalto = Number(datos?.id_salto);
    if (!Number.isFinite(idSalto) || idSalto <= 0) {
        _ocultarPanelLandmarks();
        return;
    }
    try {
        await renderPanelLandmarksPorSalto(idSalto);
    } catch (error) {
        const { panel, controls, canvas2d, view3d } = _landmarksUI();
        if (panel) {
            panel.style.display = 'block';
        }
        if (controls) {
            controls.style.display = 'none';
        }
        if (canvas2d) {
            canvas2d.style.display = 'none';
        }
        if (view3d) {
            view3d.style.display = 'none';
        }
        const msg = String(error?.message || 'error desconocido');
        if (msg.includes('404')) {
            _setLandmarksEstado('Este salto no tiene landmarks completos guardados.');
        } else {
            _setLandmarksEstado(`No se pudieron cargar landmarks: ${msg}`);
        }
    }
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
    if (datos.frame_despegue == null || !ultimoArchivoSubido) {
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
    ['panel-aterrizaje', 'panel-resumen-gesto', 'panel-timeline', 'panel-graficas', 'panel-video-anotado', 'panel-landmarks'].forEach((id) => {
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
    _disposeThreeViewer();
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
