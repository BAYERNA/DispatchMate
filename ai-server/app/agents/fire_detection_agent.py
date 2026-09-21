"""FR-24/26: YOLOv8 기반 화재·연기 감지, CCTV·드론 겸용 에이전트.

그래프: acquire_frame → run_detection
이 에이전트는 순수하게 "감지됐는가"만 판단한다 — Java backend로의 콜백(incident 생성,
drone recon 결과 기록)은 부수효과이므로 api/v1/fire_detection_router.py가 결과를 보고
직접 수행한다 (에이전트를 순수 함수에 가깝게 유지해 단위 테스트를 쉽게 한다).
"""

import logging
import asyncio
from typing import Optional

from langgraph.graph import END, StateGraph

from app.agents.base_agent import BaseAgent
from app.core.config import get_settings
from app.services import opencv_processor
from app.services.cctv_stream_service import CctvStreamService
from app.services.yolo_service import YoloService

logger = logging.getLogger(__name__)


class FireDetectionAgent(BaseAgent):
    def __init__(self, yolo_service: Optional[YoloService] = None, stream_service: Optional[CctvStreamService] = None):
        self.yolo_service = yolo_service or YoloService()
        self.stream_service = stream_service or CctvStreamService()
        self.graph = self.build_graph()

    def build_graph(self):
        graph = StateGraph(dict)
        graph.add_node("acquire_frame", self._acquire_frame)
        graph.add_node("run_detection", self._run_detection)
        graph.set_entry_point("acquire_frame")
        graph.add_edge("acquire_frame", "run_detection")
        graph.add_edge("run_detection", END)
        return graph.compile()

    async def run(self, state: dict) -> dict:
        return await self.graph.ainvoke(state)

    async def _acquire_frame(self, state: dict) -> dict:
        frames: list = []
        if state.get("image_base64"):
            frame = opencv_processor.decode_base64_image(state["image_base64"])
            if frame is not None:
                frames = [frame]
        elif state.get("image_url"):
            frame = opencv_processor.fetch_image_from_url(state["image_url"])
            if frame is not None:
                frames = [frame]
        elif state.get("stream_url"):
            # 깜빡임 오탐 필터용으로 짧은 연속 프레임(burst)을 받아온다 — 단일 프레임(base64/URL)
            # 요청은 애초에 정적 이미지 한 장이라 깜빡임을 판단할 근거가 없어 판단 보류로 처리된다.
            settings = get_settings()
            frames = self.stream_service.capture_burst(
                state["stream_url"],
                frame_count=settings.fire_burst_frame_count,
                interval_seconds=settings.fire_burst_interval_seconds,
            )

        if not frames:
            state["frames"] = []
            state["acquire_error"] = "이미지를 획득하지 못했습니다 (image_base64/image_url/stream_url 확인 필요)."
            return state

        state["frames"] = [opencv_processor.resize_for_inference(f) for f in frames]
        return state

    async def _run_detection(self, state: dict) -> dict:
        frames = state.get("frames") or []
        if not frames:
            state["detected"] = False
            state["confidence"] = 0.0
            state["label"] = None
            state["reason"] = state.get("acquire_error", "알 수 없는 오류로 감지를 수행하지 못했습니다.")
            state["danger_level"] = "UNKNOWN"
            state["danger_score"] = 0.0
            return state

        camera_id = str(state.get("device_id") or "unknown")
        try:
            result = await asyncio.to_thread(self.yolo_service.detect_fire_burst, frames, camera_id)
        except Exception:
            logger.exception("화재 분석 실패")
            return {**state, "detected": False, "confidence": 0.0, "danger_level": "UNKNOWN",
                    "danger_score": 0.0, "reason": "분석을 수행하지 못했습니다.", "snapshot_base64": None}
        state["detected"] = result.detected
        state["confidence"] = result.confidence
        state["label"] = result.label
        state["reason"] = result.reason
        state["area_ratio"] = result.area_ratio
        state["danger_level"] = result.danger_level
        state["danger_score"] = result.danger_score
        state["is_flicker_verified"] = result.is_flicker_verified
        state["growth_ratio"] = result.growth_ratio
        state["spread_direction"] = result.spread_direction
        state["spread_speed_px_per_sec"] = result.spread_speed_px_per_sec

        # ADM-001 "AI 의심감지 대기열" 증거 스냅샷 — 감지 순간의 프레임을 박스와 함께 남겨서,
        # 관제실이 신뢰도 숫자만 보고 확인/오탐을 결정하지 않아도 되게 한다. 감지 안 됐을 땐
        # (박스가 없어서) 스트림 화면과 똑같이 "박스 없음=안전"으로 오인될 수 있어 남기지 않는다.
        if result.detected:
            annotated = self.yolo_service.detect_and_annotate(frames[-1])
            state["snapshot_base64"] = opencv_processor.encode_image_to_base64(annotated)
        else:
            state["snapshot_base64"] = None
        return state
