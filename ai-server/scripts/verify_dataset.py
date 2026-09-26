#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from app.evaluation.dataset_manifest import DatasetManifest, verify_dataset


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify versioned dataset files and SHA-256 checksums")
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    manifest = DatasetManifest.model_validate_json(args.manifest.read_text(encoding="utf-8"))
    counts = verify_dataset(manifest, args.manifest.parent)
    print(json.dumps({"name": manifest.name, "version": manifest.version, "counts": counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
