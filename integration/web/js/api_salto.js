document.addEventListener('videoListo', async (evento) => {
    // 1. Recibir el archivo de vídeo grabado desde la memoria
    const videoBlob = evento.detail;
    
    // 2. Leer la configuración del usuario
    const tipoSalto = document.getElementById('tipo-salto').value;
    const alturaUsuario = document.getElementById('altura-usuario').value;

    // Validar que la altura introducida sea correcta
    if (!alturaUsuario || alturaUsuario <= 0) {
        alert('Por favor, introduce una altura válida en metros (ej: 1.75). Es necesaria para la calibración.');
        reiniciarBotonGrabar();
        return;
    }

    // 3. Empaquetar los datos (Formato exacto esperado por Python)
    const formData = new FormData();
    // 'video' es el nombre exacto de la variable que busca el backend
    formData.append('video', videoBlob, 'salto_grabado.webm');
    formData.append('tipo_salto', tipoSalto);
    formData.append('altura_real_m', alturaUsuario);

    try {
        // 4. Detectar la IP de la red automáticamente y enviar petición
        const ipServidor = window.location.hostname;
        const urlBackend = `http://${ipServidor}:5001/api/salto/calcular`;
        
        const respuesta = await fetch(urlBackend, {
            method: 'POST',
            body: formData
        });

        if (!respuesta.ok) {
            throw new Error(`Error HTTP: ${respuesta.status}`);
        }

        // 5. Extraer el JSON y mostrar en pantalla
        const datosGenerados = await respuesta.json();
        animarResultados(datosGenerados);

    } catch (error) {
        console.error('Fallo en la comunicación:', error);
        alert(`Error al conectar con ${window.location.hostname}:5001. Comprueba que app.py está arrancado.`);
        reiniciarBotonGrabar();
    }
});

function animarResultados(datos) {
    const panelResultados = document.getElementById('panel-resultados');
    
    // Inyectar datos principales
    document.getElementById('distancia-resultado').textContent = `${datos.distancia} ${datos.unidad || 'cm'}`;
    document.getElementById('tipo-resultado').textContent = `Salto ${datos.tipo_salto} analizado`;
    
    // Inyectar cuadrícula de datos técnicos
    const porcentaje = Math.round(datos.confianza * 100);
    document.getElementById('data-confianza').textContent = `${porcentaje}%`;
    document.getElementById('data-tiempo').textContent = datos.tiempo_vuelo_s ? `${datos.tiempo_vuelo_s}s` : '--';
    document.getElementById('data-despegue').textContent = datos.frame_despegue || '--';
    document.getElementById('data-aterrizaje').textContent = datos.frame_aterrizaje || '--';

    // Desplegar el panel subiendo desde abajo
    panelResultados.classList.add('show');
    reiniciarBotonGrabar();
}

// Lógica para el NUEVO botón grande de "Nuevo Salto"
document.getElementById('btn-reintentar').addEventListener('click', () => {
    const panelResultados = document.getElementById('panel-resultados');
    // Baja el panel para mostrar la cámara otra vez
    panelResultados.classList.remove('show');
});

function reiniciarBotonGrabar() {
    const btnGrabar = document.getElementById('btn-grabar');
    const btnText = document.getElementById('btn-text');
    
    btnGrabar.disabled = false;
    btnText.textContent = 'Grabar';
}

// Lógica para el botón "Nuevo Salto" (Oculta el panel para volver a empezar)
document.getElementById('btn-reintentar').addEventListener('click', () => {
    const panelResultados = document.getElementById('panel-resultados');
    panelResultados.classList.remove('show');
});