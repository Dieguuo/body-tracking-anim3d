import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// === Configuracion basica del overlay ===
const LIVE_POSE_COLOR = "#9c5cd4";
const LIVE_POSE_DOT = "#ffffff";
const BALL_COLOR = "#ffb347";
const BALL_STROKE = "#ffffff";
const BALL_ALPHA = 0.9;

const videoLive = document.getElementById("vista-camara");
const canvasLive = document.getElementById("canvas-esqueleto");
const ctxLive = canvasLive ? canvasLive.getContext("2d") : null;

const previewWrap = document.getElementById("preview-landmarks");
const previewVideo = document.getElementById("preview-video");
const previewCanvas = document.getElementById("preview-canvas");
const previewCtx = previewCanvas ? previewCanvas.getContext("2d") : null;

let poseLandmarker = null;
let landmarkerError = null;
let liveLoopActivo = false;
let previewLoopActivo = false;
let lastLiveTime = -1;
let lastPreviewTime = -1;
let previewUrl = null;

// Estado de la heuristica del balon (por flujo).
const ballStateLive = crearEstadoBalon();
const ballStatePreview = crearEstadoBalon();

function crearEstadoBalon() {
    return {
        offscreen: document.createElement("canvas"),
        ctx: null,
        prev: null,
        frameCount: 0,
        ultimaDeteccion: null,
        ancho: 0,
        alto: 0
    };
}

// Inicializa el landmarker de MediaPipe solo una vez.
async function initPoseLandmarker() {
    if (poseLandmarker) {
        return poseLandmarker;
    }
    if (landmarkerError) {
        return null;
    }

    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );

    try {
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numPoses: 1
        });
    } catch (error) {
        landmarkerError = error;
        console.warn("No se pudo iniciar PoseLandmarker en futbol.", error);
        return null;
    }

    return poseLandmarker;
}

// Ajusta el tamano del canvas al frame real del video.
function syncCanvasToVideo(canvas, video) {
    if (!canvas || !video) {
        return false;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
        return false;
    }
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
    return true;
}

// Dibuja el esqueleto y landmarks en el canvas indicado.
function drawPose(ctx, poseLandmarks) {
    if (!ctx || !poseLandmarks) {
        return;
    }
    const drawingUtils = new DrawingUtils(ctx);
    drawingUtils.drawConnectors(poseLandmarks, PoseLandmarker.POSE_CONNECTIONS, {
        color: LIVE_POSE_COLOR,
        lineWidth: 3
    });
    drawingUtils.drawLandmarks(poseLandmarks, {
        color: LIVE_POSE_DOT,
        radius: 2,
        lineWidth: 1
    });
}

// Obtiene un punto de referencia cerca de los pies para guiar la busqueda del balon.
function obtenerCentroPies(landmarks, ancho, alto) {
    if (!Array.isArray(landmarks) || landmarks.length < 33) {
        return null;
    }
    const pies = [landmarks[27], landmarks[28], landmarks[31], landmarks[32]].filter(Boolean);
    if (pies.length === 0) {
        return null;
    }
    let sumX = 0;
    let sumY = 0;
    pies.forEach((p) => {
        sumX += p.x * ancho;
        sumY += p.y * alto;
    });
    return {
        x: sumX / pies.length,
        y: sumY / pies.length
    };
}

// Heuristica simple de deteccion de balon basada en diferencia de frames (movimiento).
// - Usa un canvas reducido para rapidez.
// - Busca la nube de pixeles con mayor movimiento.
// - Ajusta la posicion con suavizado temporal.
function detectarBalon(video, landmarks, estado, salidaAncho, salidaAlto) {
    if (!video || !estado) {
        return null;
    }

    const scaleBase = 160;
    const videoW = video.videoWidth || 0;
    const videoH = video.videoHeight || 0;
    if (!videoW || !videoH) {
        return null;
    }

    const escala = scaleBase / videoW;
    const targetW = Math.max(120, Math.round(videoW * escala));
    const targetH = Math.max(90, Math.round(videoH * escala));

    if (estado.ancho !== targetW || estado.alto !== targetH) {
        estado.offscreen.width = targetW;
        estado.offscreen.height = targetH;
        estado.ancho = targetW;
        estado.alto = targetH;
        estado.ctx = estado.offscreen.getContext("2d", { willReadFrequently: true });
        estado.prev = null;
        estado.ultimaDeteccion = null;
    }

    if (!estado.ctx) {
        return null;
    }

    // Throttle: procesa 1 de cada 2 frames para aligerar.
    estado.frameCount += 1;
    if (estado.frameCount % 2 !== 0) {
        return estado.ultimaDeteccion;
    }

    estado.ctx.drawImage(video, 0, 0, targetW, targetH);
    const curr = estado.ctx.getImageData(0, 0, targetW, targetH);

    if (!estado.prev) {
        estado.prev = curr;
        return null;
    }

    const data = curr.data;
    const prev = estado.prev.data;
    const threshold = 35;
    const minPixels = 50;

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    let minX = targetW;
    let minY = targetH;
    let maxX = 0;
    let maxY = 0;

    for (let i = 0; i < data.length; i += 4) {
        const dr = Math.abs(data[i] - prev[i]);
        const dg = Math.abs(data[i + 1] - prev[i + 1]);
        const db = Math.abs(data[i + 2] - prev[i + 2]);
        const diff = (dr + dg + db) / 3;

        if (diff > threshold) {
            const idx = i / 4;
            const x = idx % targetW;
            const y = Math.floor(idx / targetW);
            sumX += x;
            sumY += y;
            count += 1;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }

    estado.prev = curr;

    if (count < minPixels) {
        return estado.ultimaDeteccion;
    }

    let cx = sumX / count;
    let cy = sumY / count;
    let radio = Math.max(6, Math.sqrt(count / Math.PI));

    const pies = obtenerCentroPies(landmarks, targetW, targetH);
    if (pies) {
        const dist = Math.hypot(cx - pies.x, cy - pies.y);
        const maxDist = Math.max(targetW, targetH) * 0.65;
        if (dist > maxDist) {
            return estado.ultimaDeteccion;
        }
    }

    // Suavizado basico para evitar saltos bruscos.
    if (estado.ultimaDeteccion) {
        const alpha = 0.6;
        cx = (estado.ultimaDeteccion.x * (1 - alpha)) + (cx * alpha);
        cy = (estado.ultimaDeteccion.y * (1 - alpha)) + (cy * alpha);
        radio = (estado.ultimaDeteccion.r * (1 - alpha)) + (radio * alpha);
    }

    estado.ultimaDeteccion = {
        x: (cx / targetW) * salidaAncho,
        y: (cy / targetH) * salidaAlto,
        r: (radio / targetW) * salidaAncho
    };

    return estado.ultimaDeteccion;
}

function drawBall(ctx, balon) {
    if (!ctx || !balon) {
        return;
    }
    ctx.save();
    ctx.globalAlpha = BALL_ALPHA;
    ctx.beginPath();
    ctx.arc(balon.x, balon.y, balon.r, 0, Math.PI * 2);
    ctx.fillStyle = BALL_COLOR;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = BALL_STROKE;
    ctx.stroke();
    ctx.restore();
}

// Loop de render en vivo (camara).
async function renderLiveLoop() {
    if (!liveLoopActivo || !videoLive || !ctxLive) {
        return;
    }

    if (!syncCanvasToVideo(canvasLive, videoLive)) {
        requestAnimationFrame(renderLiveLoop);
        return;
    }

    if (videoLive.readyState >= 2 && lastLiveTime !== videoLive.currentTime) {
        lastLiveTime = videoLive.currentTime;
        const landmarker = await initPoseLandmarker();
        if (!landmarker) {
            requestAnimationFrame(renderLiveLoop);
            return;
        }
        const results = landmarker.detectForVideo(videoLive, performance.now());

        ctxLive.clearRect(0, 0, canvasLive.width, canvasLive.height);
        const pose = results.landmarks && results.landmarks[0];
        if (pose) {
            drawPose(ctxLive, pose);
        }

        const balon = detectarBalon(videoLive, pose, ballStateLive, canvasLive.width, canvasLive.height);
        if (balon) {
            drawBall(ctxLive, balon);
        }
    }

    requestAnimationFrame(renderLiveLoop);
}

// Loop de render para la previsualizacion de video analizado.
async function renderPreviewLoop() {
    if (!previewLoopActivo || !previewVideo || !previewCtx || !previewCanvas) {
        return;
    }

    if (!syncCanvasToVideo(previewCanvas, previewVideo)) {
        requestAnimationFrame(renderPreviewLoop);
        return;
    }

    if (previewVideo.readyState >= 2 && !previewVideo.paused && lastPreviewTime !== previewVideo.currentTime) {
        lastPreviewTime = previewVideo.currentTime;
        const landmarker = await initPoseLandmarker();
        if (!landmarker) {
            requestAnimationFrame(renderPreviewLoop);
            return;
        }
        const results = landmarker.detectForVideo(previewVideo, performance.now());

        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        const pose = results.landmarks && results.landmarks[0];
        if (pose) {
            drawPose(previewCtx, pose);
        }

        const balon = detectarBalon(previewVideo, pose, ballStatePreview, previewCanvas.width, previewCanvas.height);
        if (balon) {
            drawBall(previewCtx, balon);
        }
    }

    requestAnimationFrame(renderPreviewLoop);
}

function iniciarLiveOverlay() {
    if (liveLoopActivo) {
        return;
    }
    liveLoopActivo = true;
    renderLiveLoop();
}

function iniciarPreviewOverlay() {
    if (previewLoopActivo) {
        return;
    }
    previewLoopActivo = true;
    renderPreviewLoop();
}

function mostrarPreview(videoBlob) {
    if (!previewVideo || !previewWrap) {
        return;
    }

    // Si el usuario estaba en vista 3D, volvemos a 2D antes de mostrar el nuevo vídeo.
    mostrar2D();

    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
    }
    previewUrl = URL.createObjectURL(videoBlob);
    previewVideo.src = previewUrl;
    previewVideo.play().catch(() => {
        // El navegador puede bloquear autoplay; el usuario puede dar play manual.
    });
    previewWrap.style.display = "block";
    iniciarPreviewOverlay();
}

// Detiene el loop de preview, limpia el canvas y libera el blob URL.
function resetPreview() {
    previewLoopActivo = false;
    lastPreviewTime = -1;
    ballStatePreview.prev = null;
    ballStatePreview.ultimaDeteccion = null;
    ballStatePreview.frameCount = 0;

    if (previewVideo) {
        try { previewVideo.pause(); } catch (_e) { /* ignore */ }
        previewVideo.removeAttribute("src");
        try { previewVideo.load(); } catch (_e) { /* ignore */ }
    }
    if (previewCtx && previewCanvas) {
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }
    if (previewWrap) {
        previewWrap.style.display = "none";
    }
    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
    }
}

// ── Visor 3D ─────────────────────────────────────────────────────────────────

// Conexiones de los 33 landmarks de MediaPipe Pose (índices estándar).
const POSE_CONNECTIONS_33 = [
    [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],
    [9,10],[11,12],[11,13],[13,15],[15,17],[15,19],[17,19],
    [12,14],[14,16],[16,18],[16,20],[18,20],
    [11,23],[12,24],[23,24],[23,25],[24,26],[25,27],[26,28],
    [27,29],[28,30],[29,31],[30,32],[27,31],[28,32]
];

let threeDepsPromise3D = null;
let three3DInst = null;
// Estado del reproductor 3D.
const state3D = {
    frames: [],
    frameImpacto: null,
    currentIdx: 0,
    playing: false,
    rafId: 0,
    animLoopId: 0,
    speedIdx: 0,
    speeds: [1, 0.5, 0.25],
    speedLabels: ['×1', '×½', '×¼'],
    lastTick: 0
};

async function _cargarThreeDeps3D() {
    if (!threeDepsPromise3D) {
        threeDepsPromise3D = (async () => {
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
            let lastErr = null;
            for (const it of intentos) {
                try {
                    const [tm, cm] = await Promise.all([import(it.threeUrl), import(it.controlsUrl)]);
                    return { THREE: tm, OrbitControls: cm.OrbitControls };
                } catch (e) { lastErr = e; }
            }
            throw new Error(lastErr?.message || 'No se pudo cargar Three.js');
        })();
    }
    return threeDepsPromise3D;
}

function _dispose3D() {
    if (!three3DInst) return;
    cancelAnimationFrame(state3D.rafId);
    cancelAnimationFrame(state3D.animLoopId);
    state3D.playing = false;
    state3D.rafId = 0;
    state3D.animLoopId = 0;
    if (three3DInst.resizeObs) three3DInst.resizeObs.disconnect();
    if (three3DInst.controls) three3DInst.controls.dispose();
    if (three3DInst.renderer) {
        three3DInst.renderer.dispose();
        const el = three3DInst.renderer.domElement;
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    three3DInst = null;
}

async function _init3D() {
    const container = document.getElementById('preview-view-3d');
    if (!container) return;

    _dispose3D();
    const { THREE, OrbitControls } = await _cargarThreeDeps3D();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 20);
    camera.position.set(0, 0.1, 2.4);

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (_e) {
        container.textContent = 'WebGL no disponible en este dispositivo.';
        return;
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
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x59ffc7 }));
        line.visible = false;
        scene.add(line);
        return { a, b, line };
    });

    function resize() {
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    let resizeObs = null;
    if (typeof ResizeObserver !== 'undefined') {
        resizeObs = new ResizeObserver(resize);
        resizeObs.observe(container);
    }

    container.textContent = '';
    container.appendChild(renderer.domElement);
    resize();

    three3DInst = { scene, camera, renderer, controls, joints, bones, resizeObs, THREE };

    const tick = () => {
        controls.update();
        renderer.render(scene, camera);
        state3D.rafId = requestAnimationFrame(tick);
    };
    tick();
}

function _renderFrame3D(frame) {
    if (!three3DInst || !frame) return;
    const lms = Array.isArray(frame.landmarks) ? frame.landmarks : [];

    const pts = lms.map((p) => {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null;
        return { x: (p.x - 0.5) * 2, y: (0.5 - p.y) * 2, z: -(p.z || 0) * 2 };
    });

    three3DInst.joints.forEach((mesh, i) => {
        const p = pts[i];
        mesh.visible = Boolean(p);
        if (p) mesh.position.set(p.x, p.y, p.z);
    });

    three3DInst.bones.forEach((b) => {
        const pa = pts[b.a]; const pb = pts[b.b];
        if (!pa || !pb) { b.line.visible = false; return; }
        const pos = b.line.geometry.attributes.position;
        pos.array[0] = pa.x; pos.array[1] = pa.y; pos.array[2] = pa.z;
        pos.array[3] = pb.x; pos.array[4] = pb.y; pos.array[5] = pb.z;
        pos.needsUpdate = true;
        b.line.visible = true;
    });
}

function _updateSlider() {
    const slider = document.getElementById('slider-3d');
    if (slider) slider.value = state3D.currentIdx;
    // Etiqueta de frame de impacto.
    const lbl = document.getElementById('lbl-frame-impacto');
    if (lbl && state3D.frameImpacto != null) {
        const cur = state3D.frames[state3D.currentIdx];
        const dist = cur ? Math.abs((cur.frame_idx ?? state3D.currentIdx) - state3D.frameImpacto) : null;
        lbl.textContent = dist === 0 ? '⚡ IMPACTO' : (dist != null ? `f${cur.frame_idx ?? state3D.currentIdx}` : '');
    }
}

function _step3D(ts) {
    if (!state3D.playing || !state3D.frames.length) return;
    const fps = 30; // velocidad base de reproducción
    const ms = 1000 / (fps * state3D.speeds[state3D.speedIdx]);
    if (ts - state3D.lastTick >= ms) {
        state3D.lastTick = ts;
        state3D.currentIdx = (state3D.currentIdx + 1) % state3D.frames.length;
        _renderFrame3D(state3D.frames[state3D.currentIdx]);
        _updateSlider();
    }
}

function _iniciarReproductor3D() {
    // Play/pausa
    const btnPlay = document.getElementById('btn-3d-play');
    if (btnPlay) {
        btnPlay.onclick = () => {
            state3D.playing = !state3D.playing;
            btnPlay.textContent = state3D.playing ? '⏸' : '▶';
        };
    }
    // Slider scrubbing
    const slider = document.getElementById('slider-3d');
    if (slider) {
        slider.max = Math.max(0, state3D.frames.length - 1);
        slider.value = 0;
        slider.oninput = () => {
            state3D.currentIdx = Number(slider.value);
            _renderFrame3D(state3D.frames[state3D.currentIdx]);
            _updateSlider();
        };
    }
    // Velocidad
    const btnSpeed = document.getElementById('btn-3d-speed');
    if (btnSpeed) {
        btnSpeed.onclick = () => {
            state3D.speedIdx = (state3D.speedIdx + 1) % state3D.speeds.length;
            btnSpeed.textContent = state3D.speedLabels[state3D.speedIdx];
        };
    }

    // Etiqueta impacto
    const lbl = document.getElementById('lbl-frame-impacto');
    if (lbl && state3D.frameImpacto != null) {
        lbl.textContent = `Impacto: frame ${state3D.frameImpacto}`;
    }

    // Ir al frame de impacto directamente.
    if (state3D.frameImpacto != null && state3D.frames.length) {
        const idx = state3D.frames.findIndex(
            (f) => (f.frame_idx ?? 0) >= state3D.frameImpacto
        );
        state3D.currentIdx = idx >= 0 ? idx : 0;
        if (slider) slider.value = state3D.currentIdx;
    }

    // Loop de animación independiente del render WebGL.
    // Cancelamos cualquier loop anterior antes de iniciar uno nuevo.
    cancelAnimationFrame(state3D.animLoopId);
    state3D.animLoopId = 0;
    function animLoop(ts) {
        _step3D(ts);
        state3D.animLoopId = requestAnimationFrame(animLoop);
    }
    state3D.animLoopId = requestAnimationFrame(animLoop);
}

async function mostrar3D(frames, frameImpacto) {
    const wrap2d = document.getElementById('preview-2d-wrap');
    const wrap3d = document.getElementById('preview-view-3d');
    const ctrl3d = document.getElementById('preview-3d-controls');
    if (!wrap3d) return;

    state3D.frames = frames || [];
    state3D.frameImpacto = frameImpacto ?? null;
    state3D.currentIdx = 0;
    state3D.playing = false;
    state3D.speedIdx = 0;

    if (wrap2d) wrap2d.style.display = 'none';
    wrap3d.style.display = 'block';
    if (ctrl3d) ctrl3d.style.display = 'flex';

    await _init3D();

    if (state3D.frames.length) {
        _renderFrame3D(state3D.frames[0]);
    }

    _iniciarReproductor3D();
}

function mostrar2D() {
    const wrap2d = document.getElementById('preview-2d-wrap');
    const wrap3d = document.getElementById('preview-view-3d');
    const ctrl3d = document.getElementById('preview-3d-controls');
    if (wrap2d) wrap2d.style.display = '';
    if (wrap3d) wrap3d.style.display = 'none';
    if (ctrl3d) ctrl3d.style.display = 'none';
    state3D.playing = false;
    _dispose3D();
}

function _configurarBotones3D() {
    const btn2d = document.getElementById('btn-lm-2d');
    const btn3d = document.getElementById('btn-lm-3d');
    if (!btn2d || !btn3d) return;
    btn2d.addEventListener('click', () => {
        btn2d.classList.add('active');
        btn3d.classList.remove('active');
        mostrar2D();
    });
    btn3d.addEventListener('click', () => {
        btn3d.classList.add('active');
        btn2d.classList.remove('active');
        if (state3D.frames.length) {
            mostrar3D(state3D.frames, state3D.frameImpacto);
        }
    });
}

_configurarBotones3D();

// API publica para futbol.js
window.futbolLandmarksPreview = {
    setVideoBlob: (videoBlob) => {
        if (videoBlob) {
            mostrarPreview(videoBlob);
        }
    },
    set3DFrames: (frames, frameImpacto) => {
        state3D.frames = frames || [];
        state3D.frameImpacto = frameImpacto ?? null;
        // Habilitar el botón 3D solo si hay datos.
        const btn3d = document.getElementById('btn-lm-3d');
        if (btn3d) btn3d.disabled = !state3D.frames.length;
    },
    reset: () => {
        resetPreview();
        mostrar2D();
        state3D.frames = [];
        state3D.frameImpacto = null;
        const btn2d = document.getElementById('btn-lm-2d');
        const btn3d = document.getElementById('btn-lm-3d');
        if (btn2d) { btn2d.classList.add('active'); }
        if (btn3d) { btn3d.classList.remove('active'); btn3d.disabled = false; }
    }
};

// Arranca el overlay en vivo cuando el stream esta disponible.
if (videoLive) {
    videoLive.addEventListener("loadeddata", () => {
        iniciarLiveOverlay();
    });
}
