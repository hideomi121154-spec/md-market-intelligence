"""Refresh permitted public datasets independently and publish a transparent health manifest.

No login-based scraping, no guesswork, no changes to the user's browser/IndexedDB data.
A failed fetch restores its previous file bytes. Each source has its own schedule.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
STATUS_FILE = DATA / "refresh_status.json"

# Source ID, UI title, JSON path, command, cadence, suggested upper age in days.
# Static/manual datasets are *never* described as automatically refreshed.
SOURCES = [
    ("uss", "USS公式オークション市場統計", "uss_monthly.json", "fetch_uss_monthly.py", "daily", 42),
    ("kei_sales", "軽乗用車・車名別新車販売", "model_sales.json", "fetch_model_sales.py", "daily", 42),
    ("registered_sales", "登録乗用車・車名別新車販売", "registered_sales.json", "fetch_registered_sales.py", "daily", 42),
    ("jobs", "47都道府県・新規求人数", "prefecture_jobs.json", "fetch_prefecture_jobs.py", "weekly", 55),
    ("migration", "47都道府県・国内人口移動", "prefecture_migration.json", "fetch_population_migration.py", "weekly", 55),
    ("registered_history", "登録乗用車・年次販売推移", "registered_annual_history.json", "fetch_registered_annual.py", "monthly", 400),
    ("kei_history", "軽乗用車・年次販売推移", "kei_annual_history.json", "fetch_kei_history.py", "monthly", 400),
    ("fault_news", "故障関連ニュース・公開見出し", "fault-research-index.json", "update_fault_research.py", "weekly", 21),
    ("estat_exports", "政府統計・中古車輸出HS別", "estat_used_vehicle_exports.json", "fetch_estat_used_car_exports.py", "daily", 65),
]
MANUAL = [
    ("demand_rankings", "問い合わせ・閲覧ランキング", "demand_rankings.json", "転載許諾を含む取得元契約が未設定"),
    ("regional_job_ads", "媒体別・地域求人広告", "regional_job_ads.json", "公表資料の自動取得と検証が未実装"),
    ("overseas_snapshot", "海外輸出市場スナップショット", "overseas-export-snapshot.json", "公開資料の保存版・自動取得未実装"),
    ("export_model_catalog", "国別・車種別輸出候補", "export-model-catalog.json", "参照用カタログでありライブ統計ではない"),
    ("russia_yaris", "ロシア・ヤリス出典一覧", "russia-yaris-sources.json", "調査用の出典一覧・自動同期未実装"),
    ("registered_2021", "2021年登録乗用車参考系列", "registered_annual_2021_reference.json", "過去の固定参考資料であり自動補正しない"),
]
OUTPUTS = {"uss": ["uss_monthly.json", "uss_source_status.json"]}
MAX_SECONDS = 190


def read_payload(filename):
    try:
        data = json.loads((DATA / filename).read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def newest_month(payload):
    direct = payload.get("month")
    if isinstance(direct, str) and re.fullmatch(r"20\d\d-(0[1-9]|1[0-2])", direct):
        return direct
    items = payload.get("months") or []
    if not isinstance(items, list):
        return None
    values = []
    for item in items:
        m = item.get("month") if isinstance(item, dict) else item
        if isinstance(m, str) and re.fullmatch(r"20\d\d-(0[1-9]|1[0-2])", m):
            values.append(m)
    return max(values) if values else None


def newest_timestamp(payload):
    for key in ("checked_at_utc", "updated_at", "published_on"):
        value = payload.get(key)
        if isinstance(value, str):
            try:
                date = datetime.fromisoformat(value.replace("Z", "+00:00"))
                return date.astimezone(timezone.utc).isoformat() if date.tzinfo else date.replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                pass
    return None


def inspect(entry, run, now):
    sid, title, filename, _command, cadence, max_age = entry
    payload = read_payload(filename)
    checked = newest_timestamp(payload)
    period = newest_month(payload)
    configured = sid != "estat_exports" or payload.get("status") != "not_configured"
    has_data = bool(payload) and configured
    age_days = None
    if checked:
        age_days = max(0, (now - datetime.fromisoformat(checked)).days)
    stale = age_days is not None and age_days > max_age
    # By mid-month, the last month's national monthly aggregate should generally
    # exist; this is a *warning*, never a claim about source publication timing.
    if period and cadence == "daily" and now.day >= 11:
        expected_year, expected_month = now.year, now.month - 1
        if expected_month == 0:
            expected_year, expected_month = now.year - 1, 12
        expected = f"{expected_year:04d}-{expected_month:02d}"
        if period < expected:
            stale = True
    current = run.get(sid, {})
    if not configured:
        state = "setup_required"
    elif current.get("result") == "failed":
        state = "failed"
    elif not has_data:
        state = "unavailable"
    elif stale:
        state = "delayed"
    elif current.get("result") in ("updated", "unchanged"):
        state = "ok"
    elif checked:
        state = "available"
    else:
        state = "unknown"
    return {
        "id": sid, "title": title, "file": "data/" + filename,
        "mode": "automatic", "cadence": cadence, "state": state,
        "latest_month": period, "source_checked_at_utc": checked,
        "age_days": age_days, "run": current.get("result", "not_run"),
        "message": current.get("message", ""),
        "source_url": payload.get("source_url") if isinstance(payload.get("source_url"), str) else None,
        "requires_setup": not configured,
    }


def should_run(cadence, now, force):
    return bool(force or cadence == "daily"
                or (cadence == "weekly" and now.weekday() == 0)
                or (cadence == "monthly" and now.day == 10))


def run_source(sid, filename, command):
    names = OUTPUTS.get(sid, [filename])
    originals = {name: (DATA / name).read_bytes() if (DATA / name).exists() else None for name in names}
    try:
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / command)],
            cwd=ROOT, capture_output=True, text=True, timeout=MAX_SECONDS,
            check=False, env=os.environ.copy(),
        )
        if result.returncode:
            raise RuntimeError((result.stderr or result.stdout or f"exit {result.returncode}")[-400:])
        # JSON must be readable and output must exist, even if the source was unchanged.
        if not read_payload(filename):
            raise ValueError("No valid JSON output")
        changed = any((DATA / name).read_bytes() != before for name, before in originals.items())
        return {"result": "updated" if changed else "unchanged", "message": ""}
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        for name, before in originals.items():
            target = DATA / name
            if before is None:
                target.unlink(missing_ok=True)
            else:
                target.write_bytes(before)
        message = str(exc).replace("\n", " ")
        secret = os.environ.get("ESTAT_APP_ID")
        if secret:
            message = message.replace(secret, "[REDACTED]")
        return {"result": "failed", "message": message[:240]}


def refresh(force=False, status_only=False, now=None):
    now = now or datetime.now(timezone.utc)
    outcomes = {}
    for sid, _title, filename, command, cadence, _days in SOURCES:
        if status_only or not should_run(cadence, now, force):
            outcomes[sid] = {"result": "not_due"}
        elif sid == "estat_exports" and not os.environ.get("ESTAT_APP_ID"):
            outcomes[sid] = {"result": "setup_required", "message": "ESTAT_APP_ID secret 未設定"}
        else:
            outcomes[sid] = run_source(sid, filename, command)
        print(f"{sid}: {outcomes[sid]['result']}", flush=True)
    entries = [inspect(entry, outcomes, now) for entry in SOURCES]
    for sid, title, filename, reason in MANUAL:
        entries.append({
            "id": sid, "title": title, "file": "data/" + filename,
            "mode": "manual", "cadence": "manual", "state": "manual",
            "latest_month": newest_month(read_payload(filename)),
            "source_checked_at_utc": newest_timestamp(read_payload(filename)),
            "run": "not_automated", "message": reason,
        })
    status = {
        "schema_version": 1,
        "generated_at_utc": now.isoformat(),
        "description": "公開許諾のあるデータのみ定期確認。手入力や端末内個人データは自動編集しない。",
        "sources": entries,
    }
    DATA.mkdir(exist_ok=True, parents=True)
    STATUS_FILE.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return status


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Run weekly/monthly sources as well")
    parser.add_argument("--status-only", action="store_true", help="Generate status without downloading")
    args = parser.parse_args()
    status = refresh(force=args.force, status_only=args.status_only)
    errors = [x["id"] for x in status["sources"] if x["state"] in ("failed", "delayed", "unavailable")]
    print("Data health warnings:", ", ".join(errors) or "none")


if __name__ == "__main__":
    main()
