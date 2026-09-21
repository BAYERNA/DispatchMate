"""FAIND AI 분석 서버 진입점 (Python 3.11 + FastAPI + LangGraph).

역할: FR-02 사전분석, FR-08 SOP대조, FR-24/26 화재감지·정찰 3개 에이전트를 REST로 노출하고,
FR-24용 선택적 CCTV 자동 폴링(ENABLE_CCTV_POLLING)을 백그라운드로 구동한다.
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents.fire_detection_agent import FireDetectionAgent
from app.api.v1.main import api_router
from app.core.backend_client import BackendClientError, FaindBackendClient
from app.core.config import get_settings
from app.core.tracing import setup_tracing

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(title="FAIND AI Analysis Server", version="v1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

setup_tracing(app)
app.include_router(api_router)

_scheduler = AsyncIOScheduler()
_fire_detection_agent = FireDetectionAgent()
_backend_client = FaindBackendClient()


@app.get("/health")
async def health():
    return {"status": "UP"}


async def _poll_camera(device_id: str, stream_url: str) -> None:
    result = await _fire_detection_agent.run({"stream_url": stream_url, "device_id": device_id})
    if not result.get("detected"):
        return
    confidence = result.get("confidence", 0.0)
    danger_level = result.get("danger_level", "SAFE")
    logger.warning(
        "CCTV 자동감지: device=%s confidence=%.2f danger=%s score=%.1f",
        device_id, confidence, danger_level, result.get("danger_score", 0.0),
    )
    try:
        await _backend_client.report_cctv_detection(
            camera_device_id=device_id,
            confidence_score=confidence * 100,
            summary=f"CCTV 자동 폴링 감지 (label={result.get('label')}, danger={danger_level})",
            danger_score=result.get("danger_score"),
            snapshot_base64=result.get("snapshot_base64"),
        )
    except BackendClientError:
        logger.error("CCTV 폴링 감지 결과를 backend에 보고하지 못했습니다 (device=%s)", device_id)


@app.on_event("startup")
async def start_cctv_polling() -> None:
    if not settings.cctv_polling_enabled:
        logger.info("CCTV 자동 폴링 비활성화 상태입니다 (FAIND_CCTV_POLLING_ENABLED=false).")
        return
    cameras = settings.cctv_cameras
    if not cameras:
        logger.warning("CCTV 자동 폴링이 켜져 있지만 FAIND_CCTV_CAMERAS가 비어 있습니다.")
        return
    for camera in cameras:
        _scheduler.add_job(
            _poll_camera,
            "interval",
            seconds=settings.cctv_poll_interval_seconds,
            args=[camera.device_id, camera.stream_url],
            id=f"cctv-poll-{camera.device_id}",
        )
    _scheduler.start()
    logger.info("CCTV 자동 폴링 시작: %d대, %d초 간격", len(cameras), settings.cctv_poll_interval_seconds)


@app.on_event("shutdown")
async def stop_cctv_polling() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
