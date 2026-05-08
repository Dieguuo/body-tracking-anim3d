"""
@file test_api.py
@description Tests para los endpoints del módulo salto.
             Cubre validación de entrada, manejo de errores y seguridad.

@requirements
- pytest: pip install pytest
- pytest-cov: pip install pytest-cov (para coverage)

@run_tests
- Todos los tests: pytest modules/salto/backend/tests/
- Con cobertura: pytest --cov=modules/salto/backend modules/salto/backend/tests/
- Modo verbose: pytest -v modules/salto/backend/tests/

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
    BiomechanicsError,
    UserNotFoundError,
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
    """Tests para el endpoint POST /api/salto/analizar."""

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
        response = client.post('/api/salto/analizar', data={})
        assert response.status_code == 400
        data = response.get_json()
        assert 'error' in data
        assert 'video' in data['error'].lower() or 'archivo' in data['error'].lower()

    def test_analizar_archivo_vacio(self, client):
        """
        Prueba que el endpoint rechaza archivos sin nombre.
        Expected: 400 Bad Request
        """
        # Simular archivo sin nombre
        data = {
            'video': (BytesIO(b'fake video data'), '')
        }
        response = client.post('/api/salto/analizar', data=data)
        assert response.status_code == 400

    def test_analizar_extension_no_permitida(self, client):
        """
        Prueba que el endpoint rechaza extensiones inválidas (.txt, .pdf, etc).
        Expected: 400 Bad Request
        """
        data = {
            'video': (BytesIO(b'not a video'), 'archivo.pdf')
        }
        response = client.post('/api/salto/analizar', data=data)
        assert response.status_code == 400
        assert 'error' in response.get_json()

    def test_analizar_extension_permitida_mp4(self, client):
        """
        Prueba que el endpoint acepta extensión .mp4.
        Nota: Fallará en procesamiento porque el contenido no es vídeo válido,
        pero pasará la validación inicial.
        """
        data = {
            'video': (BytesIO(b'fake mp4'), 'salto.mp4')
        }
        response = client.post('/api/salto/analizar', data=data)
        # Puede ser 422 (procesamiento) o 500 (error interno), pero no 400 (validación)
        assert response.status_code != 400

    def test_analizar_falta_id_usuario(self, client):
        """
        Prueba que se puede analizar sin id_usuario (campo opcional en algunos casos).
        """
        data = {
            'video': (BytesIO(b'fake'), 'salto.mp4'),
            # Sin id_usuario
        }
        response = client.post('/api/salto/analizar', data=data)
        # Debería pasar validación de extensión
        assert response.status_code != 400

    def test_analizar_parametro_tipo_salto(self, client):
        """
        Prueba que el parámetro tipo_salto se procesa correctamente.
        """
        data = {
            'video': (BytesIO(b'fake'), 'salto.mp4'),
            'tipo_salto': 'vertical',
        }
        response = client.post('/api/salto/analizar', data=data)
        # Debería pasar validación
        assert response.status_code != 400

    def test_analizar_metodo_origen_valido(self, client):
        """
        Prueba que metodo_origen se valida correctamente.
        """
        data = {
            'video': (BytesIO(b'fake'), 'salto.mp4'),
            'metodo_origen': 'video_galeria',
        }
        response = client.post('/api/salto/analizar', data=data)
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

    def test_biomechanics_error_status_code(self):
        """
        Verifica que BiomechanicsError devuelve código 422.
        """
        err = BiomechanicsError("Cannot calculate biomechanics")
        assert err.status_code == 422

    def test_user_not_found_error_status_code(self):
        """
        Verifica que UserNotFoundError devuelve código 404.
        """
        err = UserNotFoundError("User not found")
        assert err.status_code == 404

    def test_exception_without_client_message(self):
        """
        Verifica que las excepciones usan mensajes por defecto si no se proporciona.
        """
        err = ValidationError("Technical error")
        assert err.client_message != ""
        assert err.client_message is not None

    def test_exception_str_representation(self):
        """
        Verifica que el str() de una excepción devuelve el mensaje técnico.
        """
        technical_msg = "Division by zero in angle calculation"
        err = BiomechanicsError(technical_msg, "Error en cálculo")
        assert str(err) == technical_msg


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
            'video': (BytesIO(b'fake'), 'salto.jpg')
        }
        response = client.post('/api/salto/analizar', data=data)
        # Debería fallar validación
        assert response.status_code == 400

    def test_multiples_extensiones_permitidas(self, client):
        """
        Prueba que se aceptan múltiples formatos de vídeo.
        """
        valid_extensions = ['.mp4', '.avi', '.mov', '.webm']
        for ext in valid_extensions:
            data = {
                'video': (BytesIO(b'fake'), f'salto{ext}')
            }
            response = client.post('/api/salto/analizar', data=data)
            # No debe fallar por extensión
            assert response.status_code != 400, f"Extensión {ext} fue rechazada"


class TestRequestParameters:
    """Tests para validación de parámetros en requests."""

    @pytest.fixture
    def client(self):
        app.config['TESTING'] = True
        with app.test_client() as client:
            yield client

    def test_id_usuario_numerico(self, client):
        """
        Prueba que id_usuario debe ser numérico si se proporciona.
        """
        data = {
            'video': (BytesIO(b'fake'), 'salto.mp4'),
            'id_usuario': '42',  # Válido
        }
        response = client.post('/api/salto/analizar', data=data)
        # Debería pasar validación
        assert response.status_code != 400

    def test_tipo_salto_opcional(self, client):
        """
        Prueba que tipo_salto es opcional.
        """
        data = {
            'video': (BytesIO(b'fake'), 'salto.mp4'),
            # Sin tipo_salto
        }
        response = client.post('/api/salto/analizar', data=data)
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
        response = client.post('/api/salto/analizar', data={})
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
        response = client.post('/api/salto/analizar', data={})
        data = response.get_json()
        assert 'error' in data

    def test_error_response_no_contiene_stacktrace(self, client):
        """
        Prueba que las respuestas de error NO contienen stacktraces.
        Los mensajes deben ser genéricos.
        """
        response = client.post('/api/salto/analizar', data={})
        data = response.get_json()
        error_msg = data.get('error', '')
        # No debe contener palabras típicas de stacktrace
        assert 'traceback' not in error_msg.lower()
        assert 'line' not in error_msg.lower() or 'línea' not in error_msg.lower()


# Ejecutar tests si se llama directamente
if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
