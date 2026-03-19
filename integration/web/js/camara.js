document.addEventListener('DOMContentLoaded', () => {
    const videoElement = document.getElementById('vista-camara');
    const btnGrabar = document.getElementById('btn-grabar');
    const btnText = document.getElementById('btn-text');
    
    // Elementos del botón de subida
    //const inputArchivo = document.getElementById('input-archivo');
    const btnUploadText = document.querySelector('.upload-btn');
    
    let mediaRecorder;
    let fragmentosVideo = [];
    let estaGrabando = false;

    // --- 1. LÓGICA DE LA CÁMARA ---
    async function iniciarCamara() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });
            
            videoElement.srcObject = stream;
            prepararGrabacion(stream);
            
        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            alert('Es necesario dar permisos de cámara para medir el salto. Si estás en red local, usa HTTPS o configura las flags de Chrome.');
        }
    }

    function prepararGrabacion(stream) {
        const opciones = { mimeType: 'video/webm;codecs=vp8' };
        
        try {
            mediaRecorder = new MediaRecorder(stream, opciones);
        } catch (e) {
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/mp4' });
        }

        mediaRecorder.ondataavailable = (evento) => {
            if (evento.data.size > 0) {
                fragmentosVideo.push(evento.data);
            }
        };

        mediaRecorder.onstop = () => {
            const blobVideo = new Blob(fragmentosVideo, { type: mediaRecorder.mimeType });
            fragmentosVideo = []; 
            
            const eventoVideoListo = new CustomEvent('videoListo', { detail: blobVideo });
            document.dispatchEvent(eventoVideoListo);
        };
    }

    // --- 2. CONTROL DEL BOTÓN DE GRABAR ---
    btnGrabar.addEventListener('click', () => {
        if (!mediaRecorder) {
            alert('La cámara no está lista. Revisa los permisos.');
            return;
        }

        if (!estaGrabando) {
            mediaRecorder.start();
            estaGrabando = true;
            btnGrabar.classList.add('recording');
            btnText.textContent = 'Detener';
        } else {
            mediaRecorder.stop();
            estaGrabando = false;
            btnGrabar.classList.remove('recording');
            btnText.textContent = 'Procesando...';
            btnGrabar.disabled = true;
        }
    });

    // --- 3. LÓGICA DEL BOTÓN DE SUBIR ARCHIVO ---
// --- 3. LÓGICA DE SUBIDA DE ARCHIVO (OPACIDAD CERO) ---
    const inputTecnico = document.getElementById('input-archivo-final');
    const labelVisual = document.getElementById('label-visual');

    if (inputTecnico) {
        // Escuchar directamente cuando el usuario selecciona el archivo
        inputTecnico.addEventListener('change', (evento) => {
            const archivo = evento.target.files[0];
            
            if (archivo) {
                // Cambiar el texto del div estético que está debajo
                const textoOriginal = labelVisual.textContent;
                labelVisual.textContent = 'Enviando...';
                labelVisual.style.background = 'rgba(255, 255, 255, 0.3)';
                
                // Disparar el evento para que api_salto.js procese el vídeo
                const eventoVideoListo = new CustomEvent('videoListo', { detail: archivo });
                document.dispatchEvent(eventoVideoListo);

                // Restaurar estética
                setTimeout(() => {
                    labelVisual.textContent = textoOriginal;
                    labelVisual.style.background = 'rgba(255, 255, 255, 0.1)';
                    inputTecnico.value = ''; // Reset para futuros archivos
                }, 2000);
            }
        });
    }

    // --- 4. INICIO AUTOMÁTICO ---
    iniciarCamara();
});