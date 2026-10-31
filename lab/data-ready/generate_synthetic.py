#!/usr/bin/env python3
"""Generate clearly marked synthetic transactions for testing ONLY.

Not a source of real car prices. Reproducible with stdlib Python.
"""
import argparse
import json
import random
from datetime import date, timedelta
from pathlib import Path


def build(seed=20261031):
    rand = random.Random(seed)
    records = []
    origin = date(2025, 10, 1)
    cohort_specs = [
        ("日産", "ノート", "X", "愛知県", "retail_closed_sale", 1450000, 135),
        ("日産", "ノート", "X", "愛知県", "dealer_auction_closed", 1130000, 135),
        ("日産", "セレナ", "ハイウェイスター", "東京都", "retail_closed_sale", 2450000, 115),
    ]
    for maker, model, grade, region, market, base, count in cohort_specs:
        for i in range(count):
            when = origin + timedelta(days=i * 2)
            year = rand.choice([2020, 2021, 2022, 2023, 2024, 2025])
            km = rand.randrange(8000, 78000, 1000)
            age = when.year - year
            noise = rand.randint(-38000, 38000)
            # Latent synthetic ground-truth is not used by the evaluator.
            price = int(base - age * 64000 - km * 1.4 - i * 520 + noise)
            records.append({
                "id": f"synthetic-{len(records):04d}",
                "maker": maker, "model": model, "grade": grade, "region": region,
                "year": year, "mileage_km": km, "date": when.isoformat(),
                "price_jpy": max(200000, price),
                "market_type": market,
                "source": "GENERATED_SYNTHETIC_NOT_REAL",
                "license_status": "synthetic",
            })
    for i in range(20):
        records.append({
            "id": f"synthetic-listing-{i:04d}",
            "maker": "日産", "model": "ノート", "grade": "X", "region": "愛知県",
            "year": 2022, "mileage_km": 30000, "date": (origin+timedelta(days=i*3)).isoformat(),
            "price_jpy": 9999999,
            "market_type": "retail_listing", "source": "SYNTHETIC_DISTRACTOR",
            "license_status": "synthetic",
        })
    return {
        "notice": "全レコードが人工生成。実際の車両、価格、流通市場と無関係。精度評価は動作テスト専用。",
        "datasets": [{"dataset": "market", "records": records}],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, help="LOCAL output path only")
    args = parser.parse_args()
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated synthetic fixture at {destination}")


if __name__ == "__main__":
    main()
