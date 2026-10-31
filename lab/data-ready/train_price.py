#!/usr/bin/env python3
"""Price baseline evaluation (NOT a trained AI model). No external dependencies.

Example:
  python lab/data-ready/train_price.py lab/data-ready/sample-data.json
  python lab/data-ready/train_price.py /path/to/authorized-data.json

Never pools listings/auction prices with retail CLOSED sales. Temporal holdout.
"""
import argparse
import json
import math
import statistics
from datetime import date
from pathlib import Path


def documents(payload):
    if isinstance(payload, dict) and isinstance(payload.get("datasets"), list):
        return payload["datasets"]
    return [payload]


def validate_market(row):
    required = ("id", "maker", "model", "grade", "date", "year",
                "mileage_km", "price_jpy", "market_type", "source", "license_status")
    if not isinstance(row, dict) or any(k not in row for k in required):
        raise ValueError("Required fields missing from market record")
    if row["license_status"] not in ("authorized", "synthetic"):
        raise ValueError("Unspecified source permission flag")
    date.fromisoformat(row["date"])
    if type(row["price_jpy"]) is not int or row["price_jpy"] <= 0:
        raise ValueError("Invalid price")
    if type(row["year"]) is not int or not 1980 <= row["year"] <= 2100:
        raise ValueError("Invalid year")
    if type(row["mileage_km"]) is not int or not 0 <= row["mileage_km"] <= 2000000:
        raise ValueError("Invalid distance")


def comparable(train, target):
    return [
        row["price_jpy"] for row in train
        if row["maker"] == target["maker"]
        and row["model"] == target["model"]
        and row["grade"] == target["grade"]
        and abs(row["year"] - target["year"]) <= 2
        and abs(row["mileage_km"] - target["mileage_km"]) <= 30000
    ]


def evaluate(path):
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    docs = documents(payload)
    market = next((doc for doc in docs if doc.get("dataset") == "market"), None)
    if not market or not isinstance(market.get("records"), list):
        raise ValueError("A market dataset with records array is required")
    ids = set()
    for r in market["records"]:
        validate_market(r)
        if r["id"] in ids:
            raise ValueError("Duplicate market id")
        ids.add(r["id"])
    sold = [r for r in market["records"] if r["market_type"] == "retail_closed_sale"]
    if len(sold) < 8:
        return {"status": "insufficient", "reason": "Need at least 8 retail closed-sales records",
                "records": len(sold)}
    modes = {r["license_status"] for r in sold}
    if len(modes) != 1:
        raise ValueError("Do not mix synthetic and authorized data")
    sold.sort(key=lambda x: (x["date"], x["id"]))
    split = len(sold) - max(2, math.ceil(len(sold)*0.25))
    train, test = sold[:split], sold[split:]
    actual, predicted = [], []
    for row in test:
        cases = comparable(train, row)
        if len(cases) < 3:
            continue
        actual.append(row["price_jpy"])
        predicted.append(statistics.median(cases))
    if not actual:
        return {"status": "insufficient_comparables", "training": len(train),
                "test": len(test), "predictions": 0, "note": "Cannot evaluate with these segments"}
    errors = [abs(a-p) for a,p in zip(actual,predicted)]
    return {
        "status": "baseline_evaluated",
        "data_mode": next(iter(modes)),
        "method": "past comparable retail closed-sale median, no ML",
        "training": len(train),
        "test": len(test),
        "predictions": len(actual),
        "coverage": round(len(actual)/len(test), 4),
        "mae_jpy": round(statistics.mean(errors)),
        "median_ae_jpy": round(statistics.median(errors)),
        "mape_percent": round(statistics.mean(e/a for e,a in zip(errors,actual))*100, 2),
        "train_last_date": train[-1]["date"],
        "test_first_date": test[0]["date"],
        "limitations": [
            "Temporal holdout is NOT a production accuracy guarantee",
            "Requires far more independent observations per model/grade/region",
            "Final retail sale prices and dealer auction closes are different targets",
            "No image grading, options, region effects, or future demand model yet",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("json_file", help="Local data package (synthetic or authorized)")
    args = parser.parse_args()
    print(json.dumps(evaluate(args.json_file), ensure_ascii=False, indent=2))
