"""영상 프레임 전처리 (base64/URL 디코딩, 리사이즈). YOLO 추론 전 공통 단계."""

import base64
import logging
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

MAX_DIMENSION = 1280


def decode_base64_image(image_base64: str) -> Optional[np.ndarray]:
    try:
        # data URL 접두사("data:image/png;base64,...")가 붙어 있어도 처리한다.
        if "," in image_base64 and image_base64.strip().startswith("data:"):
            image_base64 = image_base64.split(",", 1)[1]
        raw = base64.b64decode(image_base64)
        array = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(array, cv2.IMREAD_COLOR)
        return frame
    except Exception as e:
        logger.warning("base64 이미지 디코딩 실패: %s", e)
        return None


def fetch_image_from_url(image_url: str, timeout_seconds: float = 5.0) -> Optional[np.ndarray]:
    try:
        import httpx

        with httpx.Client(timeout=timeout_seconds) as client:
            response = client.get(image_url)
            response.raise_for_status()
            array = np.frombuffer(response.content, dtype=np.uint8)
            return cv2.imdecode(array, cv2.IMREAD_COLOR)
    except Exception as e:
        logger.warning("URL 이미지 조회 실패 (%s): %s", image_url, e)
        return None


def resize_for_inference(frame: np.ndarray, max_dimension: int = MAX_DIMENSION) -> np.ndarray:
    height, width = frame.shape[:2]
    longest_side = max(height, width)
    if longest_side <= max_dimension:
        return frame
    scale = max_dimension / longest_side
    return cv2.resize(frame, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)


# ADM-001 "AI 의심감지 대기열" 증거 스냅샷용 — 관제실이 확인/오탐 처리를 신뢰도 숫자만 보고
# 결정해야 했던 것(스트림 원본을 다시 열어보기 전에는 무엇이 찍혔는지 알 방법이 없었다)을 막는다.
# DB TEXT 컬럼·목록 썸네일용이라 작게(기본 480px, JPEG 70%) 인코딩한다.
def encode_image_to_base64(frame: np.ndarray, max_dimension: int = 480, jpeg_quality: int = 70) -> Optional[str]:
    try:
        small = resize_for_inference(frame, max_dimension)
        ok, buffer = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
        if not ok:
            return None
        return base64.b64encode(buffer).decode("ascii")
    except Exception as e:
        logger.warning("스냅샷 이미지 인코딩 실패: %s", e)
        return None
