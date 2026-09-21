#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

bash -n "$root"/scripts/*.sh
if CHAOS_TARGET_ENVIRONMENT=production CHAOS_APPROVED=true "$root/scripts/run-chaos-drill.sh" >/dev/null 2>&1; then
  echo "FAIL: production chaos gate accepted a forbidden target" >&2
  exit 1
fi
CHAOS_TARGET_ENVIRONMENT=staging CHAOS_APPROVED=true "$root/scripts/run-chaos-drill.sh" >/dev/null

if [[ -n "${PGLITE_ROOT:-}" ]]; then
  (cd "$root/notification-server" && npm run build && node test/delivery-database.mjs)
else
  echo "SKIP: set PGLITE_ROOT to run V1-V13 database scenarios"
fi
echo "PASS: production assurance safety gates"
