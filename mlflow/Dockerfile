# AI 거버넌스 화면의 모델 버전·임계값 관리를 보완하는 실험 트래킹 서버.
# Prometheus/Grafana/Jaeger와 같은 데모 규모용 단일 컨테이너 패턴 — 별도 오브젝트 스토리지 없이
# 로컬 볼륨(sqlite + 파일시스템)만 쓴다.
FROM python:3.11-slim
RUN pip install --no-cache-dir mlflow==3.16.1
EXPOSE 5000
CMD ["mlflow", "server", "--host", "0.0.0.0", "--port", "5000", \
     "--backend-store-uri", "sqlite:////mlflow/mlflow.db", \
     "--default-artifact-root", "/mlflow/artifacts"]
