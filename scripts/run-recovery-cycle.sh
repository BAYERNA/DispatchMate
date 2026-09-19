#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
: "${BACKUP_OUTPUT_DIR:?Set BACKUP_OUTPUT_DIR to protected storage}"
archive="$(DATABASE_URL="$DATABASE_URL" BACKUP_OUTPUT_DIR="$BACKUP_OUTPUT_DIR" "$(dirname "$0")/backup-postgres.sh")"
if [[ "${RUN_RESTORE_VERIFICATION:-NO}" == "YES" ]]; then
  : "${RESTORE_DATABASE_URL:?Set an isolated disposable RESTORE_DATABASE_URL}"
  BACKUP_ARCHIVE="$archive" RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" ALLOW_RESTORE_TEST=YES \
    "$(dirname "$0")/verify-postgres-restore.sh"
fi
find "$BACKUP_OUTPUT_DIR" -type f -name 'dispatchmate-*' -mtime "+${BACKUP_RETENTION_DAYS:-30}" -print
printf 'Backup complete: %s\n' "$archive"
