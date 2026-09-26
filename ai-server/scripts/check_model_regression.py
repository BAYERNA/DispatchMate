#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Fail when candidate model metrics regress beyond policy")
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--tolerance", type=float, default=0.02)
    args = parser.parse_args()
    candidate = json.loads(args.candidate.read_text())["metrics"]
    baseline = json.loads(args.baseline.read_text())["metrics"]
    failures = [
        f"{metric}: {candidate[metric]:.4f} < {value - args.tolerance:.4f}"
        for metric, value in baseline.items()
        if metric in candidate and candidate[metric] < value - args.tolerance
    ]
    if failures:
        raise SystemExit("Model regression detected\n" + "\n".join(failures))
    print("Model regression gate: PASS")


if __name__ == "__main__":
    main()
