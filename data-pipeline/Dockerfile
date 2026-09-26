FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DBT_PROFILES_DIR=/app/analytics

WORKDIR /app
COPY analytics/requirements.txt /app/analytics/requirements.txt
COPY data-pipeline/requirements.txt /app/data-pipeline/requirements.txt
RUN pip install --no-cache-dir -r /app/data-pipeline/requirements.txt

COPY analytics /app/analytics
COPY data-pipeline /app/data-pipeline
RUN cp /app/analytics/profiles.example.yml /app/analytics/profiles.yml \
    && chmod +x /app/data-pipeline/run_pipeline.sh \
    && useradd --system --uid 10001 --create-home pipeline \
    && chown -R pipeline:pipeline /app

USER 10001
ENTRYPOINT ["/app/data-pipeline/run_pipeline.sh"]
