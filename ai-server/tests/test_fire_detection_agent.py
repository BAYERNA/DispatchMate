"""ADM-001 증거 스냅샷: 감지됐을 때만 state["snapshot_base64"]가 채워지고, 감지 안 됐을 땐
None으로 남는지 검증한다 — 박스 없는 프레임을 스냅샷으로 남기면 "박스 없음=안전"이라는
잘못된 신호를 줄 수 있어서(모듈 주석 참조), 이 경계가 실제로 지켜지는지가 핵심이다."""

import sys
from pathlib import Path
from unittest.mock import MagicMock

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.agents.fire_detection_agent import FireDetectionAgent  # noqa: E402
from app.services.yolo_service import DetectionResult  # noqa: E402


def _agent_with_mocked_yolo(detection_result: DetectionResult) -> FireDetectionAgent:
    stream_service = MagicMock()
    yolo_service = MagicMock()
    yolo_service.detect_fire_burst.return_value = detection_result
    yolo_service.detect_and_annotate.side_effect = lambda frame: frame
    return FireDetectionAgent(yolo_service=yolo_service, stream_service=stream_service)


@pytest.mark.asyncio
async def test_감지되면_스냅샷_base64가_채워진다():
    agent = _agent_with_mocked_yolo(
        DetectionResult(detected=True, confidence=0.9, label="fire", danger_level="DANGER", danger_score=60.0)
    )
    frame = np.zeros((50, 50, 3), dtype=np.uint8)

    # _acquire_frame(stream_url 등)은 이미 검증된 경로라 여기선 _run_detection만 단위 테스트한다.
    state = await agent._run_detection({"frames": [frame], "device_id": "cam-1"})

    assert state["detected"] is True
    assert state["snapshot_base64"] is not None
    assert isinstance(state["snapshot_base64"], str)


@pytest.mark.asyncio
async def test_감지_안되면_스냅샷은_None이다():
    agent = _agent_with_mocked_yolo(DetectionResult(detected=False, confidence=0.1, danger_level="SAFE"))
    frame = np.zeros((50, 50, 3), dtype=np.uint8)

    state = await agent._run_detection({"frames": [frame], "device_id": "cam-1"})

    assert state["detected"] is False
    assert state["snapshot_base64"] is None
