from io import BytesIO
from modules.salto.backend.app import app

app.config['TESTING'] = True
c = app.test_client()
resp = c.post('/api/salto/analizar', data={'video': (BytesIO(b'fake mp4'), 'salto.mp4')})
print('STATUS', resp.status_code)
print('CONTENT-TYPE', resp.headers.get('Content-Type'))
print('BODY')
print(resp.get_data(as_text=True))
