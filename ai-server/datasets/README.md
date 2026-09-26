# Versioned fire/smoke datasets

Raw images and labels are intentionally not committed. Copy `manifest.example.json`, list every image/label
with its SHA-256, record the source and license, and point `yoloDataYaml` to the Ultralytics dataset YAML.
The verification command rejects missing files, checksum changes, path traversal, and missing provenance.

```bash
python scripts/verify_dataset.py datasets/fire-smoke/manifest.json
python scripts/evaluate_yolo.py --model models/fire_yolov8.pt \
  --manifest datasets/fire-smoke/manifest.json --mlflow-uri http://localhost:5000
```
