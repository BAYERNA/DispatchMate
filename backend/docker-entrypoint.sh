#!/bin/sh
set -eu

if [ -n "${OTEL_EXPORTER_OTLP_ENDPOINT:-}" ]; then
  exec java -javaagent:/app/opentelemetry-javaagent.jar -jar /app/app.jar
fi

exec java -jar /app/app.jar
