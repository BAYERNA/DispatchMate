from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
import httpx
import numpy as np
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from app.core import camera_access
from app.api.v1 import stream_router
from app.agents.fire_detection_agent import FireDetectionAgent
from app.services.yolo_service import YoloService
from app.services import safe_camera

CAMERA = '00000000-0000-4000-8000-000000000001'


@pytest.fixture
def allowed(monkeypatch):
    monkeypatch.setattr(camera_access, 'get_settings', lambda: SimpleNamespace(camera_allowed_hosts='192.168.1.10', backend_base_url='http://backend:8080'))


@pytest.mark.parametrize('url', [
    '/etc/passwd', 'file:///tmp/picture.jpg', 'http://localhost/a', 'http://127.0.0.1/a',
    'http://169.254.169.254/a', 'http://192.168.1.11/a', 'ftp://192.168.1.10/a',
    'http://name.example/a', 'http://user:pass@192.168.1.10/a',
])
def test_unapproved_destinations_rejected(allowed, url):
    with pytest.raises(HTTPException): camera_access.validate_camera_url(url)


def test_registered_numeric_destination_accepted(allowed):
    assert camera_access.validate_camera_url('rtsp://192.168.1.10:554/live')


@pytest.mark.asyncio
async def test_redirect_not_followed(allowed, monkeypatch):
    seen = []
    def handle(request):
        seen.append(str(request.url))
        return httpx.Response(302, headers={'Location': 'http://169.254.169.254/secret'})
    original = httpx.AsyncClient
    monkeypatch.setattr(safe_camera.httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    with pytest.raises(httpx.HTTPStatusError): await safe_camera.capture_frame('http://192.168.1.10/video')
    assert len(seen) == 1


def test_stream_routes_require_auth_and_legacy_url_route_is_removed():
    app = FastAPI()
    app.include_router(stream_router.router)
    with TestClient(app) as client:
        assert client.get('/streams/frame', params={'device_id': CAMERA}).status_code == 401
        assert client.get('/streams/danger', params={'device_id': CAMERA}).status_code == 401
        assert client.get('/streams/status').status_code == 401
        assert client.get('/streams/mjpeg', params={'stream_url':'file:///tmp/a.jpg'}).status_code == 404


def test_operator_only_and_unknown_camera(allowed, monkeypatch):
    app = FastAPI()
    app.include_router(stream_router.router)
    async def backend(path, auth):
        if path.endswith('/session'): return {'role': 'RESPONDER'}
        return {'deviceType': 'CCTV', 'streamUrl': None}
    monkeypatch.setattr(camera_access, 'backend_get', backend)
    with TestClient(app) as client:
        assert client.get('/streams/frame', params={'device_id': CAMERA}, headers={'Authorization':'Bearer test'}).status_code == 403


@pytest.mark.asyncio
async def test_capture_and_inference_failure_are_unknown():
    yolo = MagicMock()
    agent = FireDetectionAgent(yolo_service=yolo, stream_service=MagicMock())
    empty = await agent._run_detection({'frames': []})
    assert empty['danger_level'] == 'UNKNOWN'
    yolo.detect_fire_burst.side_effect = RuntimeError('test inference failure')
    result = await agent._run_detection({'frames': [np.zeros((8,8,3),dtype=np.uint8)]})
    assert result['danger_level'] == 'UNKNOWN' and result['reason']


def test_unavailable_model_is_unknown():
    model = YoloService.__new__(YoloService)
    model._model = None
    model._fire_class_ids = []
    result = model.detect_fire_burst([np.zeros((8,8,3),dtype=np.uint8)])
    assert result.danger_level == 'UNKNOWN'


def test_status_and_failed_capture(allowed, monkeypatch):
    app = FastAPI()
    app.include_router(stream_router.router)
    app.dependency_overrides[camera_access.require_operator] = lambda: 'Bearer test'
    agent = MagicMock()
    agent.yolo_service.is_available = False
    app.dependency_overrides[stream_router.get_fire_detection_agent] = lambda: agent
    monkeypatch.setattr(stream_router, 'camera_url', AsyncMock(return_value='http://192.168.1.10/video'))
    monkeypatch.setattr(stream_router, 'take_frame', AsyncMock(return_value=None))
    with TestClient(app) as client:
        assert client.get('/streams/status').json()['model'] == 'UNAVAILABLE'
        assert client.get('/streams/danger', params={'device_id':CAMERA}).json()['dangerLevel'] == 'UNKNOWN'
