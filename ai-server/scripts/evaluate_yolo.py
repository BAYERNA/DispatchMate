#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from app.evaluation.dataset_manifest import DatasetManifest, verify_dataset
from app.evaluation.metrics import extract_ultralytics_metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate fire/smoke YOLO weights on a versioned test split")
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("evaluation/results/latest.json"))
    parser.add_argument("--mlflow-uri")
    parser.add_argument("--experiment", default="dispatchmate-fire-smoke")
    args = parser.parse_args()

    manifest = DatasetManifest.model_validate_json(args.manifest.read_text(encoding="utf-8"))
    counts = verify_dataset(manifest, args.manifest.parent)
    from ultralytics import YOLO

    result = YOLO(str(args.model)).val(
        data=str((args.manifest.parent / manifest.yolo_data_yaml).resolve()), split="test", plots=True
    )
    metrics = extract_ultralytics_metrics(result)
    payload = {"dataset": {"name": manifest.name, "version": manifest.version, "counts": counts}, "metrics": metrics}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.mlflow_uri:
        import mlflow

        mlflow.set_tracking_uri(args.mlflow_uri)
        mlflow.set_experiment(args.experiment)
        with mlflow.start_run():
            mlflow.log_params({"model": args.model.name, "dataset_version": manifest.version})
            mlflow.log_metrics(metrics)
            mlflow.log_artifact(str(args.manifest), artifact_path="dataset")
            mlflow.log_artifact(str(args.output), artifact_path="evaluation")
            mlflow.log_artifact(str(args.model), artifact_path="model")
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
