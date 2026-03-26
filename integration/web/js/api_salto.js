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

let mediaRecorder = null;
let chunksGrabacion = [];
let stopRecorderResolver = null;
let toastTimer = null;

const SALTOS_OBJETIVO_COMPARATIVA = 4;
let medidasComparativa = [];

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

function mostrarComparativa(alias, tipoSalto, medidas) {
    const panelResultados = document.getElementById('panel-resultados');
    const resumen = document.getElementById('comparativa-resumen');
    const gridTecnico = document.querySelector('.technical-data-grid');
    const distanciaTitulo = document.getElementById('distancia-resultado');
    const subtitulo = document.getElementById('tipo-resultado');

    if (!resumen || !panelResultados || !gridTecnico || !distanciaTitulo || !subtitulo) {
        return;
    }

    const media = medidas.reduce((acc, n) => acc + n, 0) / medidas.length;
    const medidasHtml = medidas
        .map((m, i) => `<li>${i + 1}. ${m.toFixed(2)} cm</li>`)
        .join('');

    distanciaTitulo.textContent = `${media.toFixed(2)} cm`;
    subtitulo.textContent = 'Comparativa completada';

    resumen.innerHTML = `
        <p><span class="comparativa-alias">${alias}</span> ha obtenido las siguientes medidas en salto <span class="comparativa-tipo">${normalizarTextoTipo(tipoSalto)}</span>:</p>
        <ul>${medidasHtml}</ul>
        <p>La media de los saltos es <span class="comparativa-media">${media.toFixed(2)} cm</span>.</p>
    `;
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
    if (getPreferenciaGuardarVideoTiempoReal() !== 'si') {
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

    mediaRecorder.start(200);
}

function detenerGrabacionYObtenerBlob() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        stopRecorderResolver = resolve;
        mediaRecorder.stop();
    });
}

async function guardarResultadoEnBackend(datosLocales, guardarVideo, videoBlob) {
    const usuario = getUsuarioActivo();
    if (!usuario) {
        throw new Error('No hay usuario activo. Selecciona o crea un usuario.');
    }

    if (guardarVideo) {
        if (!videoBlob) {
            throw new Error('No se pudo capturar el vídeo en tiempo real.');
        }

        const formData = new FormData();
        formData.append('video', videoBlob, 'salto_tiempo_real.webm');
        formData.append('tipo_salto', modoSalto);
        formData.append('altura_real_m', String(usuario.altura));
        formData.append('id_usuario', String(usuario.idUsuario));
        formData.append('metodo_origen', 'ia_vivo');
        formData.append('guardar_video_bd', 'true');

        const respuesta = await fetch(`${getBackendBaseUrl()}/api/salto/calcular`, {
            method: 'POST',
            body: formData
        });

        const payload = await respuesta.json();
        if (!respuesta.ok) {
            throw new Error(payload.error || `Error HTTP: ${respuesta.status}`);
        }

        return payload;
    }

    const respuesta = await fetch(`${getBackendBaseUrl()}/api/saltos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id_usuario: usuario.idUsuario,
            tipo_salto: modoSalto,
            distancia_cm: Math.round(datosLocales.distancia),
            tiempo_vuelo_s: Number(datosLocales.tiempo_vuelo_s),
            confianza_ia: datosLocales.confianza,
            metodo_origen: 'ia_vivo'
        })
    });

    const payload = await respuesta.json();
    if (!respuesta.ok) {
        throw new Error(payload.error || `Error HTTP: ${respuesta.status}`);
    }

    return {
        ...datosLocales,
        id_salto: payload.id_salto
    };
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
        frame_aterrizaje: 'Directo'
    };

    const guardarVideo = getPreferenciaGuardarVideoTiempoReal() === 'si';
    const videoBlob = guardarVideo ? await detenerGrabacionYObtenerBlob() : null;

    document.dispatchEvent(new Event('detenerDeteccion'));
    document.dispatchEvent(new Event('restaurarBotonCamara'));

    const respuestaPersistida = await guardarResultadoEnBackend(datosLocales, guardarVideo, videoBlob);
    procesarResultadoSegunModo(respuestaPersistida);

    finalizandoSalto = false;
}

function procesarResultadoSegunModo(datos) {
    const modo = getModoAnalisis();
    if (modo !== 'comparativa') {
        animarResultados(datos);
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
        return;
    }

    const alias = sessionStorage.getItem('aliasUser') || 'Usuario';
    const tipo = (datos.tipo_salto || document.getElementById('tipo-salto')?.value || 'vertical').toString().toLowerCase();
    mostrarComparativa(alias, tipo, medidasComparativa);
    resetComparativa();
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

    document.getElementById('distancia-resultado').textContent = `${datos.distancia} ${datos.unidad || 'cm'}`;
    document.getElementById('tipo-resultado').textContent = `Salto ${normalizarTextoTipo(datos.tipo_salto)}`;

    const porcentaje = Math.round((datos.confianza || 0) * 100);
    document.getElementById('data-confianza').textContent = `${porcentaje}%`;
    document.getElementById('data-tiempo').textContent = datos.tiempo_vuelo_s ? `${datos.tiempo_vuelo_s}s` : '--';
    document.getElementById('data-despegue').textContent = datos.frame_despegue || '--';
    document.getElementById('data-aterrizaje').textContent = datos.frame_aterrizaje || '--';

    panelResultados.classList.add('show');
}

document.getElementById('btn-reintentar').addEventListener('click', () => {
    document.getElementById('panel-resultados').classList.remove('show');
});

document.getElementById('modo-analisis')?.addEventListener('change', () => {
    resetComparativa();
});

document.getElementById('tipo-salto')?.addEventListener('change', () => {
    if (getModoAnalisis() === 'comparativa') {
        resetComparativa();
    }
});

actualizarBadgeComparativa();
