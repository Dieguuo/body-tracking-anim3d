document.addEventListener('DOMContentLoaded', () => {
    const videoElement = document.getElementById('vista-camara');
    const btnGrabar = document.getElementById('btn-grabar');
    const btnText = document.getElementById('btn-text');
    
    // Elementos del botón de subida
    const inputTecnico = document.getElementById('input-archivo-final');
    const labelVisual = document.getElementById('label-visual');
    
    let detectando = false;

    function mostrarGuiaPermisos(error) {
        const host = window.location.hostname;
        const protocolo = window.location.protocol;

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert(
                `Este navegador no permite acceso a camara en esta pagina.\n\n` +
                `Prueba con Chrome actualizado y revisa permisos del sitio.\n` +
                `URL actual: ${protocolo}//${host}`
            );
            return;
        }

        if (error && error.name === 'NotAllowedError') {
            alert(
                'Permiso de camara denegado o bloqueado por el navegador.\n\n' +
                'En Chrome: icono del candado -> Configuracion del sitio -> Camara -> Permitir, luego recarga.'
            );
            return;
        }

        if (error && error.name === 'NotFoundError') {
            alert('No se encontro ninguna camara disponible en el dispositivo.');
            return;
        }

        if (error && error.name === 'NotReadableError') {
            alert('La camara esta siendo usada por otra aplicacion. Cierra otras apps y vuelve a intentarlo.');
            return;
        }

        alert('No se pudo acceder a la camara. Revisa permisos del navegador y vuelve a cargar la pagina.');
    }

    // --- 1. INICIALIZAR CÁMARA ---
    async function iniciarCamara() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                mostrarGuiaPermisos();
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });
            
            videoElement.srcObject = stream;
        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            mostrarGuiaPermisos(error);
        }
    }

    // --- 2. CONTROL DEL BOTÓN DE DETECCIÓN EN VIVO ---
    btnGrabar.addEventListener('click', () => {
        detectando = !detectando;

        if (detectando) {
            btnGrabar.classList.add('recording');
            btnText.textContent = 'Analizando... (Salta)';
            // Avisar a api_salto.js de que empiece a buscar el esqueleto
            document.dispatchEvent(new Event('iniciarDeteccion'));
        } else {
            btnGrabar.classList.remove('recording');
            btnText.textContent = 'Iniciar Detección';
            // Avisar a api_salto.js de que pare
            document.dispatchEvent(new Event('detenerDeteccion'));
        }
    });

    // Restaurar visualmente el botón desde fuera (cuando termina el salto)
    document.addEventListener('restaurarBotonCamara', () => {
        detectando = false;
        btnGrabar.classList.remove('recording');
        btnText.textContent = 'Iniciar Detección';
    });

    // --- 3. LÓGICA DE SUBIDA DE ARCHIVO (AL BACKEND PYTHON) ---
    if (inputTecnico) {
        inputTecnico.addEventListener('change', (evento) => {
            const archivo = evento.target.files[0];
            
            if (archivo) {
                const textoOriginal = labelVisual.textContent;
                labelVisual.textContent = 'Enviando al servidor...';
                labelVisual.style.background = 'rgba(255, 255, 255, 0.3)';
                
                // Disparar evento para que api_salto.js envíe el archivo a Python
                const eventoVideoListo = new CustomEvent('videoListo', { detail: archivo });
                document.dispatchEvent(eventoVideoListo);

                // Restaurar estética
                setTimeout(() => {
                    labelVisual.textContent = textoOriginal;
                    labelVisual.style.background = 'rgba(255, 255, 255, 0.1)';
                    inputTecnico.value = ''; 
                }, 2000);
            }
        });
    }

    iniciarCamara();
});