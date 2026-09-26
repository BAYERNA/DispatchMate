from pathlib import Path

import pytest

from app.evaluation.dataset_manifest import DatasetFile, DatasetManifest, sha256_file, verify_dataset
from app.evaluation.metrics import calculate_binary_metrics


def test_calculates_precision_recall_f1_and_confusion_matrix():
    metrics = calculate_binary_metrics([True, True, False, False], [True, False, True, False])
    assert metrics.precision == pytest.approx(0.5)
    assert metrics.recall == pytest.approx(0.5)
    assert metrics.f1 == pytest.approx(0.5)
    assert (metrics.true_positive, metrics.false_positive, metrics.false_negative, metrics.true_negative) == (1, 1, 1, 1)


def test_verifies_versioned_dataset_checksum(tmp_path: Path):
    sample = tmp_path / "sample.txt"
    sample.write_text("fire")
    manifest = DatasetManifest(
        name="test", version="1", license="CC BY 4.0", source="unit-test", yolo_data_yaml="data.yaml",
        files=[DatasetFile(path="sample.txt", sha256=sha256_file(sample), split="test")],
    )
    assert verify_dataset(manifest, tmp_path) == {"train": 0, "validation": 0, "test": 1}
