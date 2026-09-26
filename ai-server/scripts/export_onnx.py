#!/usr/bin/env python3
import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Export approved YOLO weights to ONNX")
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--dynamic", action="store_true")
    args = parser.parse_args()
    from ultralytics import YOLO

    exported = YOLO(str(args.model)).export(format="onnx", imgsz=args.imgsz, dynamic=args.dynamic, simplify=True)
    print(exported)


if __name__ == "__main__":
    main()
