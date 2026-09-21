#!/usr/bin/env bash
set -euo pipefail

status=0
required=(JWT_SECRET INTERNAL_WEBHOOK_TOKEN INTERNAL_SERVICE_TOKEN POSTGRES_PASSWORD)
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "FAIL: $key is not configured"
    status=1
  fi
done

provider="${SECRET_PROVIDER:-env}"
if [[ "$provider" == "env" ]]; then
  echo "WARN: SECRET_PROVIDER=env; use vault/aws-kms/gcp-kms/azure-key-vault in production"
fi

for key in MTLS_CERT_PATH MTLS_KEY_PATH MTLS_CA_PATH; do
  path="${!key:-}"
  if [[ -z "$path" ]]; then
    echo "WARN: $key is not configured"
  elif [[ ! -r "$path" ]]; then
    echo "FAIL: $key is not readable"
    status=1
  fi
done

if [[ "${SECURITY_FAIL_CLOSED:-true}" != "true" ]]; then
  echo "FAIL: SECURITY_FAIL_CLOSED must be true for production"
  status=1
fi

exit "$status"
