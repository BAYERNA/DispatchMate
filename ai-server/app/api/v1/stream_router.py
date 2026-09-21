"""Authenticated camera snapshots and analysis. Clients send IDs, never target URLs."""
import asyncio
from uuid import UUID
import cv2
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from app.core.camera_access import require_operator, camera_url
from app.api.v1.fire_detection_router import get_fire_detection_agent, _result_kwargs
from app.agents.fire_detection_agent import FireDetectionAgent
from app.schemas.fire_detection_schema import FireDetectionResult
from app.services.safe_camera import capture_frame

router = APIRouter(prefix='/streams', tags=['streams'])
_slots = asyncio.Semaphore(4)
_inference = asyncio.Lock()


async def take_frame(url):
    try:
        return await asyncio.wait_for(capture_frame(url), timeout=8)
    except Exception:
        return None


@router.get('/frame')
async def frame(device_id: UUID, debug: bool = False,
                authorization: str = Depends(require_operator),
                agent: FireDetectionAgent = Depends(get_fire_detection_agent)):
    url = await camera_url(device_id, authorization)
    if _slots.locked():
        raise HTTPException(429, '카메라 요청이 많습니다. 잠시 후 다시 시도하세요.')
    async with _slots:
        image = await take_frame(url)
        if image is None:
            raise HTTPException(503, '영상을 획득하지 못했습니다.')
        if debug:
            async with _inference:
                image = await asyncio.to_thread(agent.yolo_service.detect_and_annotate, image)
        ok, buffer = await asyncio.to_thread(cv2.imencode, '.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if not ok:
            raise HTTPException(503, '영상 변환 실패')
        return Response(buffer.tobytes(), media_type='image/jpeg', headers={'Cache-Control': 'no-store'})


@router.get('/danger', response_model=FireDetectionResult)
async def danger(device_id: UUID, authorization: str = Depends(require_operator),
                 agent: FireDetectionAgent = Depends(get_fire_detection_agent)):
    url = await camera_url(device_id, authorization)
    if _slots.locked():
        raise HTTPException(429, '카메라 요청이 많습니다.')
    async with _slots:
        frames = []
        for _ in range(3):
            image = await take_frame(url)
            if image is None:
                return FireDetectionResult(detected=False, confidence=0, danger_level='UNKNOWN', reason='영상 획득 실패')
            frames.append(image)
            await asyncio.sleep(0.15)
        async with _inference:
            result = await agent._run_detection({'frames': frames, 'device_id': str(device_id)})
        return FireDetectionResult(reason=result.get('reason'), **_result_kwargs(result))


@router.get('/status')
async def status(authorization: str = Depends(require_operator),
                 agent: FireDetectionAgent = Depends(get_fire_detection_agent)):
    return {'service': 'UP', 'model': 'READY' if agent.yolo_service.is_available else 'UNAVAILABLE'}
