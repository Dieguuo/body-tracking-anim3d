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
    const displayDistancia = document.getElementById('distancia-resultado');
    const displayTipo = document.getElementById('tipo-resultado');
    const displayConfianza = document.getElementById('confianza-resultado');

    // Inyectar los valores del JSON en el HTML
    displayDistancia.textContent = `${datos.distancia} ${datos.unidad || 'cm'}`;
    displayTipo.textContent = `Análisis de salto ${datos.tipo_salto} completado.`;
    
    // Convertir el decimal (ej. 0.98) a porcentaje (98%)
    const porcentaje = Math.round(datos.confianza * 100);
    displayConfianza.textContent = `Precisión de lectura: ${porcentaje}%`;

    // Activar la animación CSS subiendo el panel desde abajo
    panelResultados.classList.add('show');
    reiniciarBotonGrabar();
}

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