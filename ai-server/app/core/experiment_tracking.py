"""AI 거버넌스 화면(ADM-GOV/ADM-OPS)에 모델 버전·임계값 개념은 이미 있지만, "어떤 설정으로
기동됐던 적이 있는지"를 정식으로 기록하는 도구가 없어 수기 관리에 의존했다. MLflow 트래킹
서버에 기동 시점의 모델 설정을 하나의 run으로 남긴다.

mlflow 클라이언트 패키지(mlflow-skinny)는 databricks-sdk 등 무거운 전이 의존성을 끌고 오고,
그 과정에서 이미 설치된 protobuf(OTel이 요구하는 버전)를 낮은 버전으로 끌어내리는 충돌이
있었다 — 이미 의존성으로 갖고 있는 httpx로 MLflow REST API를 직접 호출해 그 문제를 피한다.
MLFLOW_TRACKING_URI가 없거나 서버에 닿지 않아도 경고 로그만 남기고 앱 기동에는 영향 없다.
"""

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

EXPERIMENT_NAME = "faind-fire-detection"


def log_model_startup(params: dict[str, Any]) -> None:
    tracking_uri = os.environ.get("MLFLOW_TRACKING_URI", "").rstrip("/")
    if not tracking_uri:
        return
    try:
        with httpx.Client(base_url=tracking_uri, timeout=3.0) as client:
            experiment_id = _get_or_create_experiment(client)
            run = client.post(
                "/api/2.0/mlflow/runs/create",
                json={"experiment_id": experiment_id, "run_name": "ai-server-startup"},
            )
            run.raise_for_status()
            run_id = run.json()["run"]["info"]["run_id"]
            client.post(
                "/api/2.0/mlflow/runs/log-batch",
                json={
                    "run_id": run_id,
                    "params": [{"key": key, "value": str(value)} for key, value in params.items()],
                },
            ).raise_for_status()
            client.post(
                "/api/2.0/mlflow/runs/update",
                json={"run_id": run_id, "status": "FINISHED"},
            ).raise_for_status()
        logger.info("MLflow에 기동 설정 기록 완료 (run_id=%s)", run_id)
    except Exception as error:  # noqa: BLE001 — 관측용 부가 기능이 앱 기동을 막으면 안 된다.
        logger.warning("MLflow 기록 실패(무시하고 계속 진행): %s", error)


def _get_or_create_experiment(client: httpx.Client) -> str:
    existing = client.get("/api/2.0/mlflow/experiments/get-by-name", params={"experiment_name": EXPERIMENT_NAME})
    if existing.status_code == 200:
        return existing.json()["experiment"]["experiment_id"]
    created = client.post("/api/2.0/mlflow/experiments/create", json={"name": EXPERIMENT_NAME})
    created.raise_for_status()
    return created.json()["experiment_id"]
