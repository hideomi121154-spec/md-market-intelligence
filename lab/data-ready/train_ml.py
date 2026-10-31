#!/usr/bin/env python3
"""Experimental, dependency-free supervised price model.

The model is fitted only on transaction-closed prices. It strictly separates:
* retail closed sales / dealer auction closes (different prediction targets)
* synthetic / self-declared authorized data
* distinct vehicle segments and optional regions
* chronological train / calibration / untouched test periods.

It does NOT establish production predictive performance or legal data rights.
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
from datetime import date
from pathlib import Path

SUPPORTED_MARKETS = ("retail_closed_sale", "dealer_auction_closed")
FEATURES = ("vehicle_age_years", "mileage_10k_km", "months_since_first_train")
SCHEMA_VERSION = "price-ml-lab-v0.2"


def load_rows(file_path):
    payload = json.loads(Path(file_path).read_text(encoding="utf-8"))
    docs = payload.get("datasets", []) if isinstance(payload, dict) and "datasets" in payload else [payload]
    if not isinstance(docs, list):
        raise ValueError("datasets must be a list")
    market_docs = [d for d in docs if isinstance(d, dict) and d.get("dataset") == "market"]
    if len(market_docs) != 1 or not isinstance(market_docs[0].get("records"), list):
        raise ValueError("One market dataset with records list is required")
    records = market_docs[0]["records"]
    ids = set()
    for row in records:
        if not isinstance(row, dict):
            raise ValueError("Invalid row")
        required = ("id", "maker", "model", "grade", "date", "year", "mileage_km",
                    "price_jpy", "market_type", "source", "license_status")
        if any(key not in row for key in required):
            raise ValueError("Missing required fields")
        if any(not isinstance(row[key], str) or not row[key].strip()
               for key in ("id", "maker", "model", "grade", "source", "market_type")):
            raise ValueError("Invalid text field")
        if row["id"] in ids:
            raise ValueError("Duplicate market record id")
        ids.add(row["id"])
        if row["license_status"] not in ("synthetic", "authorized"):
            raise ValueError("Unknown license_status")
        if type(row["year"]) is not int or not (1980 <= row["year"] <= 2100):
            raise ValueError("Invalid model year")
        if type(row["mileage_km"]) is not int or not (0 <= row["mileage_km"] <= 2_000_000):
            raise ValueError("Invalid mileage")
        if type(row["price_jpy"]) is not int or not (0 < row["price_jpy"] <= 1_000_000_000):
            raise ValueError("Invalid price")
        observation_date = date.fromisoformat(row["date"])
        if row["year"] > observation_date.year:
            raise ValueError("Model year cannot be in the future relative to transaction")
        if "region" in row and (not isinstance(row["region"], str) or not row["region"].strip()):
            raise ValueError("Region, if present, must be non-empty")
    return records


def cohort_key(row):
    return (row["maker"], row["model"], row["grade"], row.get("region", ""))


def vector(row, anchor):
    day = date.fromisoformat(row["date"])
    # Sale date features are known at training observation time. At inference,
    # only supply a proposed valuation date, never a future realized price.
    age = (day.year - row["year"]) + (day.timetuple().tm_yday - 1) / 365.25
    return (age, row["mileage_km"] / 10_000, (day - anchor).days / 30.4375)


def solve(a, b):
    """Small regularized linear system; Gaussian elimination with pivoting."""
    n = len(b)
    mat = [list(a[i]) + [b[i]] for i in range(n)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda row: abs(mat[row][col]))
        if abs(mat[pivot][col]) < 1e-12:
            raise ValueError("Singular normal equation")
        mat[pivot], mat[col] = mat[col], mat[pivot]
        scale = mat[col][col]
        for j in range(col, n + 1):
            mat[col][j] /= scale
        for row in range(n):
            if row == col:
                continue
            factor = mat[row][col]
            for j in range(col, n + 1):
                mat[row][j] -= factor * mat[col][j]
    return [mat[i][-1] for i in range(n)]


def train_ridge(train, penalty=8.0):
    """Ridge on centered/scaled features, target in 10,000 yen."""
    if len(train) < 30:
        raise ValueError("At least 30 training sales required")
    anchor = date.fromisoformat(train[0]["date"])
    raw = [vector(r, anchor) for r in train]
    means = [statistics.mean(v[j] for v in raw) for j in range(3)]
    scales = [max(statistics.pstdev(v[j] for v in raw), 1.0) for j in range(3)]
    x = [[(v[j] - means[j]) / scales[j] for j in range(3)] for v in raw]
    ys = [r["price_jpy"] / 10_000 for r in train]
    target_mean = statistics.mean(ys)
    gram = [[sum(v[i] * v[j] for v in x) + (penalty if i == j else 0.0)
             for j in range(3)] for i in range(3)]
    rhs = [sum(v[j] * (y - target_mean) for v, y in zip(x, ys))
           for j in range(3)]
    beta = solve(gram, rhs)
    return {
        "method": "ridge_linear_regression",
        "features": list(FEATURES),
        "anchor_date": anchor.isoformat(),
        "mean": means,
        "scale": scales,
        "coefficient_man_yen": beta,
        "intercept_man_yen": target_mean,
        "penalty": penalty,
        "min_training_date": train[0]["date"],
        "max_training_date": train[-1]["date"],
        "training_size": len(train),
    }


def predict(model, row):
    anchor = date.fromisoformat(model["anchor_date"])
    x = vector(row, anchor)
    y = model["intercept_man_yen"] + sum(
        (x[j] - model["mean"][j]) / model["scale"][j]
        * model["coefficient_man_yen"][j]
        for j in range(3)
    )
    return max(0.0, y * 10_000)


def split_by_date(rows):
    ordered = sorted(rows, key=lambda r: (r["date"], r["id"]))
    dates = sorted({r["date"] for r in ordered})
    if len(ordered) < 60 or len(dates) < 30:
        return None
    train_cut = dates[int(len(dates) * 0.60) - 1]
    cal_cut = dates[int(len(dates) * 0.80) - 1]
    train = [r for r in ordered if r["date"] <= train_cut]
    calibration = [r for r in ordered if train_cut < r["date"] <= cal_cut]
    test = [r for r in ordered if r["date"] > cal_cut]
    if len(train) < 30 or len(calibration) < 10 or len(test) < 10:
        return None
    return train, calibration, test


def conformal_q(residuals, confidence=0.90):
    """Finite-sample split-conformal absolute residual bound.
    Exchangeability is not guaranteed under drift; do NOT claim 90% coverage.
    """
    errors = sorted(residuals)
    index = math.ceil((len(errors) + 1) * confidence)
    if index > len(errors):
        return None
    return errors[index - 1]


def metrics(actual, predicted):
    if not actual:
        return None
    errors = [abs(a - p) for a, p in zip(actual, predicted)]
    return {
        "mae_jpy": round(statistics.mean(errors)),
        "median_absolute_error_jpy": round(statistics.median(errors)),
        "mape_percent": round(100 * statistics.mean(e / a for e, a in zip(errors, actual)), 2),
        "count": len(actual),
    }


def evaluate_cohort(rows, market_type, segment):
    splits = split_by_date(rows)
    info = {
        "market_type": market_type,
        "segment": {
            "maker": segment[0], "model": segment[1], "grade": segment[2],
            "region": segment[3] or None,
        },
        "records": len(rows),
    }
    if splits is None:
        return dict(info, status="insufficient_history",
                    message="Need 60+ transactions, 30+ unique dates, 30/10/10 train/calibration/test rows")
    train, calibration, test = splits
    model = train_ridge(train)
    train_median = statistics.median(r["price_jpy"] for r in train)
    cal_actual = [r["price_jpy"] for r in calibration]
    test_actual = [r["price_jpy"] for r in test]
    model_cal = [predict(model, r) for r in calibration]
    model_test = [predict(model, r) for r in test]
    baseline_test = [train_median] * len(test)
    q = conformal_q([abs(a - p) for a, p in zip(cal_actual, model_cal)])
    intervals = None if q is None else [
        [max(0.0, p - q), p + q] for p in model_test
    ]
    coverage = None if intervals is None else round(
        sum(lo <= a <= hi for a, (lo, hi) in zip(test_actual, intervals)) / len(test), 4
    )
    return dict(info,
        status="evaluated_experiment_only",
        periods={
            "train": {"first": train[0]["date"], "last": train[-1]["date"], "n": len(train)},
            "calibration": {"first": calibration[0]["date"], "last": calibration[-1]["date"],
                            "n": len(calibration)},
            "test": {"first": test[0]["date"], "last": test[-1]["date"], "n": len(test)},
        },
        baseline={"method": "training_median_only", "metrics": metrics(test_actual, baseline_test)},
        ridge={"method": "ridge_linear_regression", "metrics": metrics(test_actual, model_test),
               "calibration_residual_q_jpy": None if q is None else round(q),
               "observed_test_coverage": coverage,
               "interval_label": "experimental empirical residual band; no guaranteed coverage"},
        model_artifact={
            **model,
            "market_type": market_type,
            "segment": info["segment"],
            "calibration_residual_q_jpy": None if q is None else round(q),
            "validated_for_real_bidding": False,
        },
        note="This model is trained only on the training period. No holdout prices or labels enter coefficients or calibration."
    )


def evaluate(input_path, market_type="retail_closed_sale"):
    if market_type not in SUPPORTED_MARKETS:
        raise ValueError("Listings and offers are not model targets")
    records = load_rows(input_path)
    selected = [r for r in records if r["market_type"] == market_type]
    if not selected:
        return {
            "schema_version": SCHEMA_VERSION, "status": "no_closed_transactions",
            "market_type": market_type, "cohorts": [], "data_mode": None,
        }
    modes = {r["license_status"] for r in selected}
    if len(modes) != 1:
        raise ValueError("Cannot mix synthetic and self-declared authorized transactions")
    groups = {}
    for r in selected:
        groups.setdefault(cohort_key(r), []).append(r)
    cohorts = [evaluate_cohort(rows, market_type, key) for key, rows in sorted(groups.items())]
    return {
        "schema_version": SCHEMA_VERSION,
        "status": "experimental_only",
        "data_mode": next(iter(modes)),
        "source_rights_verified_by_app": False,
        "market_type": market_type,
        "cohorts": cohorts,
        "warnings": [
            "Synthetic-mode metrics do not represent real market accuracy.",
            "Authorized flag is user-asserted, NOT independently checked.",
            "Do not publish proprietary datasets, trained models or individual private records.",
            "No price or buy-cap recommendation; evaluate by vehicle/grade/region and over future time.",
            "Split-conformal coverage needs exchangeability; nonstationary markets can invalidate bounds.",
            "Even 60 records is far too small for reliable deployment; threshold only exercises the software.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description="Experimental closed transaction price ML laboratory")
    parser.add_argument("input_json", help="Local authorized data JSON or synthetic demo JSON")
    parser.add_argument("--market-type", choices=SUPPORTED_MARKETS, default="retail_closed_sale")
    parser.add_argument("--output", help="Write report JSON to a LOCAL path; do not commit private data")
    args = parser.parse_args()
    result = evaluate(args.input_json, args.market_type)
    content = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        target = Path(args.output)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    print(content, end="")


if __name__ == "__main__":
    main()
