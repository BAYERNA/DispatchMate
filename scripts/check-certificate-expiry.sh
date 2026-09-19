#!/usr/bin/env bash
set -euo pipefail

warning_days="${CERTIFICATE_WARNING_DAYS:-30}"
status=0
if [[ "$#" -eq 0 ]]; then
  echo "Usage: $0 certificate.pem [certificate.pem ...]" >&2
  exit 2
fi
for certificate in "$@"; do
  if [[ ! -r "$certificate" ]]; then
    echo "FAIL: unreadable certificate: $certificate"
    status=1
    continue
  fi
  seconds=$((warning_days * 86400))
  if openssl x509 -checkend "$seconds" -noout -in "$certificate" >/dev/null; then
    expiry="$(openssl x509 -enddate -noout -in "$certificate" | cut -d= -f2-)"
    echo "PASS: $certificate expires $expiry"
  else
    echo "FAIL: $certificate expires within $warning_days days or is invalid"
    status=1
  fi
done
exit "$status"
