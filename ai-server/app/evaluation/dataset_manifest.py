import hashlib
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


class DatasetFile(BaseModel):
    path: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    split: str = Field(pattern=r"^(train|validation|test)$")


class DatasetManifest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    version: str
    license: str
    source: str
    yolo_data_yaml: str = Field(alias="yoloDataYaml")
    files: list[DatasetFile]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_dataset(manifest: DatasetManifest, dataset_root: Path) -> dict[str, int]:
    root = dataset_root.resolve()
    counts = {"train": 0, "validation": 0, "test": 0}
    if not manifest.license.strip() or not manifest.source.strip():
        raise ValueError("Dataset license and source are required")
    for item in manifest.files:
        target = (root / item.path).resolve()
        if root not in target.parents:
            raise ValueError(f"Dataset path escapes root: {item.path}")
        if not target.is_file():
            raise FileNotFoundError(target)
        actual = sha256_file(target)
        if actual != item.sha256:
            raise ValueError(f"Checksum mismatch: {item.path}")
        counts[item.split] += 1
    return counts
