// Esperar a que el documento esté completamente cargado
document.addEventListener('DOMContentLoaded', () => {
    
    // Seleccionar todos los elementos que tienen la clase 'hidden'
    const hiddenElements = document.querySelectorAll('.hidden');

    // Configurar el observador
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            // Si el elemento entra en la pantalla del usuario
            if (entry.isIntersecting) {
                // Añadir la clase 'show' para iniciar la animación CSS
                entry.target.classList.add('show');
                
                // (Opcional) Dejar de observar una vez que ya apareció
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1 // Activar cuando el 10% del elemento sea visible
    });

    // Indicar al observador que vigile cada tarjeta
    hiddenElements.forEach((el) => observer.observe(el));
});