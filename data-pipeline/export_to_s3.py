"""Export privacy-safe DispatchMate aggregates to an encrypted S3 object."""

from __future__ import annotations

import base64
import csv
import gzip
import hashlib
import io
import json
import os
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any, Iterable, Mapping, Sequence


EXPORT_QUERY = """
select
    metric_date,
    incident_type,
    incident_count,
    closed_incident_count,
    average_resolution_seconds,
    average_first_alert_seconds,
    average_first_ack_seconds,
    alert_count,
    escalated_alert_count,
    danger_sample_count,
    disconnected_sample_count,
    ai_judgment_count,
    average_ai_confidence
from analytics_marts.mart_daily_operations
where metric_date >= %(start_date)s and metric_date < %(end_date)s
order by metric_date, incident_type
"""


@dataclass(frozen=True)
class ExportConfig:
    bucket: str
    kms_key_id: str
    database_url: str
    prefix: str = "analytics/daily-operations"
    lookback_days: int = 7

    @classmethod
    def from_env(cls) -> "ExportConfig":
        missing = [
            name
            for name in ("EXPORT_BUCKET", "EXPORT_KMS_KEY_ID", "DATABASE_URL")
            if not os.getenv(name)
        ]
        if missing:
            raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")
        lookback = int(os.getenv("EXPORT_LOOKBACK_DAYS", "7"))
        if not 1 <= lookback <= 366:
            raise ValueError("EXPORT_LOOKBACK_DAYS must be between 1 and 366")
        return cls(
            bucket=os.environ["EXPORT_BUCKET"],
            kms_key_id=os.environ["EXPORT_KMS_KEY_ID"],
            database_url=os.environ["DATABASE_URL"],
            prefix=os.getenv("EXPORT_PREFIX", "analytics/daily-operations").strip("/"),
            lookback_days=lookback,
        )


def _csv_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value, "f")
    return value


def build_archive(columns: Sequence[str], rows: Iterable[Sequence[Any]]) -> tuple[bytes, int]:
    """Create deterministic UTF-8 CSV gzip bytes and return their row count."""
    raw = io.StringIO(newline="")
    writer = csv.writer(raw, lineterminator="\n")
    writer.writerow(columns)
    count = 0
    for row in rows:
        writer.writerow([_csv_value(value) for value in row])
        count += 1
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb", mtime=0) as compressed:
        compressed.write(raw.getvalue().encode("utf-8"))
    return buffer.getvalue(), count


def object_keys(prefix: str, run_at: datetime) -> tuple[str, str]:
    utc_run = run_at.astimezone(UTC)
    stamp = utc_run.strftime("%Y%m%dT%H%M%SZ")
    base = f"{prefix}/year={utc_run.year:04d}/month={utc_run.month:02d}/day={utc_run.day:02d}"
    return f"{base}/operations-{stamp}.csv.gz", f"{base}/operations-{stamp}.manifest.json"


def checksum(payload: bytes) -> tuple[str, str]:
    digest = hashlib.sha256(payload).digest()
    return digest.hex(), base64.b64encode(digest).decode("ascii")


def upload_encrypted(
    s3_client: Any,
    *,
    bucket: str,
    key: str,
    payload: bytes,
    kms_key_id: str,
    content_type: str,
) -> None:
    _, encoded_checksum = checksum(payload)
    s3_client.put_object(
        Bucket=bucket,
        Key=key,
        Body=payload,
        ContentType=content_type,
        ServerSideEncryption="aws:kms",
        SSEKMSKeyId=kms_key_id,
        ChecksumSHA256=encoded_checksum,
    )


def run_export(config: ExportConfig) -> Mapping[str, Any]:
    import boto3
    import psycopg

    run_at = datetime.now(UTC)
    end_date = run_at.date() + timedelta(days=1)
    start_date = end_date - timedelta(days=config.lookback_days)
    with psycopg.connect(config.database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(EXPORT_QUERY, {"start_date": start_date, "end_date": end_date})
            columns = [column.name for column in cursor.description]
            archive, row_count = build_archive(columns, cursor)

    data_key, manifest_key = object_keys(config.prefix, run_at)
    digest, _ = checksum(archive)
    manifest = {
        "schema_version": 1,
        "dataset": "mart_daily_operations",
        "generated_at": run_at.isoformat(),
        "window": {"start": start_date.isoformat(), "end_exclusive": end_date.isoformat()},
        "row_count": row_count,
        "content_sha256": digest,
        "content_key": data_key,
        "privacy": "aggregated-no-user-or-incident-identifiers",
    }
    manifest_payload = json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode("utf-8")
    s3 = boto3.client("s3", endpoint_url=os.getenv("S3_ENDPOINT_URL") or None)
    upload_encrypted(
        s3,
        bucket=config.bucket,
        key=data_key,
        payload=archive,
        kms_key_id=config.kms_key_id,
        content_type="application/gzip",
    )
    upload_encrypted(
        s3,
        bucket=config.bucket,
        key=manifest_key,
        payload=manifest_payload,
        kms_key_id=config.kms_key_id,
        content_type="application/json",
    )
    return manifest


if __name__ == "__main__":
    print(json.dumps(run_export(ExportConfig.from_env()), ensure_ascii=False, sort_keys=True))
