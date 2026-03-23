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

// Variables matemáticas globales
let modoSalto = 'vertical';
let estadoSalto = 'suelo';
let tiempoDespegue = 0;
let alturaBaseY = 0;
let framesCalibracion = 0;
let escalaMetrosPorUnidad = 0;
let yPicoVuelo = 1.0; 
let despegueX = 0;

// --- 1. CARGA DEL MOTOR DE IA (CLIENTE) ---
async function crearPoseLandmarker() {
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
                delegate: "GPU" 
            },
            runningMode: "VIDEO",
            numPoses: 1
        });
        
        indicador.textContent = "Motor Listo";
        indicador.classList.add('ia-lista');
        btnGrabar.disabled = false;
        btnGrabar.querySelector('#btn-text').textContent = "Iniciar Detección";

        setTimeout(() => { indicador.style.display = 'none'; }, 3000);
    } catch (error) {
        console.error("Error al cargar MediaPipe:", error);
        indicador.textContent = "Error IA. Usa archivos.";
        indicador.style.background = "red";
    }
}
crearPoseLandmarker();

// --- 2. BUCLE DE DETECCIÓN EN TIEMPO REAL ---
async function renderLoop() {
    if (!analisisActivo) return;

    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;

    let startTimeMs = performance.now();
    
    if (lastVideoTime !== video.currentTime && video.readyState >= 2) {
        lastVideoTime = video.currentTime;
        
        const resultados = poseLandmarker.detectForVideo(video, startTimeMs);
        
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        if (resultados.landmarks && resultados.landmarks.length > 0) {
            const drawingUtils = new DrawingUtils(canvasCtx);
            const puntosCuerpo = resultados.landmarks[0];
            
            drawingUtils.drawConnectors(puntosCuerpo, PoseLandmarker.POSE_CONNECTIONS, { color: "#00FF00", lineWidth: 3 });
            drawingUtils.drawLandmarks(puntosCuerpo, { color: "#FF0000", lineWidth: 1 });
            
            calcularFaseSalto(puntosCuerpo);
        }
        canvasCtx.restore();
    }
    
    if (analisisActivo) {
        window.requestAnimationFrame(renderLoop);
    }
}

// --- 3. ALGORITMO DE VUELO EN VIVO (HÍBRIDO) ---
function calcularFaseSalto(landmarks) {
    const yPieActual = (landmarks[27].y + landmarks[28].y) / 2;
    const xPieActual = (landmarks[27].x + landmarks[28].x) / 2;

    if (framesCalibracion < 30) {
        alturaBaseY += yPieActual;
        framesCalibracion++;
        
        if (framesCalibracion === 30) {
            const alturaRealMetros = parseFloat(document.getElementById('altura-usuario').value);
            const narizY = landmarks[0].y;
            const posicionSueloNormal = alturaBaseY / 30;
            const alturaPersonaNorm = posicionSueloNormal - narizY; 
            
            escalaMetrosPorUnidad = alturaRealMetros / alturaPersonaNorm;
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
    } 
    else if (estadoSalto === 'aire') {
        if (yPieActual < yPicoVuelo) {
            yPicoVuelo = yPieActual;
        }

        if (yPieActual > umbralDespegue) {
            estadoSalto = 'suelo';
            const tiempoAterrizaje = performance.now();
            const aterrizajeX = xPieActual;
            
            const tiempoVueloSegundos = (tiempoAterrizaje - tiempoDespegue) / 1000;
            
            if (tiempoVueloSegundos > 0.15) { 
                finalizarSaltoEnVivo(tiempoVueloSegundos, despegueX, aterrizajeX, posicionSueloNormal, yPicoVuelo);
            }
        }
    }
}

function finalizarSaltoEnVivo(tiempoVuelo, startX, endX, ySuelo, yPico) {
    document.dispatchEvent(new Event('detenerDeteccion')); 
    document.dispatchEvent(new Event('restaurarBotonCamara'));

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
        textoTipo = 'Vertical';
    } else {
        const distanciaUnidades = Math.abs(endX - startX);
        const distanciaMetros = distanciaUnidades * escalaMetrosPorUnidad;
        distanciaFinalCm = Math.round(distanciaMetros * 100);
        textoTipo = 'Horizontal';
    }

    animarResultados({
        distancia: distanciaFinalCm,
        unidad: 'cm',
        tipo_salto: textoTipo,
        confianza: 0.95,
        tiempo_vuelo_s: tiempoVuelo.toFixed(3),
        frame_despegue: 'Directo',
        frame_aterrizaje: 'Directo'
    });
}

// --- 4. GESTIÓN DE EVENTOS DE BOTONES ---
document.addEventListener('iniciarDeteccion', () => {
    const alturaUs = document.getElementById('altura-usuario').value;
    if (!alturaUs || alturaUs <= 0) {
        alert("Introduce la altura antes de empezar la medición.");
        document.dispatchEvent(new Event('restaurarBotonCamara'));
        return;
    }
    
    modoSalto = document.getElementById('tipo-salto').value;
    
    analisisActivo = true;
    estadoSalto = 'suelo';
    framesCalibracion = 0;
    alturaBaseY = 0;
    yPicoVuelo = 1.0; 
    
    renderLoop();
});

document.addEventListener('detenerDeteccion', () => {
    analisisActivo = false;
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
});

// --- 5. LÓGICA DE BACKEND (SOLO PARA SUBIR ARCHIVOS DE LA GALERÍA) ---
document.addEventListener('videoListo', async (evento) => {
    const videoArchivo = evento.detail;
    const tipoSalto = document.getElementById('tipo-salto').value;
    const alturaUsuario = document.getElementById('altura-usuario').value;

    if (!alturaUsuario || alturaUsuario <= 0) {
        alert('Por favor, introduce una altura válida en metros (ej: 1.75).');
        return;
    }

    const formData = new FormData();
    formData.append('video', videoArchivo, 'archivo_subido.webm');
    formData.append('tipo_salto', tipoSalto);
    formData.append('altura_real_m', alturaUsuario);

    try {
        const ipServidor = window.location.hostname;
        const urlBackend = `http://${ipServidor}:5001/api/salto/calcular`;
        
        const respuesta = await fetch(urlBackend, {
            method: 'POST',
            body: formData
        });

        if (!respuesta.ok) throw new Error(`Error HTTP: ${respuesta.status}`);

        const datosGenerados = await respuesta.json();
        animarResultados(datosGenerados);

    } catch (error) {
        console.error('Fallo en la comunicación:', error);
        alert(`Error al conectar con ${window.location.hostname}:5001. Comprueba que app.py está arrancado.`);
    }
});

// --- 6. RENDERIZADO DEL PANEL FINAL ---
function animarResultados(datos) {
    const panelResultados = document.getElementById('panel-resultados');
    
    document.getElementById('distancia-resultado').textContent = `${datos.distancia} ${datos.unidad || 'cm'}`;
    document.getElementById('tipo-resultado').textContent = `Salto ${datos.tipo_salto}`;
    
    const porcentaje = Math.round(datos.confianza * 100);
    document.getElementById('data-confianza').textContent = `${porcentaje}%`;
    document.getElementById('data-tiempo').textContent = datos.tiempo_vuelo_s ? `${datos.tiempo_vuelo_s}s` : '--';
    document.getElementById('data-despegue').textContent = datos.frame_despegue || '--';
    document.getElementById('data-aterrizaje').textContent = datos.frame_aterrizaje || '--';

    panelResultados.classList.add('show');
}

document.getElementById('btn-reintentar').addEventListener('click', () => {
    document.getElementById('panel-resultados').classList.remove('show');
});