"""
Genera un certificado SSL autofirmado para desarrollo local.

Permite servir la app por HTTPS y que el navegador del móvil
autorice el acceso a la cámara (getUserMedia requiere HTTPS).

Uso:
    python scripts/generate_cert.py

Genera:
    certs/cert.pem   — certificado público
    certs/key.pem    — clave privada
"""

import os
import sys
import socket
import datetime
import ipaddress

from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def get_local_ip():
    """Detecta la IP local de la máquina en la LAN."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def generate_cert(cert_dir):
    os.makedirs(cert_dir, exist_ok=True)
    cert_path = os.path.join(cert_dir, "cert.pem")
    key_path = os.path.join(cert_dir, "key.pem")

    local_ip = get_local_ip()

    # Generar clave RSA 2048 bits
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    # Nombre del certificado
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "ES"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "JumpTracker Dev"),
        x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
    ])

    # Subject Alternative Names (localhost + IP local)
    san = x509.SubjectAlternativeName([
        x509.DNSName("localhost"),
        x509.IPAddress(ipaddress.IPv4Address(local_ip)),
        x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
    ])

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.utcnow())
        .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=365))
        .add_extension(san, critical=False)
        .sign(key, hashes.SHA256())
    )

    # Guardar clave privada
    with open(key_path, "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))

    # Guardar certificado
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    print(f"Certificado SSL generado:")
    print(f"  cert: {cert_path}")
    print(f"  key:  {key_path}")
    print(f"  IP LAN: {local_ip}")
    print(f"  Válido hasta: {(datetime.datetime.utcnow() + datetime.timedelta(days=365)).strftime('%Y-%m-%d')}")


if __name__ == "__main__":
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cert_dir = os.path.join(project_root, "certs")
    generate_cert(cert_dir)
