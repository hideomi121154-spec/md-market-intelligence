import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import refresh_all_public_data as sync


class PublicRefreshTest(unittest.TestCase):
    def test_month_and_timestamp_are_based_on_actual_provenance(self):
        self.assertEqual(sync.newest_month({"months": [{"month": "2026-09"}, {"month": "2026-10"}]}), "2026-10")
        self.assertIsNone(sync.newest_month({"months": []}))
        self.assertIsNone(sync.newest_timestamp({"updated_at": {"unknown": True}}))
        self.assertEqual(sync.newest_timestamp({"checked_at_utc": "2026-11-10T00:00:00Z"}), "2026-11-10T00:00:00+00:00")

    def test_scheduling_is_predictable(self):
        monday = datetime(2026, 11, 9, tzinfo=timezone.utc)
        wednesday = datetime(2026, 11, 11, tzinfo=timezone.utc)
        self.assertTrue(sync.should_run("daily", wednesday, False))
        self.assertTrue(sync.should_run("weekly", monday, False))
        self.assertFalse(sync.should_run("weekly", wednesday, False))
        self.assertFalse(sync.should_run("monthly", wednesday, False))
        self.assertTrue(sync.should_run("monthly", wednesday, True))

    def test_failed_source_keeps_last_good_data(self):
        with tempfile.TemporaryDirectory() as folder:
            data = Path(folder) / "data"
            data.mkdir()
            old = {"schema_version": 1, "months": [{"month": "2026-09"}]}
            src = data / "uss_monthly.json"
            src.write_text(json.dumps(old), encoding="utf-8")
            status = data / "uss_source_status.json"
            status.write_text('{"latest_month":"2026-09"}', encoding="utf-8")
            originals = (src.read_bytes(), status.read_bytes())
            with patch.object(sync, "DATA", data), patch.object(sync, "ROOT", Path(folder)):
                with patch.object(sync.subprocess, "run", return_value=Mock(returncode=1, stderr="source format changed", stdout="")):
                    result = sync.run_source("uss", "uss_monthly.json", "fetch_uss_monthly.py")
            self.assertEqual(result["result"], "failed")
            self.assertEqual(src.read_bytes(), originals[0])
            self.assertEqual(status.read_bytes(), originals[1])

    def test_unconfigured_estat_is_not_reported_as_live(self):
        with tempfile.TemporaryDirectory() as folder:
            data = Path(folder)
            (data / "estat_used_vehicle_exports.json").write_text(
                '{"schema_version": 1, "status": "not_configured"}', encoding="utf-8"
            )
            entry = next(x for x in sync.SOURCES if x[0] == "estat_exports")
            with patch.object(sync, "DATA", data):
                report = sync.inspect(entry, {}, datetime(2026, 11, 11, tzinfo=timezone.utc))
            self.assertEqual(report["state"], "setup_required")


if __name__ == "__main__":
    unittest.main()
