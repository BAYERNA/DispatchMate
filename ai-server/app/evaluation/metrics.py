from dataclasses import asdict, dataclass
from typing import Iterable


@dataclass(frozen=True)
class DetectionMetrics:
    precision: float
    recall: float
    f1: float
    map50: float
    map50_95: float
    true_positive: int
    false_positive: int
    false_negative: int
    true_negative: int

    def as_dict(self) -> dict[str, float | int]:
        return asdict(self)


def calculate_binary_metrics(
    expected: Iterable[bool], predicted: Iterable[bool], *, map50: float = 0.0, map50_95: float = 0.0
) -> DetectionMetrics:
    pairs = list(zip(expected, predicted, strict=True))
    tp = sum(expected_value and predicted_value for expected_value, predicted_value in pairs)
    fp = sum(not expected_value and predicted_value for expected_value, predicted_value in pairs)
    fn = sum(expected_value and not predicted_value for expected_value, predicted_value in pairs)
    tn = sum(not expected_value and not predicted_value for expected_value, predicted_value in pairs)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return DetectionMetrics(precision, recall, f1, map50, map50_95, tp, fp, fn, tn)


def extract_ultralytics_metrics(result: object) -> dict[str, float]:
    box = getattr(result, "box", None)
    if box is None:
        raise ValueError("Ultralytics validation result does not contain box metrics")
    precision = float(getattr(box, "mp", 0.0))
    recall = float(getattr(box, "mr", 0.0))
    return {
        "precision": precision,
        "recall": recall,
        "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0.0,
        "map50": float(getattr(box, "map50", 0.0)),
        "map50_95": float(getattr(box, "map", 0.0)),
    }
