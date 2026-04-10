"""
Servidor HTTPS para el frontend web (desarrollo local).

Necesario para que getUserMedia (cámara) funcione desde móviles en LAN.
Los navegadores solo permiten acceso a cámara en contextos seguros (HTTPS).

Uso:
    python scripts/https_server.py

Sirve:
    https://0.0.0.0:8443  (frontend web)
"""

import os
import ssl
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CERT_FILE = os.path.join(PROJECT_ROOT, "certs", "cert.pem")
KEY_FILE = os.path.join(PROJECT_ROOT, "certs", "key.pem")
WEB_DIR = os.path.join(PROJECT_ROOT, "integration", "web")
PORT = 8443


class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        # Solo loguear errores, no cada petición
        if args and isinstance(args[0], str) and args[0].startswith("4"):
            super().log_message(format, *args)


def main():
    if not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE):
        print("ERROR: No se encontraron los certificados SSL.")
        print("       Ejecuta primero:  python scripts/generate_cert.py")
        sys.exit(1)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(CERT_FILE, KEY_FILE)

    server = HTTPServer(("0.0.0.0", PORT), QuietHandler)
    server.socket = context.wrap_socket(server.socket, server_side=True)

    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = "localhost"

    print(f"Frontend HTTPS activo:")
    print(f"  Local:  https://localhost:{PORT}")
    print(f"  LAN:    https://{local_ip}:{PORT}")
    print(f"  Móvil:  abre la URL LAN en Chrome y acepta el certificado")
    print()
    print("Ctrl+C para detener")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")


if __name__ == "__main__":
    main()
