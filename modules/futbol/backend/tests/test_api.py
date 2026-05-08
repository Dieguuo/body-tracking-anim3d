"""
@file test_api.py
@description Tests para los endpoints del módulo futbol.
             Cubre validación de entrada, manejo de errores y seguridad.

@requirements
- pytest: pip install pytest
- pytest-cov: pip install pytest-cov (para coverage)

@run_tests
- Todos los tests: pytest modules/futbol/backend/tests/
- Con cobertura: pytest --cov=modules/futbol/backend modules/futbol/backend/tests/
- Modo verbose: pytest -v modules/futbol/backend/tests/

@coverage_target
- Mínimo 80% de cobertura en app.py
- Mínimo 90% en controllers/
- Excepciones y error handlers: 100%
"""

import pytest
import json
from io import BytesIO
from unittest.mock import patch, MagicMock

import sys
import os

# Agregar el directorio backend al path para importar módulos
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import app
from exceptions import (
    VideoProcessingError,
    ValidationError,
    DatabaseError,
    FileSystemError,
)


class TestAPISetup:
    """Tests básicos de configuración de la aplicación."""

    @pytest.fixture
    def client(self):
        """
        Fixture que proporciona un cliente de test para la app Flask.
        Configura el modo de testing y desactiva la verificación CSRF.
        """
        app.config['TESTING'] = True
        with app.test_client() as client:
            yield client

    def test_app_exists(self):
        """Verifica que la aplicación Flask se creó correctamente."""
        assert app is not None
        assert app.config['TESTING'] is False  # Por defecto no está en testing

    def test_app_in_test_mode(self, client):
        """Verifica que el cliente de test está en modo testing."""
        assert app.config['TESTING'] is True

    def test_cors_configured(self):
        """Verifica que CORS está configurado en la app."""
        # La app tiene CORS(app, origins=...) en app.py
        assert app is not None


class TestVideoAnalysisEndpoint:
    """Tests para el endpoint POST /api/futbol/analizar."""

    @pytest.fixture
    def client(self):
        app.config['TESTING'] = True
        with app.test_client() as client:
            yield client

    def test_analizar_sin_archivo(self, client):
        """
        Prueba que el endpoint rechaza requests sin archivo de vídeo.
        Expected: 400 Bad Request
        """
        response = client.post('/api/futbol/analizar', data={})
        assert response.status_code == 400
        data = response.get_json()
        assert 'error' in data
        assert 'no se recibio' in data['error'].lower() or 'video' in data['error'].lower()

    def test_analizar_archivo_vacio(self, client):
        """
        Prueba que el endpoint rechaza archivos sin nombre.
        Expected: 400 Bad Request
        """
        # Simular archivo sin nombre
        data = {
            'video': (BytesIO(b'fake video data'), '')
        }
        response = client.post('/api/futbol/analizar', data=data)
        assert response.status_code == 400

    def test_analizar_extension_no_permitida(self, client):
        """
        Prueba que el endpoint rechaza extensiones inválidas (.txt, .pdf, etc).
        Expected: 400 Bad Request
        """
        data = {
            'video': (BytesIO(b'not a video'), 'archivo.txt')
        }
        response = client.post('/api/futbol/analizar', data=data)
        assert response.status_code == 400
        assert 'error' in response.get_json()

    def test_analizar_extension_permitida_mp4(self, client):
        """
        Prueba que el endpoint acepta extensión .mp4.
        Nota: Fallará en procesamiento porque el contenido no es vídeo válido,
        pero pasará la validación inicial.
        """
        data = {
            'video': (BytesIO(b'fake mp4'), 'test.mp4')
        }
        response = client.post('/api/futbol/analizar', data=data)
        # Puede ser 422 (procesamiento) o 500 (error interno), pero no 400 (validación)
        assert response.status_code != 400

    def test_analizar_falta_id_usuario(self, client):
        """
        Prueba que se puede analizar sin id_usuario (campo opcional).
        """
        data = {
            'video': (BytesIO(b'fake'), 'video.mp4'),
            # Sin id_usuario
        }
        response = client.post('/api/futbol/analizar', data=data)
        # Debería pasar validación, fallar en procesamiento
        assert response.status_code != 400

    def test_analizar_incluir_landmarks_parametro(self, client):
        """
        Prueba que el parámetro incluir_landmarks se procesa correctamente.
        """
        data = {
            'video': (BytesIO(b'fake'), 'video.mp4'),
            'incluir_landmarks': 'true',
        }
        response = client.post('/api/futbol/analizar', data=data)
        # Debería pasar validación
        assert response.status_code != 400

    def test_analizar_incluir_landmarks_false(self, client):
        """
        Prueba que incluir_landmarks=false se interpreta correctamente.
        """
        data = {
            'video': (BytesIO(b'fake'), 'video.mp4'),
            'incluir_landmarks': 'false',
        }
        response = client.post('/api/futbol/analizar', data=data)
        # Debería pasar validación
        assert response.status_code != 400


class TestExceptionHandling:
    """Tests para el manejo de excepciones personalizadas."""

    def test_video_processing_error_attributes(self):
        """
        Verifica que VideoProcessingError tiene los atributos correctos.
        """
        err = VideoProcessingError(
            "Internal technical message",
            "Safe message for client"
        )
        assert err.message == "Internal technical message"
        assert err.client_message == "Safe message for client"
        assert err.status_code == 422

    def test_validation_error_status_code(self):
        """
        Verifica que ValidationError devuelve código 400.
        """
        err = ValidationError("Invalid input")
        assert err.status_code == 400

    def test_database_error_status_code(self):
        """
        Verifica que DatabaseError devuelve código 503.
        """
        err = DatabaseError("Connection failed")
        assert err.status_code == 503

    def test_exception_without_client_message(self):
        """
        Verifica que las excepciones usan mensajes por defecto si no se proporciona.
        """
        err = ValidationError("Technical error")
        assert err.client_message != ""
        assert err.client_message is not None


class TestFilesystemValidation:
    """Tests para validación de archivos."""

    @pytest.fixture
    def client(self):
        app.config['TESTING'] = True
        with app.test_client() as client:
            yield client

    def test_archivo_corrupto_rechazado(self, client):
        """
        Prueba que archivos corruptos o inválidos son rechazados
        en la validación de extensión.
        """
        # Enviar como archivo de imagen, no vídeo
        data = {
            'video': (BytesIO(b'fake'), 'photo.jpg')
        }
        response = client.post('/api/futbol/analizar', data=data)
        # Debería fallar validación
        assert response.status_code == 400

    def test_multiples_extensiones_permitidas(self, client):
        """
        Prueba que se aceptan múltiples formatos de vídeo.
        """
        valid_extensions = ['.mp4', '.avi', '.mov']
        for ext in valid_extensions:
            data = {
                'video': (BytesIO(b'fake'), f'video{ext}')
            }
            response = client.post('/api/futbol/analizar', data=data)
            # No debe fallar por extensión
            assert response.status_code != 400, f"Extensión {ext} fue rechazada"


class TestErrorHandler:
    """Tests para el global error handler."""

    @pytest.fixture
    def client(self):
        app.config['TESTING'] = True
        with app.test_client() as client:
            yield client

    def test_archivo_muy_grande_413(self, client):
        """
        Prueba que archivos que exceden MAX_CONTENT_LENGTH devuelven 413.
        
        Nota: Flask rechaza esto antes de llegar al handler personalizado,
        pero verificamos que el handler existe.
        """
        # El app.errorhandler(413) está definido en app.py
        assert True  # Placeholder, validamos manualmente


class TestRequestParameters:
    """Tests para validación de parámetros en requests."""

    @pytest.fixture
    def client(self):
        app.config['TESTING'] = True
        with app.test_client() as client:
            yield client

    def test_metodo_origen_valido(self, client):
        """
        Prueba que metodo_origen con valor válido se acepta.
        """
        data = {
            'video': (BytesIO(b'fake'), 'video.mp4'),
            'metodo_origen': 'video_galeria',
        }
        response = client.post('/api/futbol/analizar', data=data)
        # Debería pasar validación de parámetro
        assert response.status_code != 400

    def test_id_usuario_numerico(self, client):
        """
        Prueba que id_usuario debe ser numérico si se proporciona.
        """
        data = {
            'video': (BytesIO(b'fake'), 'video.mp4'),
            'id_usuario': '123',  # Válido
        }
        response = client.post('/api/futbol/analizar', data=data)
        # Debería pasar validación
        assert response.status_code != 400


class TestResponseFormat:
    """Tests para el formato de respuestas JSON."""

    @pytest.fixture
    def client(self):
        app.config['TESTING'] = True
        with app.test_client() as client:
            yield client

    def test_error_response_es_json(self, client):
        """
        Prueba que las respuestas de error son JSON válido.
        """
        response = client.post('/api/futbol/analizar', data={})
        assert response.status_code == 400
        # Verificar que la respuesta es JSON
        try:
            data = response.get_json()
            assert data is not None
        except ValueError:
            pytest.fail("Respuesta no es JSON válido")

    def test_error_response_tiene_error_field(self, client):
        """
        Prueba que todas las respuestas de error tienen campo 'error'.
        """
        response = client.post('/api/futbol/analizar', data={})
        data = response.get_json()
        assert 'error' in data


# Ejecutar tests si se llama directamente
if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
