import csv
import gzip
import io
import json
import unittest
from datetime import UTC, date, datetime
from decimal import Decimal

from export_to_s3 import build_archive, checksum, object_keys, upload_encrypted


class FakeS3:
    def __init__(self):
        self.request = None

    def put_object(self, **request):
        self.request = request


class ExportTests(unittest.TestCase):
    def test_archive_is_deterministic_and_serializes_values(self):
        payload, count = build_archive(
            ["metric_date", "average"],
            [(date(2026, 9, 25), Decimal("12.50"))],
        )
        self.assertEqual(1, count)
        rows = list(csv.reader(io.StringIO(gzip.decompress(payload).decode("utf-8"))))
        self.assertEqual([["metric_date", "average"], ["2026-09-25", "12.50"]], rows)
        self.assertEqual(payload, build_archive(["metric_date", "average"], [(date(2026, 9, 25), Decimal("12.50"))])[0])

    def test_object_key_is_date_partitioned(self):
        data, manifest = object_keys("analytics/daily", datetime(2026, 9, 25, 1, 2, 3, tzinfo=UTC))
        self.assertEqual("analytics/daily/year=2026/month=09/day=25/operations-20260925T010203Z.csv.gz", data)
        self.assertTrue(manifest.endswith(".manifest.json"))

    def test_upload_enforces_kms_and_checksum(self):
        client = FakeS3()
        upload_encrypted(
            client,
            bucket="safe-bucket",
            key="data.csv.gz",
            payload=b"payload",
            kms_key_id="kms-key",
            content_type="application/gzip",
        )
        self.assertEqual("aws:kms", client.request["ServerSideEncryption"])
        self.assertEqual("kms-key", client.request["SSEKMSKeyId"])
        self.assertEqual(checksum(b"payload")[1], client.request["ChecksumSHA256"])


if __name__ == "__main__":
    unittest.main()
