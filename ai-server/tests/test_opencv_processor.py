"""ADM-001 증거 스냅샷 인코딩(encode_image_to_base64)이 실제로 디코드 가능한 JPEG를
base64로 돌려주는지 검증한다 — DB에 텍스트로 저장해서 프론트에서 <img>로 바로 그릴 데이터라
"그럴듯한 문자열"이 아니라 진짜 이미지인지가 중요하다."""

import base64
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.opencv_processor import encode_image_to_base64  # noqa: E402


def test_인코딩된_문자열은_실제로_디코드_가능한_JPEG다():
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    frame[:, :] = (0, 0, 255)  # 빨간색 프레임

    encoded = encode_image_to_base64(frame)

    assert encoded is not None
    raw = base64.b64decode(encoded)
    decoded = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert decoded is not None
    assert decoded.shape[0] > 0 and decoded.shape[1] > 0


def test_max_dimension보다_큰_프레임은_축소되어_인코딩된다():
    frame = np.zeros((960, 1280, 3), dtype=np.uint8)

    encoded = encode_image_to_base64(frame, max_dimension=480)

    raw = base64.b64decode(encoded)
    decoded = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert max(decoded.shape[0], decoded.shape[1]) <= 480
