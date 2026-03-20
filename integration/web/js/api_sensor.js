/**
 * api_sensor.js — Polling al backend del sensor de distancia (puerto 5000).
 *
 * Pide GET /distancia cada segundo mientras esté activo y actualiza la UI.
 */

const SENSOR_PORT = 5000;
const POLL_INTERVAL_MS = 1000;

const elValor = document.getElementById("distancia-valor");
const elTimestamp = document.getElementById("timestamp-lectura");
const elEstadoTexto = document.getElementById("estado-texto");
const elEstadoBadge = document.getElementById("estado-conexion");
const btnConexion = document.getElementById("btn-conexion");

let polling = false;
let timerId = null;

function sensorUrl() {
    return `http://${window.location.hostname}:${SENSOR_PORT}/distancia`;
}

function setConectado(conectado) {
    elEstadoBadge.classList.toggle("conectado", conectado);
    elEstadoBadge.classList.toggle("desconectado", !conectado);
    elEstadoTexto.textContent = conectado ? "Conectado" : "Desconectado";
}

function formatTimestamp(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function leerSensor() {
    try {
        const resp = await fetch(sensorUrl());
        const data = await resp.json();

        if (data.error) {
            elValor.textContent = "-- cm";
            elTimestamp.textContent = data.error;
            setConectado(false);
            return;
        }

        elValor.textContent = `${data.valor} ${data.unidad}`;
        elTimestamp.textContent = `Última lectura: ${formatTimestamp(data.timestamp)}`;
        setConectado(true);
    } catch {
        elValor.textContent = "-- cm";
        elTimestamp.textContent = "Sin conexión con el backend";
        setConectado(false);
    }
}

function iniciarPolling() {
    if (polling) return;
    polling = true;
    btnConexion.textContent = "Detener";
    btnConexion.classList.add("activo");
    leerSensor();
    timerId = setInterval(leerSensor, POLL_INTERVAL_MS);
}

function detenerPolling() {
    polling = false;
    clearInterval(timerId);
    timerId = null;
    btnConexion.textContent = "Conectar sensor";
    btnConexion.classList.remove("activo");
    setConectado(false);
}

btnConexion.addEventListener("click", () => {
    polling ? detenerPolling() : iniciarPolling();
});
