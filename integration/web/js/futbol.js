// futbol.js — flujo de grabacion y resultados.

// Inicializa el flujo de grabacion cuando el DOM esta listo.
document.addEventListener('DOMContentLoaded', () => {
    const videoElement = document.getElementById('vista-camara');
    const btnGrabar = document.getElementById('btn-grabar');
    const btnText = document.getElementById('btn-text');
    const indicador = document.getElementById('indicador-ia');
    const inputArchivo = document.getElementById('input-archivo-final');
    const labelVisual = document.getElementById('label-visual');
    const selectorModoGrabacion = document.getElementById('modo-grabacion');

    let mediaRecorder = null;
    let chunks = [];
    let stream = null;
    let grabando = false;
    // Estado del ultimo analisis aceptado (para acciones posteriores).
    let ultimoVideoBlob = null;
    let ultimoResultado = null;
    // Histórico de los últimos 4 tiros de la sesión actual (en memoria).
    const historialTiros = [];
    // Marca cada llamada a procesarVideo; descarta resultados de llamadas obsoletas.
    let analisisSeq = 0;
    let ultimoModoGrabacion = selectorModoGrabacion ? selectorModoGrabacion.value : 'horizontal';
    // Bloqueo de orientación: true cuando la cámara está en retrato.
    let enModoPortrait = false;

    // Muestra/oculta el overlay de orientación y bloquea el botón si la cámara
    // está en retrato. Se llama cada vez que cambian las dimensiones del vídeo.
    function comprobarOrientacion() {
        const alertaEl = document.getElementById('alerta-orientacion');
        const w = videoElement ? videoElement.videoWidth : 0;
        const h = videoElement ? videoElement.videoHeight : 0;
        if (!w || !h) { return; }
        enModoPortrait = h > w;
        if (alertaEl) { alertaEl.style.display = enModoPortrait ? 'flex' : 'none'; }
        if (enModoPortrait && grabando) {
            detenerGrabacion();
        }
        if (btnGrabar) {
            if (enModoPortrait) {
                btnGrabar.disabled = true;
                if (btnText) { btnText.textContent = 'Gira el dispositivo'; }
            } else if (!grabando) {
                btnGrabar.disabled = false;
                if (btnText) { btnText.textContent = 'Iniciar grabacion'; }
            }
        }
    }

    // Muestra un toast informativo temporal.
    function mostrarToast(mensaje, tipo = 'info', duracionMs = 2200) {
        const toast = document.getElementById('toast-aviso');
        if (!toast) {
            return;
        }
        toast.textContent = mensaje;
        toast.classList.remove('info', 'success', 'warn', 'error', 'show');
        toast.classList.add(tipo);
        // Dispara la animacion de entrada del toast.
        requestAnimationFrame(() => toast.classList.add('show'));
        // Oculta el toast tras el tiempo indicado.
        setTimeout(() => toast.classList.remove('show'), duracionMs);
    }

    // Solicita permisos y conecta el stream de la camara.
    async function iniciarCamara() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            mostrarToast('El navegador no soporta camara.', 'error');
            return;
        }

        try {
            stream = await navigator.mediaDevices.getUserMedia(getCameraConstraints());
            videoElement.srcObject = stream;
            // Comprobar orientación cuando el stream tenga dimensiones reales,
            // y de nuevo si el usuario rota el dispositivo durante la sesión.
            videoElement.addEventListener('loadedmetadata', comprobarOrientacion);
            videoElement.addEventListener('resize', comprobarOrientacion);
            if (indicador) {
                indicador.textContent = 'Motor listo';
                indicador.classList.add('ia-lista');
            }
        } catch (_e) {
            mostrarToast('No se pudo acceder a la camara. Verifica permisos y abre la pagina en https/localhost.', 'error');
        }
    }

    // Detiene el stream y libera recursos de video.
    function detenerCamara() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        videoElement.srcObject = null;
    }

    function getRecorderMimeType() {
        if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
            return 'video/webm; codecs=vp9';
        }
        if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8')) {
            return 'video/webm; codecs=vp8';
        }
        return 'video/webm';
    }

    async function normalizarVideoSegunModo(videoBlob) {
        const modo = getModoGrabacion();
        if (!videoBlob || !videoBlob.size || typeof MediaRecorder === 'undefined') {
            return videoBlob;
        }

        const url = URL.createObjectURL(videoBlob);
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.playsInline = true;

        try {
            await new Promise((resolve, reject) => {
                const onLoaded = () => {
                    limpiar();
                    resolve();
                };
                const onError = () => {
                    limpiar();
                    reject(new Error('No se pudo leer el video para normalizar orientacion.'));
                };
                const limpiar = () => {
                    video.removeEventListener('loadedmetadata', onLoaded);
                    video.removeEventListener('error', onError);
                };
                video.addEventListener('loadedmetadata', onLoaded);
                video.addEventListener('error', onError);
            });

            const srcW = Number(video.videoWidth || 0);
            const srcH = Number(video.videoHeight || 0);
            if (!srcW || !srcH) {
                return videoBlob;
            }

            const debeRotar = (modo === 'horizontal' && srcH > srcW) || (modo === 'vertical' && srcW > srcH);
            if (!debeRotar) {
                return videoBlob;
            }

            const canvas = document.createElement('canvas');
            canvas.width = srcH;
            canvas.height = srcW;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return videoBlob;
            }

            const streamCanvas = canvas.captureStream(30);
            const mimeType = getRecorderMimeType();
            const recorder = new MediaRecorder(streamCanvas, { mimeType });
            const chunksNormalizados = [];

            const finGrabacion = new Promise((resolve, reject) => {
                recorder.ondataavailable = (event) => {
                    if (event.data && event.data.size > 0) {
                        chunksNormalizados.push(event.data);
                    }
                };
                recorder.onerror = () => reject(new Error('No se pudo convertir el video al modo seleccionado.'));
                recorder.onstop = () => {
                    const blobNormalizado = chunksNormalizados.length
                        ? new Blob(chunksNormalizados, { type: mimeType })
                        : null;
                    resolve(blobNormalizado);
                };
            });

            const dibujarFrame = () => {
                if (video.paused || video.ended) {
                    return;
                }
                ctx.save();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.translate(canvas.width, 0);
                ctx.rotate(Math.PI / 2);
                ctx.drawImage(video, 0, 0, srcW, srcH);
                ctx.restore();
                requestAnimationFrame(dibujarFrame);
            };

            recorder.start(150);
            video.currentTime = 0;
            video.onplay = () => requestAnimationFrame(dibujarFrame);

            await video.play();
            await new Promise((resolve, reject) => {
                const onEnded = () => {
                    video.removeEventListener('ended', onEnded);
                    video.removeEventListener('error', onError);
                    resolve();
                };
                const onError = () => {
                    video.removeEventListener('ended', onEnded);
                    video.removeEventListener('error', onError);
                    reject(new Error('Error reproduciendo el video para normalizar orientacion.'));
                };
                video.addEventListener('ended', onEnded);
                video.addEventListener('error', onError);
            });

            recorder.stop();
            const blobConvertido = await finGrabacion;
            streamCanvas.getTracks().forEach((track) => track.stop());

            if (blobConvertido && blobConvertido.size > 0) {
                return blobConvertido;
            }
            return videoBlob;
        } catch (_e) {
            return videoBlob;
        } finally {
            video.pause();
            video.removeAttribute('src');
            URL.revokeObjectURL(url);
        }
    }

    // Arranca la grabacion con MediaRecorder.
    function getUsuarioActivo() {
        // Usar helper compartido (window.UsuarioActivo) si está disponible
        if (typeof window !== 'undefined' && window.UsuarioActivo) {
            const u = window.UsuarioActivo.obtener();
            const idUsuario = Number(u && u.idUsuario);
            return Number.isFinite(idUsuario) && idUsuario > 0 ? { idUsuario } : null;
        }
        // Fallback: lectura directa (compatibilidad)
        const rawIdUsuario = sessionStorage.getItem('idUser');
        if (!rawIdUsuario) {
            return null;
        }

        let idUsuario = Number(rawIdUsuario);
        if (!Number.isFinite(idUsuario)) {
            try {
                const parsed = JSON.parse(rawIdUsuario);
                if (parsed) {
                    idUsuario = Number(parsed.id_usuario || parsed.idUser || parsed.id || parsed);
                }
            } catch (_e) {
                return null;
            }
        }

        if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
            return null;
        }

        return { idUsuario };
    }

    const COMPARATIVA_OBJETIVO = 4;

    function getPreferenciaGuardarVideo() {
        const opcion = document.querySelector('input[name="guardar-video-tiempo-real"]:checked');
        return opcion ? opcion.value : 'no';
    }

    function getModoAnalisis() {
        const selector = document.getElementById('modo-analisis');
        return selector ? selector.value : 'individual';
    }

    function getModoGrabacion() {
        return selectorModoGrabacion ? selectorModoGrabacion.value : 'horizontal';
    }

    function aplicarModoGrabacionUI() {
        const body = document.body;
        if (!body) {
            return;
        }
        const modo = getModoGrabacion();
        body.classList.remove('capture-vertical', 'capture-horizontal');
        body.classList.add(modo === 'horizontal' ? 'capture-horizontal' : 'capture-vertical');
    }

    function getCameraConstraints() {
        const modo = getModoGrabacion();
        const esHorizontal = modo === 'horizontal';
        return {
            video: {
                facingMode: 'environment',
                width: { ideal: esHorizontal ? 1280 : 720 },
                height: { ideal: esHorizontal ? 720 : 1280 }
            },
            audio: false
        };
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
        const intentoActual = Math.min(historialTiros.length + 1, COMPARATIVA_OBJETIVO);
        badge.textContent = `Tiro ${intentoActual}/${COMPARATIVA_OBJETIVO}`;
    }

    function resetComparativaSesion() {
        historialTiros.length = 0;
        actualizarComparativaSesion();
        actualizarBadgeComparativa();
    }

    async function iniciarGrabacion() {
        if (enModoPortrait) {
            mostrarToast('Gira el dispositivo a horizontal antes de grabar.', 'warn');
            return;
        }
        if (typeof MediaRecorder === 'undefined') {
            mostrarToast('La grabacion no esta soportada en este navegador.', 'error');
            return;
        }
        if (!stream) {
            await iniciarCamara();
        }
        if (!stream) {
            return;
        }

        chunks = [];
        const mimeType = getRecorderMimeType();
        mediaRecorder = new MediaRecorder(stream, { mimeType });
        // Acumula los fragmentos de video grabados.
        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                chunks.push(event.data);
            }
        };
        // Procesa el video una vez finaliza la grabacion.
        mediaRecorder.onstop = async () => {
            const videoBlob = new Blob(chunks, { type: 'video/webm' });
            await procesarVideo(videoBlob, 'ia_vivo');
        };
        mediaRecorder.start();
        grabando = true;
        btnGrabar.classList.add('recording');
        btnText.textContent = 'Grabando...';
    }

    // Detiene la grabacion y actualiza la UI.
    function detenerGrabacion() {
        if (mediaRecorder && grabando) {
            mediaRecorder.stop();
        }
        grabando = false;
        btnGrabar.classList.remove('recording');
        btnText.textContent = 'Iniciar grabacion';
    }

    // Envia el video al backend y muestra los resultados.
    async function procesarVideo(videoBlob, metodoOrigen = 'video_galeria') {
        const seq = ++analisisSeq;
        // Limpia preview anterior antes de iniciar uno nuevo.
        if (window.futbolLandmarksPreview && typeof window.futbolLandmarksPreview.reset === 'function') {
            window.futbolLandmarksPreview.reset();
        }
        mostrarToast('Procesando video...', 'info');
        try {
            const usuario = getUsuarioActivo();
            const guardarVideo = getPreferenciaGuardarVideo() === 'si';
            const guardarBd = Boolean(usuario);
            const modoGrabacion = getModoGrabacion();
            const videoNormalizado = await normalizarVideoSegunModo(videoBlob);

            if (!usuario && guardarVideo) {
                mostrarToast('Selecciona un usuario para guardar el video.', 'warn');
            }

            const resultado = await analizarGolpeo(videoNormalizado, {
                idUsuario: usuario ? usuario.idUsuario : null,
                guardarBd: guardarBd,
                guardarVideoBd: guardarVideo && guardarBd,
                metodoOrigen: metodoOrigen,
                modoGrabacion: modoGrabacion
            });

            // Si llegó otro analisis mientras esperabamos, descartamos este.
            if (seq !== analisisSeq) {
                return;
            }
            ultimoVideoBlob = videoNormalizado;
            pintarResultados(resultado, videoNormalizado);
            // Vista local con landmarks para reproducir el video analizado en el navegador.
            if (window.futbolLandmarksPreview && typeof window.futbolLandmarksPreview.setVideoBlob === 'function') {
                window.futbolLandmarksPreview.setVideoBlob(videoNormalizado);
            }
            // Pasar frames con landmarks al visor 3D.
            if (window.futbolLandmarksPreview && typeof window.futbolLandmarksPreview.set3DFrames === 'function') {
                window.futbolLandmarksPreview.set3DFrames(
                    Array.isArray(resultado.landmarks_frames) ? resultado.landmarks_frames : [],
                    resultado.frame_impacto ?? null
                );
            }
            mostrarToast('Analisis completado', 'success');
        } catch (error) {
            if (seq === analisisSeq) {
                mostrarToast(error.message || 'Error al procesar el video.', 'error');
            }
        }
    }

    // Vuelca las metricas calculadas en el panel.
    function pintarResultados(data, videoBlob) {
        setValor('data-pierna-apoyo', data.pierna_apoyo || '--');
        setValor('data-pierna-golpeo', data.pierna_golpeo || '--');
        setValor('data-angulo-cadera', formatearGrados(data.angulo_cadera_deg));
        setValor('data-angulo-rodilla', formatearGrados(data.angulo_rodilla_deg));
        setValor('data-angulo-tobillo', formatearGrados(data.angulo_tobillo_deg));
        setValor('data-estabilidad', formatearNumero(data.estabilidad_tronco));
        setValor('data-confianza', formatearNumero(data.confianza));
        setValor('data-velocidad-pie', formatearNumero(data.velocidad_pie_ms));
        setValor('data-frame-impacto', data.frame_impacto != null ? String(data.frame_impacto) : '--');
        setValor('data-asimetria', formatearNumero(data.asimetria_postura_pct));
        // Apoyo: dict con score, validar estructura
        setValor('data-apoyo-score', data.apoyo && 
            typeof data.apoyo === 'object' && 
            data.apoyo.score != null &&
            !Number.isNaN(Number(data.apoyo.score))
            ? formatearNumero(data.apoyo.score)
            : '--');
        setValor('data-score-compuesto', formatearScore(data.score_compuesto));
        setValor('data-clasificacion', data.clasificacion || '--');

        pintarFases(data.fases);
        pintarAlertas(data.alertas, data.observaciones);
        pintarCurvas(data.curvas);
        pintarVelocidades(data.velocidades_articulares, data.curvas && data.curvas.timestamps_s);
        prepararAcciones(data, videoBlob);
        registrarTiroSesion(data);

        // Analítica del jugador (solo si hay usuario activo)
        const usuario = getUsuarioActivo();
        if (usuario) {
            cargarAnaliticaUsuario(usuario.idUsuario).catch(() => {});
        }
    }

    function pintarFases(fases) {
        const panel = document.getElementById('panel-fases');
        const lista = document.getElementById('lista-fases');
        if (!panel || !lista) return;
        if (!Array.isArray(fases) || fases.length === 0) {
            panel.style.display = 'none';
            return;
        }
        lista.innerHTML = '';
        for (const f of fases) {
            const li = document.createElement('li');
            li.textContent = `${f.fase}: frame ${f.frame_inicio} → ${f.frame_fin}`;
            lista.appendChild(li);
        }
        panel.style.display = 'block';
    }

    function pintarAlertas(alertas, observaciones) {
        const panel = document.getElementById('panel-alertas');
        const listaA = document.getElementById('lista-alertas');
        const listaO = document.getElementById('lista-observaciones');
        if (!panel || !listaA || !listaO) return;

        listaA.innerHTML = '';
        listaO.innerHTML = '';

        const alertasArr = Array.isArray(alertas) ? alertas : [];
        const observArr = Array.isArray(observaciones) ? observaciones : [];

        for (const a of alertasArr) {
            const li = document.createElement('li');
            li.className = `alerta-item alerta-${a.severidad || 'media'}`;
            li.textContent = `[${a.severidad || 'media'}] ${a.mensaje}`;
            listaA.appendChild(li);
        }
        for (const o of observArr) {
            const li = document.createElement('li');
            li.textContent = o;
            listaO.appendChild(li);
        }
        panel.style.display = (alertasArr.length || observArr.length) ? 'block' : 'none';
    }

    let chartCurvas = null;
    function pintarCurvas(curvas) {
        const panel = document.getElementById('panel-curvas');
        const canvas = document.getElementById('grafico-curvas');
        if (!panel || !canvas || typeof Chart === 'undefined') return;
        if (!curvas || !curvas.timestamps_s || curvas.timestamps_s.length === 0) {
            panel.style.display = 'none';
            return;
        }
        if (chartCurvas) { chartCurvas.destroy(); chartCurvas = null; }
        chartCurvas = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: curvas.timestamps_s,
                datasets: [
                    { label: 'Cadera (°)', data: curvas.cadera_deg, borderColor: '#4CAF50', tension: 0.2, spanGaps: true },
                    { label: 'Rodilla (°)', data: curvas.rodilla_deg, borderColor: '#2196F3', tension: 0.2, spanGaps: true },
                    { label: 'Tobillo (°)', data: curvas.tobillo_deg, borderColor: '#FF9800', tension: 0.2, spanGaps: true },
                ]
            },
            options: {
                responsive: true,
                animation: false,
                scales: {
                    x: { title: { display: true, text: 'tiempo (s)' } },
                    y: { title: { display: true, text: 'ángulo (°)' } }
                }
            }
        });
        panel.style.display = 'block';
    }

    let chartVelocidades = null;
    function pintarVelocidades(vel, timestamps) {
        const panel = document.getElementById('panel-velocidades');
        const canvas = document.getElementById('grafico-velocidades');
        if (!panel || !canvas || typeof Chart === 'undefined' || !vel || !timestamps) return;

        if (chartVelocidades) { chartVelocidades.destroy(); chartVelocidades = null; }
        chartVelocidades = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [
                    { label: 'Vel. cadera', data: vel.vel_cadera_deg_s, borderColor: '#4CAF50', tension: 0.2, spanGaps: true },
                    { label: 'Vel. rodilla', data: vel.vel_rodilla_deg_s, borderColor: '#2196F3', tension: 0.2, spanGaps: true },
                    { label: 'Vel. tobillo', data: vel.vel_tobillo_deg_s, borderColor: '#FF9800', tension: 0.2, spanGaps: true },
                ]
            },
            options: {
                responsive: true,
                animation: false,
                scales: {
                    x: { title: { display: true, text: 'tiempo (s)' } },
                    y: { title: { display: true, text: '°/s' } }
                }
            }
        });
        panel.style.display = 'block';
    }

    function prepararAcciones(data, videoBlob) {
        const panel = document.getElementById('panel-acciones');
        const btn = document.getElementById('btn-video-anotado');
        if (!panel || !btn) return;
        ultimoResultado = data;
        if (!videoBlob) {
            panel.style.display = 'none';
            return;
        }
        panel.style.display = 'block';
        btn.disabled = false;
    }

    async function generarYMostrarVideoAnotado() {
        if (!ultimoVideoBlob || !ultimoResultado) {
            mostrarToast('Primero analiza un vídeo.', 'warn');
            return;
        }
        const btn = document.getElementById('btn-video-anotado');
        const player = document.getElementById('video-anotado-player');
        if (btn) { btn.disabled = true; btn.textContent = 'Generando...'; }
        try {
            const blob = await generarVideoAnotadoFutbol(ultimoVideoBlob, {
                frameImpacto: ultimoResultado.frame_impacto,
                piernaGolpeo: ultimoResultado.pierna_golpeo,
            });
            const url = URL.createObjectURL(blob);
            if (player) {
                player.src = url;
                player.style.display = 'block';
            }
            mostrarToast('Vídeo anotado listo.', 'success');
        } catch (e) {
            mostrarToast(e.message || 'Error generando vídeo anotado.', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Generar vídeo anotado'; }
        }
    }

    let chartTendencia = null;
    async function cargarAnaliticaUsuario(idUsuario) {
        const panel = document.getElementById('panel-analitica');
        if (!panel) return;
        try {
            let [fatiga, tendencia, comparativa] = await Promise.all([
                obtenerFatigaUsuarioFutbol(idUsuario),
                obtenerTendenciaUsuarioFutbol(idUsuario),
                obtenerComparativaUsuarioFutbol(idUsuario, 4),
            ]);

            // Validar estructura de respuestas
            fatiga = fatiga || {};
            tendencia = tendencia || {};
            comparativa = comparativa || {};

            setValor('data-fatiga', fatiga.fatiga_significativa
                ? `Sí (-${formatearNumero(fatiga.caida_porcentual)}%)`
                : (fatiga.numero_golpeos ? 'No' : '--'));
            setValor('data-tendencia', tendencia && tendencia.estado ? tendencia.estado : '--');

            // Gráfico tendencia: validar que historial es array
            const canvas = document.getElementById('grafico-tendencia');
            // Destruir chart anterior antes de crear uno nuevo (evita memory leak)
            if (chartTendencia) { 
                chartTendencia.destroy(); 
                chartTendencia = null; 
            }
            if (canvas && typeof Chart !== 'undefined' && tendencia && Array.isArray(tendencia.historial) && tendencia.historial.length) {
                chartTendencia = new Chart(canvas.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: (tendencia.historial || []).map((p) => p ? (p.fecha || '').slice(0, 10) : ''),
                        datasets: [
                            { label: `Valor (${tendencia.unidad || ''})`, data: (tendencia.historial || []).map((p) => p ? p.valor : null), borderColor: '#2196F3', tension: 0.2 },
                            { label: 'Tendencia', data: (tendencia.historial || []).map((p) => p ? p.tendencia_valor : null), borderColor: '#FF5722', borderDash: [5, 5], tension: 0 },
                        ]
                    },
                    options: { responsive: true, animation: false }
                });
            }

            // Tabla comparativa: validar que golpeos es array
            const tbody = document.getElementById('tbody-comparativa');
            if (tbody) {
                tbody.innerHTML = '';
                const items = (comparativa && Array.isArray(comparativa.golpeos) ? comparativa.golpeos : []);
                items.forEach((g, i) => {
                    if (!g) return;
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${i + 1}</td>
                        <td>${(g.fecha || '').slice(0, 16).replace('T', ' ')}</td>
                        <td>${formatearNumero(g.velocidad_pie_ms)}</td>
                        <td>${formatearGrados(g.angulo_cadera_deg)}</td>
                        <td>${formatearGrados(g.angulo_rodilla_deg)}</td>
                        <td>${formatearGrados(g.angulo_tobillo_deg)}</td>
                        <td>${formatearNumero(g.estabilidad_tronco)}</td>
                        <td>${g.clasificacion || '--'}</td>`;
                    tbody.appendChild(tr);
                });
            }

            panel.style.display = 'block';
        } catch (_e) {
            panel.style.display = 'none';
        }
    }

    // Registra el tiro en el historial de sesión (máx. 4) y actualiza la tabla.
    function registrarTiroSesion(data) {
        const modo = getModoAnalisis();
        if (modo !== 'comparativa') {
            historialTiros.length = 0;
            actualizarComparativaSesion();
            actualizarBadgeComparativa();
            return;
        }

        historialTiros.push({
            score_compuesto: data.score_compuesto,
            velocidad_pie_ms: data.velocidad_pie_ms,
            estabilidad_tronco: data.estabilidad_tronco,
            angulo_cadera_deg: data.angulo_cadera_deg,
            angulo_rodilla_deg: data.angulo_rodilla_deg,
            angulo_tobillo_deg: data.angulo_tobillo_deg,
            clasificacion: data.clasificacion,
        });
        if (historialTiros.length > COMPARATIVA_OBJETIVO) {
            historialTiros.shift();
        }
        actualizarComparativaSesion();
        actualizarBadgeComparativa();
        if (historialTiros.length === COMPARATIVA_OBJETIVO) {
            mostrarToast('Comparativa de 4 tiros completada.', 'success', 2600);
        }
    }

    // Pinta la tabla de comparativa de la sesión.
    function actualizarComparativaSesion() {
        const panel = document.getElementById('panel-comparativa-sesion');
        const tbody = document.getElementById('tbody-comparativa-sesion');
        if (!panel || !tbody) return;

        if (getModoAnalisis() !== 'comparativa') {
            panel.style.display = 'none';
            tbody.innerHTML = '';
            return;
        }

        tbody.innerHTML = '';
        historialTiros.forEach((t, i) => {
            const tr = document.createElement('tr');
            const esMejor = t.score_compuesto != null &&
                historialTiros.every((o, j) => j === i || o.score_compuesto == null || t.score_compuesto >= o.score_compuesto);
            if (esMejor && historialTiros.length > 1) tr.className = 'fila-mejor';
            tr.innerHTML = `
                <td>${i + 1}</td>
                <td>${formatearScore(t.score_compuesto)}</td>
                <td>${formatearNumero(t.velocidad_pie_ms)}</td>
                <td>${formatearNumero(t.estabilidad_tronco)}</td>
                <td>${formatearGrados(t.angulo_cadera_deg)}</td>
                <td>${formatearGrados(t.angulo_rodilla_deg)}</td>
                <td>${formatearGrados(t.angulo_tobillo_deg)}</td>
                <td>${t.clasificacion || '--'}</td>`;
            tbody.appendChild(tr);
        });

        panel.style.display = historialTiros.length > 0 ? 'block' : 'none';
    }

    // Escribe un valor en el elemento indicado.
    function setValor(id, valor) {
        const nodo = document.getElementById(id);
        if (nodo) {
            nodo.textContent = valor;
        }
    }

    // Helpers robustos de formateo — delegated to shared/formatters.js
    // formatearNumero, formatearGrados, formatearScore are provided by shared formatter

    if (btnGrabar) {
        // Alterna entre iniciar y detener la grabacion.
        btnGrabar.addEventListener('click', async () => {
            if (!grabando) {
                await iniciarGrabacion();
            } else {
                detenerGrabacion();
            }
        });
    }

    if (inputArchivo) {
        // Envia un video de la galeria para analizar.
        inputArchivo.addEventListener('change', async (evento) => {
            const archivo = evento.target.files[0];
            if (!archivo) {
                return;
            }
            if (labelVisual) {
                labelVisual.textContent = 'Enviando al servidor...';
                labelVisual.classList.add('uploading');
            }
            try {
                await procesarVideo(archivo, 'video_galeria');
            } finally {
                if (labelVisual) {
                    labelVisual.textContent = 'Subir video de la galeria';
                    labelVisual.classList.remove('uploading');
                }
                inputArchivo.value = '';
            }
        });
    }

    if (selectorModoGrabacion) {
        selectorModoGrabacion.addEventListener('change', async () => {
            const nuevoModo = getModoGrabacion();
            if (grabando) {
                selectorModoGrabacion.value = ultimoModoGrabacion;
                mostrarToast('Deten la grabacion antes de cambiar el modo.', 'warn');
                return;
            }

            ultimoModoGrabacion = nuevoModo;
            aplicarModoGrabacionUI();
            detenerCamara();
            await iniciarCamara();
        });
    }

    aplicarModoGrabacionUI();
    iniciarCamara();

    // Botón de vídeo anotado
    const btnVideoAnotado = document.getElementById('btn-video-anotado');
    if (btnVideoAnotado) {
        btnVideoAnotado.addEventListener('click', generarYMostrarVideoAnotado);
    }

    // Panel analítico — carga al seleccionar usuario
    // Crear handler nombrado para evitar duplicados al navegar
    async function actualizarAnaliticaActiva({ mostrarErrores = false } = {}) {
        const usuario = getUsuarioActivo();
        if (!usuario) {
            // Si no hay usuario, limpiar panel analitica y salir
            try {
                const panel = document.getElementById('panel-analitica');
                if (panel) panel.style.display = 'none';
            } catch (_e) {}
            return;
        }
        try {
            await cargarAnaliticaUsuario(usuario.idUsuario);
        } catch (err) {
            if (mostrarErrores && typeof mostrarToast === 'function') {
                mostrarToast(err.message || 'Error cargando analítica', 'error');
            }
        }
    }

    const handleUsuarioChange = () => {
        resetComparativaSesion();
        actualizarAnaliticaActiva().catch(() => {});
    };
    // Remover listener anterior si existe (evita duplicados)
    document.removeEventListener('usuarioSeleccionCambio', handleUsuarioChange);
    document.addEventListener('usuarioSeleccionCambio', handleUsuarioChange);

    // Panel analítico — botón manual de actualizar
    const btnActAnalitica = document.getElementById('btn-actualizar-analitica');
    if (btnActAnalitica) {
        btnActAnalitica.addEventListener('click', () => {
            actualizarAnaliticaActiva({ mostrarErrores: true }).catch(() => {});
        });
    }

    // Cleanup: remover listeners y destruir charts al abandonar página
    window.addEventListener('beforeunload', () => {
        document.removeEventListener('usuarioSeleccionCambio', handleUsuarioChange);
        if (chartTendencia) {
            chartTendencia.destroy();
            chartTendencia = null;
        }
    });

    document.getElementById('modo-analisis')?.addEventListener('change', () => {
        resetComparativaSesion();
    });

    // Panel analítico — cambio de métrica
    const selectMetrica = document.getElementById('metrica-analitica');
    if (selectMetrica) {
        selectMetrica.addEventListener('change', () => {
            actualizarAnaliticaActiva().catch(() => {});
        });
    }

    actualizarBadgeComparativa();

    // Asegura que la camara se libere al salir.
    window.addEventListener('beforeunload', () => {
        detenerCamara();
    });
});
