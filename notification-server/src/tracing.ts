import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { NodeSDK } from '@opentelemetry/sdk-node'

// main.ts의 가장 첫 import라야 한다 — http/express 등을 계측(monkey-patch)하는 시점이
// 그 모듈들이 require되기 전이어야 하기 때문이다. OTEL_EXPORTER_OTLP_ENDPOINT가 없거나
// 수집기가 안 떠 있어도 익스포터가 백그라운드에서 조용히 실패할 뿐 앱 기동을 막지 않는다
// (backend/ai-server와 동일한 안전한-기본값 동작).
const sdk = new NodeSDK({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'faind-notification-server' }),
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
})

sdk.start()

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0))
})
