/**
 * Frontend — Módulo sensor de distancia
 *
 * Consulta GET http://localhost:5000/distancia cada segundo
 * y actualiza la medición en pantalla en tiempo real.
 *
 * Cómo servir este frontend:
 *   - VS Code: extensión "Live Server" → clic derecho en index.html → Open with Live Server
 *   - Python:  python -m http.server 8080  (desde integration/frontend/)
 *   - Node:    npx serve .
 */

const API_URL = "http://localhost:5000/distancia";

async function actualizarDistancia() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();

    const el = document.getElementById("distancia");
    if (data.valor !== undefined && data.valor !== null) {
      el.textContent = `${data.valor.toFixed(2)} ${data.unidad}`;
    } else {
      el.textContent = data.error ?? "Sin datos";
    }
  } catch {
    document.getElementById("distancia").textContent = "No se pudo conectar con el backend.";
  }
}

setInterval(actualizarDistancia, 1000);
actualizarDistancia();
