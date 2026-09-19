#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the source PostgreSQL connection string}"
backup_dir="${BACKUP_OUTPUT_DIR:-./backups}"
mkdir -p "$backup_dir"
umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$backup_dir/dispatchmate-$stamp.dump"
pg_dump --format=custom --no-owner --no-acl --file="$archive" "$DATABASE_URL"
sha256sum "$archive" > "$archive.sha256"
pg_restore --list "$archive" > "$archive.manifest"
printf '%s\n' "$archive"
