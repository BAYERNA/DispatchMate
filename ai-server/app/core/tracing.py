"""OpenTelemetry 분산 트레이싱 부트스트랩.

OTEL_EXPORTER_OTLP_ENDPOINT가 없거나(로컬 개발 등) 수집기가 안 떠 있어도 BatchSpanProcessor의
백그라운드 스레드에서 익스포트만 조용히 실패할 뿐(WARN 로그), FastAPI 요청 처리나 앱 기동을
막지 않는다 — Java(backend)/Node(notification-server)와 동일하게 안전한-기본값 동작이다.
"""

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def setup_tracing(app) -> None:
    provider = TracerProvider(resource=Resource.create({SERVICE_NAME: "faind-ai-server"}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)
