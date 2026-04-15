"""Quick test: send the horizontal video to the backend API."""
import urllib.request
import json

boundary = "----TestBoundary12345"
video_path = r"C:\Users\danie\Downloads\Horizontal prueba.mp4"

with open(video_path, "rb") as f:
    video_data = f.read()

body = b""
for name, val in [("tipo_salto", "horizontal"), ("altura_real_m", "1.75")]:
    body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{val}\r\n".encode()

body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"video\"; filename=\"test.mp4\"\r\nContent-Type: video/mp4\r\n\r\n".encode()
body += video_data
body += f"\r\n--{boundary}--\r\n".encode()

req = urllib.request.Request(
    "http://127.0.0.1:5001/api/salto/calcular",
    data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    method="POST",
)

resp = urllib.request.urlopen(req, timeout=120)
d = json.loads(resp.read())
for k in ["distancia", "slowmo_factor", "frame_despegue", "frame_aterrizaje",
           "clasificacion", "tiempo_vuelo_s", "confianza"]:
    print(f"{k}: {d.get(k)}")
