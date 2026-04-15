"""
HTTPS static server for integration/web.

Purpose:
- Serve frontend over HTTPS for mobile camera usage.
- Bind 0.0.0.0 so LAN devices can connect by IP.

Usage:
    python scripts/https_server.py
"""

from __future__ import annotations

import os
import socket
import ssl
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(PROJECT_ROOT, "integration", "web")
CERT_FILE = os.path.join(PROJECT_ROOT, "certs", "cert.pem")
KEY_FILE = os.path.join(PROJECT_ROOT, "certs", "key.pem")
PORT = int(os.getenv("WEB_HTTPS_PORT", "8443"))


class FrontendHandler(SimpleHTTPRequestHandler):
    # Ensure modern MIME types for PWA assets.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".wasm": "application/wasm",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, fmt: str, *args):
        # Keep logs concise during development.
        super().log_message(fmt, *args)


def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"


def main() -> None:
    if not os.path.isdir(WEB_DIR):
        print(f"[ERROR] Missing frontend directory: {WEB_DIR}")
        sys.exit(1)

    if not (os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE)):
        print("[ERROR] Missing SSL certificate files.")
        print(f"        Expected: {CERT_FILE}")
        print(f"                  {KEY_FILE}")
        print("        Generate them with: python scripts/generate_cert.py")
        sys.exit(1)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)

    server = HTTPServer(("0.0.0.0", PORT), FrontendHandler)
    server.socket = context.wrap_socket(server.socket, server_side=True)

    lan_ip = get_lan_ip()
    print("Frontend HTTPS active:")
    print(f"  Local: https://localhost:{PORT}")
    print(f"  LAN:   https://{lan_ip}:{PORT}")
    print("On mobile, open the LAN URL and accept the local certificate warning.")
    print("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped HTTPS server.")


if __name__ == "__main__":
    main()
