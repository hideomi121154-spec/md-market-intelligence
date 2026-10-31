"""Regression tests for experimental price ML. No external dependencies."""
import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT / "lab" / "data-ready"


def load_python(name, filename):
    spec = importlib.util.spec_from_file_location(name, LAB / filename)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


ml = load_python("data_ready_ml", "train_ml.py")
generator = load_python("data_ready_generator", "generate_synthetic.py")


class TestDataReadyML(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = generator.build()

    def with_json(self, doc, fn, market="retail_closed_sale"):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "market.json"
            path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
            return fn(path, market)

    def test_synthetic_retail_model_and_auction_separation(self):
        out = self.with_json(self.payload, ml.evaluate)
        self.assertEqual(out["data_mode"], "synthetic")
        self.assertEqual(out["market_type"], "retail_closed_sale")
        self.assertEqual(len(out["cohorts"]), 2)
        for c in out["cohorts"]:
            self.assertEqual(c["status"], "evaluated_experiment_only")
            self.assertLess(c["periods"]["train"]["last"], c["periods"]["calibration"]["first"])
            self.assertLess(c["periods"]["calibration"]["last"], c["periods"]["test"]["first"])
            self.assertGreater(c["ridge"]["metrics"]["count"], 9)
            self.assertGreaterEqual(c["ridge"]["metrics"]["mae_jpy"], 0)
            self.assertFalse(c["model_artifact"]["validated_for_real_bidding"])
        auction = self.with_json(self.payload, ml.evaluate, market="dealer_auction_closed")
        self.assertEqual(len(auction["cohorts"]), 1)
        self.assertEqual(auction["cohorts"][0]["records"], 135)

    def test_listing_outlier_cannot_affect_retail_training(self):
        original = self.with_json(self.payload, ml.evaluate)
        modified = copy.deepcopy(self.payload)
        for r in modified["datasets"][0]["records"]:
            if r["market_type"] == "retail_listing":
                r["price_jpy"] = 1000000000
        changed = self.with_json(modified, ml.evaluate)
        self.assertEqual(original, changed)

    def test_test_labels_cannot_affect_training_or_calibration(self):
        original = self.with_json(self.payload, ml.evaluate)
        changed = copy.deepcopy(self.payload)
        for r in changed["datasets"][0]["records"]:
            if (r["market_type"] == "retail_closed_sale" and r["model"] == "ノート"
                    and r["date"] > "2026-05-01"):
                r["price_jpy"] += 400000
        out = self.with_json(changed, ml.evaluate)
        old = next(c for c in original["cohorts"] if c["segment"]["model"] == "ノート")
        new = next(c for c in out["cohorts"] if c["segment"]["model"] == "ノート")
        self.assertEqual(old["model_artifact"], new["model_artifact"])
        self.assertNotEqual(old["ridge"]["metrics"], new["ridge"]["metrics"])

    def test_no_mixing_synthetic_and_authorized(self):
        mixed = copy.deepcopy(self.payload)
        mixed["datasets"][0]["records"][0]["license_status"] = "authorized"
        with self.assertRaisesRegex(ValueError, "mix synthetic"):
            self.with_json(mixed, ml.evaluate)

    def test_only_listing_cannot_train(self):
        only_listing = {"dataset": "market", "records": [
            r for r in self.payload["datasets"][0]["records"]
            if r["market_type"] == "retail_listing"
        ]}
        result = self.with_json(only_listing, ml.evaluate)
        self.assertEqual(result["status"], "no_closed_transactions")

    def test_small_set_abstains(self):
        small = {"dataset": "market", "records": [
            r for r in self.payload["datasets"][0]["records"]
            if r["market_type"] == "retail_closed_sale" and r["model"] == "ノート"
        ][:10]}
        result = self.with_json(small, ml.evaluate)
        self.assertEqual(result["cohorts"][0]["status"], "insufficient_history")

    def test_no_duplicate_ids_or_invalid_future_year(self):
        duplicate = copy.deepcopy(self.payload)
        rows = duplicate["datasets"][0]["records"]
        rows[1]["id"] = rows[0]["id"]
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.with_json(duplicate, ml.evaluate)
        invalid = copy.deepcopy(self.payload)
        invalid["datasets"][0]["records"][0]["year"] = 2030
        with self.assertRaisesRegex(ValueError, "future"):
            self.with_json(invalid, ml.evaluate)

    def test_confidence_quantile(self):
        self.assertEqual(ml.conformal_q(list(range(1, 20)), 0.9), 18)
        self.assertIsNone(ml.conformal_q([1, 2, 3], 0.90))


if __name__ == "__main__":
    unittest.main()
