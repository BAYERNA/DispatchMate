#!/usr/bin/env bash
set -euo pipefail
port="${MOCK_GATEWAY_PORT:-4010}"
node "$(dirname "$0")/mock-operations-gateway.mjs" > /tmp/dispatchmate-mock-gateway.log 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do curl -fsS -X POST -H 'Content-Type: application/json' -d '{"probe":true}' "http://127.0.0.1:${port}/push" >/dev/null && break; sleep 0.1; done
for path in sms voice interagency route; do curl -fsS -X POST -H 'Content-Type: application/json' -d '{"probe":true}' "http://127.0.0.1:${port}/${path}" >/dev/null; done
test "$(wc -l < /tmp/dispatchmate-mock-gateway.log)" -ge 6
printf 'PASS: mock push/SMS/voice/interagency/route gateway\n'
