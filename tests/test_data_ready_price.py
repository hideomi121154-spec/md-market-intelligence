import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "lab" / "data-ready" / "train_price.py"
FIXTURE = ROOT / "lab" / "data-ready" / "sample-data.json"
spec = importlib.util.spec_from_file_location("md_data_ready_price", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TestPriceBaseline(unittest.TestCase):
    def test_synthetic_fixture_evaluation(self):
        report = module.evaluate(FIXTURE)
        self.assertEqual(report["status"], "baseline_evaluated")
        self.assertEqual(report["data_mode"], "synthetic")
        self.assertEqual(report["training"], 6)
        self.assertEqual(report["test"], 2)
        self.assertEqual(report["predictions"], 2)
        self.assertGreater(report["mae_jpy"], 0)
        self.assertLess(report["train_last_date"], report["test_first_date"])

    def test_market_isolation(self):
        self.assertEqual(module.comparable(
            [{"maker": "日産", "model": "ノート", "grade": "X",
              "year": 2022, "mileage_km": 20000, "price_jpy": 1000000},
             {"maker": "トヨタ", "model": "ヤリス", "grade": "X",
              "year": 2022, "mileage_km": 20000, "price_jpy": 9999999}],
            {"maker": "日産", "model": "ノート", "grade": "X",
             "year": 2022, "mileage_km": 20000}), [1000000])


if __name__ == "__main__":
    unittest.main()
