"""FR-24(CCTV 자동 화재감지) / FR-26(드론 정찰). 감지 후 Java backend로 콜백까지 수행한다.

- CCTV: 감지되면 backend에 새 incident(AI_SUSPECTED)를 생성 요청한다 — NFR-08에 따라 이 호출은
  절대 정식 출동을 만들지 않는다. 확정은 오직 관제센터(ADM-001, role=ADMIN)만 할 수 있다.
- DRONE: 감지 여부와 무관하게 정찰 결과를 기존 drone_dispatches row에 기록만 한다(FR-26).
"""

import logging

from fastapi import APIRouter, Depends

from app.agents.fire_detection_agent import FireDetectionAgent
from app.core.backend_client import BackendClientError, FaindBackendClient
from app.schemas.fire_detection_schema import DetectionSourceType, FireDetectionRequest, FireDetectionResult
from app.services.yolo_service import YoloService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fire-detection", tags=["fire-detection"])

# YOLO 모델 로드는 비용이 크므로 프로세스당 한 번만 수행한다.
_shared_yolo_service = YoloService()


def get_fire_detection_agent() -> FireDetectionAgent:
    return FireDetectionAgent(yolo_service=_shared_yolo_service)


def get_backend_client() -> FaindBackendClient:
    return FaindBackendClient()


def _result_kwargs(result: dict) -> dict:
    """agent 실행 결과 dict에서 FireDetectionResult 공통 필드를 뽑아낸다."""
    return {
        "detected": result.get("detected", False),
        "confidence": result.get("confidence", 0.0),
        "label": result.get("label"),
        "area_ratio": result.get("area_ratio", 0.0),
        "danger_level": result.get("danger_level", "SAFE"),
        "danger_score": result.get("danger_score", 0.0),
        "is_flicker_verified": result.get("is_flicker_verified"),
        "growth_ratio": result.get("growth_ratio"),
        "spread_direction": result.get("spread_direction"),
        "spread_speed_px_per_sec": result.get("spread_speed_px_per_sec"),
        "snapshot_base64": result.get("snapshot_base64"),
    }


@router.post("/analyze", response_model=FireDetectionResult)
async def analyze(
    request: FireDetectionRequest,
    agent: FireDetectionAgent = Depends(get_fire_detection_agent),
    backend_client: FaindBackendClient = Depends(get_backend_client),
):
    result = await agent.run(
        {
            "image_base64": request.image_base64,
            "image_url": request.image_url,
            "device_id": str(request.device_id),
        }
    )
    kwargs = _result_kwargs(result)
    detected = kwargs["detected"]
    confidence = kwargs["confidence"]
    reason = result.get("reason")
    label = kwargs["label"]

    if not (detected and request.notify_backend):
        return FireDetectionResult(reason=reason, **kwargs)

    if request.source_type == DetectionSourceType.CCTV:
        try:
            incident_id = await backend_client.report_cctv_detection(
                camera_device_id=request.device_id,
                confidence_score=confidence * 100,
                summary=(
                    f"YOLOv8 화재/연기 감지 (label={label}, confidence={confidence:.2f}, "
                    f"danger={kwargs['danger_level']})"
                ),
                address_hint=request.address_hint,
                danger_score=kwargs["danger_score"],
                snapshot_base64=result.get("snapshot_base64"),
            )
            return FireDetectionResult(callback_sent=True, incident_id=incident_id, **kwargs)
        except BackendClientError as e:
            return FireDetectionResult(callback_sent=False, reason=str(e), **kwargs)

    # DRONE
    if request.dispatch_id is None:
        return FireDetectionResult(
            callback_sent=False, reason="DRONE 소스는 dispatchId가 필요합니다.", **kwargs
        )
    try:
        await backend_client.report_drone_recon(
            dispatch_id=request.dispatch_id,
            confidence_score=confidence * 100,
            summary=f"드론 정찰 화재/연기 감지 (label={label}, confidence={confidence:.2f})",
        )
        return FireDetectionResult(callback_sent=True, **kwargs)
    except BackendClientError as e:
        return FireDetectionResult(callback_sent=False, reason=str(e), **kwargs)
