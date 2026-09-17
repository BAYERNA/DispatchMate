"""FR-24(CCTV 자동 화재감지) / FR-26(드론 정찰). YOLOv8 기반, CCTV·드론 겸용 스키마.

fire_detection_router는 두 소스를 같은 파이프라인(fire_detection_agent)으로 처리하되,
결과 콜백 대상만 다르다: CCTV는 incident 신규 생성(FR-24), 드론은 기존 dispatch에 결과만 덧붙인다(FR-26).
"""

from enum import Enum
from typing import Optional
from uuid import UUID

from app.core.camel_model import CamelModel


class DetectionSourceType(str, Enum):
    CCTV = "CCTV"
    DRONE = "DRONE"


class FireDetectionRequest(CamelModel):
    source_type: DetectionSourceType
    device_id: UUID
    # DRONE일 때만 필요 — 이미 존재하는 drone_dispatches row에 결과를 붙여야 하므로.
    dispatch_id: Optional[UUID] = None
    address_hint: Optional[str] = None
    # 이미지: base64(PNG/JPEG) 또는 접근 가능한 URL/스트림 경로 중 하나 이상 제공.
    image_base64: Optional[str] = None
    image_url: Optional[str] = None
    # 콜백을 이 요청 안에서 바로 보낼지(자동화 파이프라인) 아니면 결과만 볼지(수동 테스트).
    notify_backend: bool = True


class FireDetectionResult(CamelModel):
    detected: bool
    confidence: float
    label: Optional[str] = None
    callback_sent: bool = False
    incident_id: Optional[UUID] = None
    reason: Optional[str] = None
    # 단순 감지 여부를 넘어선 위험도·확산 신호 (yolo_service.DetectionResult 참조).
    # 전부 실제 관측치 기반이며, 데이터가 부족하면 None으로 명확히 "판단 보류"를 표시한다.
    area_ratio: float = 0.0
    danger_level: str = "SAFE"  # SAFE | WARNING | DANGER | CRITICAL
    danger_score: float = 0.0  # 0~100
    is_flicker_verified: Optional[bool] = None  # None=판단 보류, True=진짜로 판단, False=오탐 의심
    growth_ratio: Optional[float] = None
    spread_direction: Optional[str] = None
    spread_speed_px_per_sec: Optional[float] = None
    # 감지된 순간의 박스 포함 프레임(JPEG base64). /danger가 이걸 실어 보내면 ADM-010 관제실
    # 수동 등록도 CCTV 자동 폴링과 동일하게 증거 스냅샷을 남길 수 있다.
    snapshot_base64: Optional[str] = None
