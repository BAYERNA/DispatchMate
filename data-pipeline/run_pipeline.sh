#!/usr/bin/env sh
set -eu

dbt build --project-dir /app/analytics --profiles-dir /app/analytics
python /app/data-pipeline/export_to_s3.py
