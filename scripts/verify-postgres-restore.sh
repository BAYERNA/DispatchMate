#!/usr/bin/env bash
set -euo pipefail
: "${BACKUP_ARCHIVE:?Set BACKUP_ARCHIVE to a .dump file}"
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to an isolated disposable verification database}"
: "${ALLOW_RESTORE_TEST:?Set ALLOW_RESTORE_TEST=YES after verifying the target is disposable}"
if [[ "$ALLOW_RESTORE_TEST" != "YES" ]]; then echo "Restore verification was not authorized" >&2; exit 2; fi
sha256sum --check "$BACKUP_ARCHIVE.sha256"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$BACKUP_ARCHIVE"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT version, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT count(*) AS incidents FROM incidents;"
