"""
Generate local self-signed TLS certificate for frontend/backend HTTPS.

Includes SAN entries for:
- localhost
- 127.0.0.1
- current LAN IPv4 (if detected)

Usage:
    python scripts/generate_cert.py
"""

from __future__ import annotations

import datetime as dt
import ipaddress
import os
import socket
import sys

try:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
except Exception:
    print("[ERROR] Missing dependency 'cryptography'.")
    print("        Install with: pip install cryptography")
    sys.exit(1)


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CERT_DIR = os.path.join(PROJECT_ROOT, "certs")
CERT_FILE = os.path.join(CERT_DIR, "cert.pem")
KEY_FILE = os.path.join(CERT_DIR, "key.pem")


def get_lan_ip() -> str | None:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        # Validate IP format.
        ipaddress.ip_address(ip)
        return ip
    except Exception:
        return None


def main() -> None:
    os.makedirs(CERT_DIR, exist_ok=True)

    lan_ip = get_lan_ip()

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    subject = issuer = x509.Name(
        [
            x509.NameAttribute(NameOID.COUNTRY_NAME, "ES"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "JumpTracker Dev"),
            x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
        ]
    )

    san_entries: list[x509.GeneralName] = [
        x509.DNSName("localhost"),
        x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
    ]

    if lan_ip:
        san_entries.append(x509.IPAddress(ipaddress.ip_address(lan_ip)))

    now = dt.datetime.now(dt.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=5))
        .not_valid_after(now + dt.timedelta(days=365))
        .add_extension(x509.SubjectAlternativeName(san_entries), critical=False)
        .sign(private_key=key, algorithm=hashes.SHA256())
    )

    with open(KEY_FILE, "wb") as f:
        f.write(
            key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )

    with open(CERT_FILE, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    print("[OK] Certificate generated:")
    print(f"     {CERT_FILE}")
    print(f"     {KEY_FILE}")
    print("[INFO] SAN entries:")
    print("       - localhost")
    print("       - 127.0.0.1")
    if lan_ip:
        print(f"       - {lan_ip}")
    else:
        print("       - (LAN IP not detected)")


if __name__ == "__main__":
    main()
