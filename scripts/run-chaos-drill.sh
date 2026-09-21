#!/usr/bin/env bash
set -euo pipefail

target="${CHAOS_TARGET_ENVIRONMENT:-}"
scenario="${CHAOS_SCENARIO:-notification-restart}"
if [[ "$target" != "staging" && "$target" != "sandbox" ]]; then
  echo "Refusing chaos drill: CHAOS_TARGET_ENVIRONMENT must be staging or sandbox" >&2
  exit 2
fi
if [[ "${CHAOS_APPROVED:-false}" != "true" ]]; then
  echo "Refusing chaos drill: set CHAOS_APPROVED=true after change approval" >&2
  exit 2
fi

case "$scenario" in
  notification-restart|database-latency|gateway-timeout) ;;
  *) echo "Unsupported scenario: $scenario" >&2; exit 2 ;;
esac

echo "Chaos drill authorized: environment=$target scenario=$scenario"
echo "This repository provides the safety gate only; the platform-specific runner must execute and collect evidence."
