#!/usr/bin/env python3
import argparse
import json
import statistics
import time
from pathlib import Path


def benchmark(model_path: Path, image: Path, runs: int) -> dict[str, float | str]:
    from ultralytics import YOLO

    model = YOLO(str(model_path))
    model.predict(str(image), verbose=False)
    samples = []
    for _ in range(runs):
        started = time.perf_counter()
        model.predict(str(image), verbose=False)
        samples.append((time.perf_counter() - started) * 1000)
    ordered = sorted(samples)
    return {
        "model": str(model_path),
        "meanMs": round(statistics.mean(samples), 2),
        "p95Ms": round(ordered[max(0, int(len(ordered) * 0.95) - 1)], 2),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare PyTorch and ONNX inference latency")
    parser.add_argument("--pytorch", type=Path, required=True)
    parser.add_argument("--onnx", type=Path, required=True)
    parser.add_argument("--image", type=Path, required=True)
    parser.add_argument("--runs", type=int, default=30)
    args = parser.parse_args()
    print(json.dumps([benchmark(args.pytorch, args.image, args.runs), benchmark(args.onnx, args.image, args.runs)], indent=2))


if __name__ == "__main__":
    main()
