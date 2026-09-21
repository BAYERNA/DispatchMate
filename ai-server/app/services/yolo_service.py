"""YOLOv8 기반 화재·연기 감지 추론 엔진 (FR-24/26). CCTV·드론 양쪽이 이 서비스 하나를 재사용한다
(기술스택 §2.8: "CCTV 자동감지와 드론 정찰 양쪽에 동일 모델을 재사용해 학습·운영 비용을 줄인다").

중요한 정직성 원칙: 공개 배포되는 기본 YOLOv8 가중치(yolov8n.pt 등)는 COCO 데이터셋(사람·차량 등
80종)으로 학습된 것이라 "fire"/"smoke" 클래스가 없다. 화재 감지가 실제로 동작하려면 화재/연기
이미지로 파인튜닝한 가중치 파일이 FAIND_YOLO_MODEL_PATH에 있어야 한다. 그 파일이 없거나 클래스가
없으면, 조용히 거짓 양성/음성을 만들지 않고 "감지 불가" 상태를 명확히 반환한다.

단순 감지 여부를 넘어, 아래 세 가지 신호를 추가로 계산한다 — 전부 실제 관측치에서만 계산하고,
데이터가 부족하면 "판단 보류"로 명확히 표시한다(임의로 만들어내지 않는다):
  - danger_level/danger_score: 신뢰도 + 프레임 대비 화재/연기 면적 비율(area_ratio)을 근거로 한
    0~100 위험도 점수와 4단계 등급(SAFE/WARNING/DANGER/CRITICAL).
  - is_flicker_verified: 정적인 붉은/회색 물체를 화재/연기로 오인하는 것을 줄이기 위한 필터.
    한 번의 폴링 안에서 찍은 짧은 연속 프레임(burst)의 밝기 변화로 판단하며, burst가 1장뿐이면
    (정지 이미지, 또는 스트림 실패로 1장만 확보된 경우) None("판단 보류")을 반환한다.
  - growth_ratio/spread_direction/spread_speed_px_per_sec: 카메라별로 최근 관측 이력을 저장해두고,
    이전 관측 대비 화재/연기 영역이 얼마나·어느 방향으로·얼마나 빠르게 커지는지 계산한다.

아래 임계값들(FLICKER_THRESHOLD_*, GROWTH_ALERT_RATIO, DANGER_SCORE_*)은 실제 화재 영상을 검증하며
얻은 초기값이다 — 실전 카메라 영상으로 추가 튜닝이 필요하다는 전제를 코드에도 남겨둔다.
"""

import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

from app.core.config import get_settings

logger = logging.getLogger(__name__)

FIRE_KEYWORDS = ("fire", "smoke", "flame", "화재", "연기")

# 카메라별 관측 이력 최대 보관 개수 (기본 30초 폴링 기준 약 수십 분 분량)
HISTORY_LEN = 20
# 이 시간(초) 이상 지난 관측치와 비교해야 확산 추세로 인정한다 (너무 촘촘한 간격의 노이즈 배제)
MIN_GROWTH_INTERVAL_SECONDS = 1.0
GROWTH_ALERT_RATIO = 1.3

# 깜빡임(flicker) 판정 - burst 프레임 간 박스 내부 밝기 변화 평균
FLICKER_THRESHOLD_FIRE = 4.0
FLICKER_THRESHOLD_SMOKE = 1.2
MIN_FLICKER_SAMPLES = 2  # burst가 최소 3장은 있어야 diff 샘플이 2개 이상 나옴
BRIGHTNESS_THRESHOLD = 200.0  # 과다노출 수준의 강한 화염은 밝기 자체를 증거로 사용

DANGER_SCORE_WARNING = 15.0
DANGER_SCORE_DANGER = 50.0
DANGER_SCORE_CRITICAL = 85.0
# area_ratio가 이 값 이상이면 면적 가중치를 최대로 친다 (프레임의 30% 이상 = 이미 충분히 위험)
AREA_RATIO_SATURATION = 0.3


@dataclass
class DetectionResult:
    detected: bool
    confidence: float
    label: Optional[str] = None
    reason: Optional[str] = None
    area_ratio: float = 0.0
    danger_level: str = "UNKNOWN"
    danger_score: float = 0.0
    # None = 판단 보류(샘플 부족, 정지 이미지 등) / True = 진짜로 판단 / False = 오탐 의심
    is_flicker_verified: Optional[bool] = None
    growth_ratio: Optional[float] = None
    spread_direction: Optional[str] = None
    spread_speed_px_per_sec: Optional[float] = None


class YoloService:
    def __init__(self, model_path: Optional[str] = None, confidence_threshold: Optional[float] = None):
        settings = get_settings()
        self._model_path = model_path or settings.yolo_model_path
        self._confidence_threshold = (
            confidence_threshold if confidence_threshold is not None else settings.fire_confidence_threshold
        )
        self._device = settings.yolo_device
        self._model = None
        self._fire_class_ids: set[int] = set()
        self._load_model()
        # 카메라(device_id)별 (timestamp, area_ratio, center_x, center_y) 관측 이력.
        # 프로세스 메모리에만 보관한다 — 데모 규모의 단일 워커 전제이므로, ai-server가 재시작되면
        # 확산 추세 이력은 초기화된다(치명적이지 않음: 새 이력이 다시 쌓이기 시작할 뿐).
        self._camera_history: dict[str, deque] = defaultdict(lambda: deque(maxlen=HISTORY_LEN))

    @property
    def is_available(self) -> bool:
        return self._model is not None and bool(self._fire_class_ids)

    def _load_model(self) -> None:
        try:
            from ultralytics import YOLO
        except ImportError:
            logger.warning("ultralytics가 설치되어 있지 않습니다 — 화재감지 기능이 비활성화됩니다.")
            return

        import os

        if not os.path.exists(self._model_path):
            logger.warning(
                "화재/연기 파인튜닝 모델(%s)을 찾을 수 없습니다 — 화재감지 기능이 비활성화됩니다. "
                "FAIND_YOLO_MODEL_PATH로 파인튜닝된 가중치 경로를 지정하세요.",
                self._model_path,
            )
            return

        try:
            model = YOLO(self._model_path)
        except Exception as e:
            logger.error("YOLO 모델 로드 실패 (%s): %s", self._model_path, e)
            return

        class_names = getattr(model, "names", {}) or {}
        fire_class_ids = {
            class_id
            for class_id, name in class_names.items()
            if any(keyword in str(name).lower() for keyword in FIRE_KEYWORDS)
        }
        if not fire_class_ids:
            logger.warning(
                "모델(%s)에 fire/smoke 클래스가 없습니다 — COCO 등 일반 목적 가중치로 보입니다. "
                "화재/연기로 파인튜닝된 모델이 아니면 화재감지 결과는 항상 미검출로 처리됩니다.",
                self._model_path,
            )
            self._model = model
            return

        self._model = model
        self._fire_class_ids = fire_class_ids
        logger.info("YOLO 화재감지 모델 로드 완료: %s (클래스 %s)", self._model_path, fire_class_ids)

    def detect_fire(self, frame: np.ndarray, camera_id: str = "unknown") -> DetectionResult:
        """단일 이미지(base64/URL로 받은 1장짜리 수동 테스트 요청 등) 감지.
        burst가 아니라 1장뿐이므로 깜빡임 판정은 자연히 보류(None)로 처리된다."""
        return self.detect_fire_burst([frame] if frame is not None else [], camera_id)

    def detect_fire_burst(self, frames: list[np.ndarray], camera_id: str = "unknown") -> DetectionResult:
        if not frames:
            return DetectionResult(detected=False, confidence=0.0, reason="분석할 프레임이 없습니다.")

        if not self.is_available:
            return DetectionResult(
                detected=False,
                confidence=0.0,
                reason="화재/연기 감지 모델이 준비되지 않았습니다 (모델 없음 또는 fire/smoke 클래스 없음).",
            )

        latest_frame = frames[-1]
        frame_h, frame_w = latest_frame.shape[:2]
        frame_area = frame_h * frame_w

        results = self._model.predict(latest_frame, device=self._device, verbose=False)

        candidate_boxes = []  # (class_name, confidence, x1, y1, x2, y2)
        best_confidence = 0.0
        best_label = None
        best_box = None
        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue
            for box in boxes:
                class_id = int(box.cls[0])
                if class_id not in self._fire_class_ids:
                    continue
                confidence = float(box.conf[0])
                x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
                class_name = str(self._model.names.get(class_id, class_id))
                candidate_boxes.append((class_name, confidence, x1, y1, x2, y2))
                if confidence > best_confidence:
                    best_confidence = confidence
                    best_label = class_name
                    best_box = (x1, y1, x2, y2)

        detected = best_confidence >= self._confidence_threshold
        if not detected:
            return DetectionResult(detected=False, confidence=round(best_confidence, 4), danger_level="SAFE")

        # ---- area_ratio: 임계값을 넘긴 박스들의 면적 합 / 프레임 면적 ----
        total_area = sum(
            max(0.0, x2 - x1) * max(0.0, y2 - y1)
            for _, conf, x1, y1, x2, y2 in candidate_boxes
            if conf >= self._confidence_threshold
        )
        area_ratio = min(1.0, total_area / frame_area) if frame_area > 0 else 0.0

        # ---- 깜빡임 검증: burst 내 연속 프레임 간 최고신뢰도 박스 영역의 밝기 변화 ----
        is_flicker_verified = self._verify_flicker(frames, best_box, best_label, frame_w, frame_h)

        # ---- 확산 추적: 카메라별 이력에 이번 관측치를 반영 ----
        growth_ratio, spread_direction, spread_speed = self._track_spread(camera_id, area_ratio, best_box)

        # ---- 위험도 점수 ----
        danger_score = self._score_danger(best_confidence, area_ratio, best_label, growth_ratio, is_flicker_verified)
        danger_level = self._level_for_score(danger_score)

        return DetectionResult(
            detected=True,
            confidence=round(best_confidence, 4),
            label=best_label,
            area_ratio=round(area_ratio, 4),
            danger_level=danger_level,
            danger_score=round(danger_score, 1),
            is_flicker_verified=is_flicker_verified,
            growth_ratio=growth_ratio,
            spread_direction=spread_direction,
            spread_speed_px_per_sec=spread_speed,
        )

    def detect_and_annotate(self, frame: np.ndarray) -> np.ndarray:
        """디버그 전용: 원본 프레임 위에 감지된 fire/smoke 박스를 그려서 돌려준다.
        운영 화면(/streams/mjpeg)에는 쓰지 않는다 — "박스가 없으면 안전하다"는 잘못된 신호를
        줄 수 있어 영상과 판단을 분리해뒀다(모듈 docstring 참조). 이건 개발자가 실제 감지
        위치가 맞는지 직접 눈으로 확인할 때만 쓰는 별도 경로다."""
        if not self.is_available:
            return frame

        results = self._model.predict(frame, device=self._device, verbose=False)
        annotated = frame.copy()
        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue
            for box in boxes:
                class_id = int(box.cls[0])
                if class_id not in self._fire_class_ids:
                    continue
                confidence = float(box.conf[0])
                if confidence < self._confidence_threshold:
                    continue
                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                class_name = str(self._model.names.get(class_id, class_id))
                color = (0, 0, 255) if class_name == "fire" else (128, 128, 128)  # BGR: fire=빨강, smoke=회색
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                label = f"{class_name} {confidence:.2f}"
                cv2.putText(annotated, label, (x1, max(0, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        return annotated

    def _verify_flicker(
        self,
        frames: list[np.ndarray],
        best_box: Optional[tuple],
        best_label: Optional[str],
        frame_w: int,
        frame_h: int,
    ) -> Optional[bool]:
        if best_box is None or len(frames) < MIN_FLICKER_SAMPLES + 1:
            return None  # burst가 1장뿐이면(정지 이미지 등) 판단 보류 - 없는 신호를 만들어내지 않는다

        x1, y1, x2, y2 = [int(v) for v in best_box]
        x1c, y1c = max(0, x1), max(0, y1)
        x2c, y2c = min(frame_w, x2), min(frame_h, y2)
        if x2c <= x1c or y2c <= y1c:
            return None

        flicker_scores = []
        prev_gray = None
        for f in frames:
            gray = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
            if prev_gray is not None and prev_gray.shape == gray.shape:
                roi_prev = prev_gray[y1c:y2c, x1c:x2c]
                roi_cur = gray[y1c:y2c, x1c:x2c]
                if roi_prev.size > 0:
                    flicker_scores.append(float(cv2.absdiff(roi_prev, roi_cur).mean()))
            prev_gray = gray

        if len(flicker_scores) < MIN_FLICKER_SAMPLES:
            return None

        avg_flicker = sum(flicker_scores) / len(flicker_scores)
        threshold = FLICKER_THRESHOLD_SMOKE if best_label == "smoke" else FLICKER_THRESHOLD_FIRE

        # 과다노출 수준의 강한 화염은 프레임 간 변화가 오히려 잘 안 잡히므로(이미 픽셀값이 포화),
        # 밝기 자체를 별도 증거로 사용한다.
        latest_gray = cv2.cvtColor(frames[-1], cv2.COLOR_BGR2GRAY)
        roi_latest = latest_gray[y1c:y2c, x1c:x2c]
        brightness = float(roi_latest.mean()) if roi_latest.size > 0 else 0.0

        return (avg_flicker > threshold) or (brightness > BRIGHTNESS_THRESHOLD)

    def _track_spread(
        self, camera_id: str, area_ratio: float, best_box: Optional[tuple]
    ) -> tuple[Optional[float], Optional[str], Optional[float]]:
        now = time.time()
        if best_box is not None:
            cx = (best_box[0] + best_box[2]) / 2
            cy = (best_box[1] + best_box[3]) / 2
        else:
            cx = cy = 0.0

        history = self._camera_history[camera_id]
        growth_ratio: Optional[float] = None
        spread_direction: Optional[str] = None
        spread_speed: Optional[float] = None

        if history:
            t0, area0, cx0, cy0 = history[0]
            dt = now - t0
            if dt >= MIN_GROWTH_INTERVAL_SECONDS and area0 > 0:
                growth_ratio = round(area_ratio / area0, 2)
                dx, dy = cx - cx0, cy - cy0
                spread_speed = round(((dx**2 + dy**2) ** 0.5) / dt, 1)
                if growth_ratio >= GROWTH_ALERT_RATIO:
                    spread_direction = ("→" if dx > 0 else "←") + ("↓" if dy > 0 else "↑")

        history.append((now, area_ratio, cx, cy))
        return growth_ratio, spread_direction, spread_speed

    def _score_danger(
        self,
        confidence: float,
        area_ratio: float,
        label: Optional[str],
        growth_ratio: Optional[float],
        is_flicker_verified: Optional[bool],
    ) -> float:
        class_weight = 1.0 if label == "fire" else 0.7 if label == "smoke" else 0.4
        area_factor = 0.4 + 0.6 * min(area_ratio / AREA_RATIO_SATURATION, 1.0)
        score = confidence * 100 * class_weight * area_factor

        if growth_ratio is not None and growth_ratio >= GROWTH_ALERT_RATIO:
            score = min(100.0, score * 1.15)
        if is_flicker_verified is False:
            # 오탐 의심 신호가 나오면 점수를 낮춰 신중하게 반영한다(완전히 0으로 지우진 않음 -
            # YOLO 자체는 임계값을 넘겼으므로, 사람의 최종 판단을 위한 정보는 남겨둔다).
            score *= 0.5

        return min(100.0, score)

    @staticmethod
    def _level_for_score(score: float) -> str:
        if score >= DANGER_SCORE_CRITICAL:
            return "CRITICAL"
        if score >= DANGER_SCORE_DANGER:
            return "DANGER"
        if score >= DANGER_SCORE_WARNING:
            return "WARNING"
        return "SAFE"
