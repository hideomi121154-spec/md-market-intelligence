#!/usr/bin/env python3
"""Fetch Japan's official 2026 used passenger-car exports by destination and HS code.

Uses ONLY the registered e-Stat government API and Python standard library.
No API ID is embedded in the repository, public URL or exported JSON.

The source is National / Commodity-by-country / Exports (品別国別表 輸出).
Cat01: 9-digit export HS code; cat02: monthly quantity-1; area: country.
A 'NO' unit is required. Unpublished and missing cells remain missing.
"""
from __future__ import annotations
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "estat_used_vehicle_exports.json"
BASE = "https://api.e-stat.go.jp/rest/3.0/app/json"
SOURCE_URL = "https://www.e-stat.go.jp/stat-search/database?layout=dataset&result_page=1&toukei=00350300"
YEAR = 2026
MAX_ROWS = 100_000
# Classification reviewed against Japan Customs 2026 export HS Chapter 87.
HS = {
    "870321915": "ガソリン・660cc以下",
    "870321925": "ガソリン・660cc超～1,000cc",
    "870322910": "ガソリン・1,000cc超～1,500cc",
    "870323915": "ガソリン・1,500cc超～2,000cc",
    "870323925": "ガソリン・2,000cc超～3,000cc",
    "870324910": "ガソリン・3,000cc超",
    "870331100": "ディーゼル・1,500cc以下",
    "870332915": "ディーゼル・1,500cc超～2,000cc",
    "870332925": "ディーゼル・2,000cc超～2,500cc",
    "870333910": "ディーゼル・2,500cc超",
    "870340100": "ガソリンHV",
    "870350100": "ディーゼルHV",
    "870360100": "ガソリンPHEV",
    "870370100": "ディーゼルPHEV",
    "870380100": "EV",
    "870390100": "その他の動力",
}
MIN_EXPECTED_CODES = 12
MONTH_CODES = {str(150 + 30 * i): f"{YEAR}-{i+1:02}" for i in range(12)}
SKIP_VALUES = {"", "-", "－", "…", "...", "X", "x", "***"}

def seq(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]

def label(v):
    return str(v.get("$", "") if isinstance(v, dict) else v or "")

def api_json(endpoint, query):
    app_id = query.get("appId")
    if not app_id or len(str(app_id)) < 8:
        raise ValueError("ESTAT_APP_ID が設定されていません")
    url = f"{BASE}/{endpoint}?{urlencode(query)}"
    # Avoid printing the URL or raw exceptions: the URL includes the secret.
    try:
        with urlopen(Request(url, headers={"User-Agent": "MD-MARKET-Official-Statistics/1.0"}), timeout=60) as response:
            if response.status != 200:
                raise RuntimeError("e-Statから正常な応答がありません")
            body = response.read(35_000_000)
        return json.loads(body)
    except Exception as exc:
        raise RuntimeError("e-Stat APIの通信またはJSON解析に失敗しました（IDやURLは表示しません）") from None

def result(payload, root_name):
    block = payload.get(root_name)
    if not isinstance(block, dict):
        raise ValueError(root_name + " が見つかりません")
    status = block.get("RESULT", {}).get("STATUS")
    if str(status) != "0":
        raise ValueError("e-Statの取得結果が成功ではありません。結果コード: " + str(status))
    return block

def suitable_title(s):
    title = re.sub(r"\s+", "", s)
    return "品別国別表" in title and "輸出" in title and (
        "2026" in title or "令和8" in title
    ) and not any(v in title for v in ("税関別", "港別", "航空貨物", "国別品別表", "輸入"))

def find_dataset(app_id):
    """Discover the most recent official 2026 table. Do not use commercial IDs."""
    payload = api_json("getStatsList", dict(appId=app_id, statsCode="00350300",
        surveyYears=str(YEAR), searchWord="品別国別表", searchKind=1, limit=100))
    block = result(payload, "GET_STATS_LIST")
    tables = seq(block.get("DATALIST_INF", {}).get("TABLE_INF"))
    eligible = []
    for t in tables:
        if not isinstance(t, dict):
            continue
        title = label(t.get("TITLE"))
        table_id = str(t.get("@id", ""))
        if not re.fullmatch(r"\d{10}", table_id) or not suitable_title(title):
            continue
        opening = label(t.get("OPEN_DATE"))
        match = re.search(r"1[-〜～](\d{1,2})月", title.replace(" ", ""))
        period = int(match.group(1)) if match else 0
        # Prefer month coverage, then publication date, then stable ID.
        eligible.append((period, opening, table_id, title))
    if not eligible:
        raise ValueError("2026年・全国品別国別表・輸出の公式統計表IDを発見できません")
    chosen = max(eligible)
    return chosen[2], chosen[3]

def class_map(meta, code):
    ci = meta.get("CLASS_INF", {})
    obj = next((x for x in seq(ci.get("CLASS_OBJ"))
        if isinstance(x, dict) and x.get("@id") == code), None)
    if obj is None:
        raise ValueError("メタ情報に分類 "+code+" がありません")
    return {str(x.get("@code")): str(x.get("@name", "")) for x in seq(obj.get("CLASS")) if isinstance(x, dict)}

def validate_metadata(meta, dataset_id):
    inf = meta.get("TABLE_INF")
    if not isinstance(inf, dict):
        raise ValueError("表情報がありません")
    title = label(inf.get("TITLE"))
    if not suitable_title(title):
        raise ValueError("統計表の名称が全国品別国別表（輸出・2026年）と一致しません")
    cat01 = class_map(meta, "cat01")
    cat02 = class_map(meta, "cat02")
    areas = class_map(meta, "area")
    time = class_map(meta, "time")
    absent = sorted(set(HS) - set(cat01))
    if len(HS)-len(absent) < MIN_EXPECTED_CODES:
        raise ValueError("中古乗用車HSコードが不足。改定された可能性があります: "+",".join(absent))
    for code, m in MONTH_CODES.items():
        if cat02.get(code, "") != f"{int(m[5:])}月_数量1":
            raise ValueError("月別数量1カテゴリの定義が違います: "+code)
    if not any("2026" in value for value in time.values()):
        raise ValueError("2026年の時間軸がありません")
    if not areas:
        raise ValueError("輸出先国コードがありません")
    return {code: cat01[code] for code in HS if code in cat01}, areas, time

def normalize_country(name):
    name = re.sub(r"^\d+_", "", name).strip()
    return {"南アフリカ共和国": "南アフリカ",
            "英国": "イギリス", "グルジア": "ジョージア"}.get(name, name)

def parse_values(block, valid_codes, area_names, times, dataset_id):
    values = seq(block.get("STATISTICAL_DATA", {}).get("DATA_INF", {}).get("VALUE"))
    rows = {}
    unit_codes = set()
    for entry in values:
        if not isinstance(entry, dict):
            raise ValueError("統計セルが不正です")
        hs = str(entry.get("@cat01", ""))
        what = str(entry.get("@cat02", ""))
        area = str(entry.get("@area", ""))
        time = str(entry.get("@time", ""))
        if hs not in valid_codes or area not in area_names or time not in times:
            raise ValueError("統計セルの国/品目/時間軸がメタ情報と一致しません")
        if "2026" not in times[time]:
            raise ValueError("2026年以外のセルが混入")
        raw = str(entry.get("$", "")).strip()
        if what == "100":
            if raw and raw not in SKIP_VALUES:
                if raw != "NO":
                    raise ValueError("数量1の単位がNO（台）ではありません")
                unit_codes.add(hs)
            continue
        period = MONTH_CODES.get(what)
        if period is None:
            raise ValueError("数量1以外の分類が混入")
        if raw in SKIP_VALUES:
            continue  # Unknown, suppressed or absent. Never infer zero.
        cleaned = raw.replace(",", "")
        if not cleaned.isdecimal():
            raise ValueError("数量が整数ではありません")
        units = int(cleaned)
        if units > 5_000_000:
            raise ValueError("異常に大きな国・品目・単月台数")
        name = normalize_country(area_names[area])
        if not name:
            raise ValueError("国名が空欄")
        k = (period, area, hs)
        if k in rows and rows[k]["units"] != units:
            raise ValueError("同一セルに矛盾した値")
        rows[k] = {"period": period, "country": name, "area_code": area,
                   "hs_code": hs, "units": units}
    if not rows:
        raise ValueError("取得結果が0件。既存の統計を維持します")
    if not unit_codes:
        raise ValueError("数量単位NOを確認できません")
    if set(row["hs_code"] for row in rows.values()) - unit_codes:
        raise ValueError("数量単位を確認できないHSコードがあります")
    return list(rows.values())

def get_data(app_id, dataset_id, valid_codes, areas, times):
    # Includes each month quantity-1 and the 'unit-1' label (= NO).
    requested = ",".join(["100", *MONTH_CODES])
    rows = []
    next_position = 1
    pages = 0
    while True:
        payload = api_json("getStatsData", dict(appId=app_id, statsDataId=dataset_id,
            cdCat01=",".join(valid_codes), cdCat02=requested, metaGetFlg="N",
            startPosition=next_position, limit=MAX_ROWS))
        block = result(payload, "GET_STATS_DATA")
        stat = block.get("STATISTICAL_DATA", {})
        rows.append(stat)
        pages += 1
        if pages > 15:
            raise ValueError("予期しないデータページ数")
        next_key = stat.get("RESULT_INF", {}).get("NEXT_KEY")
        if next_key in (None, "", "0", 0):
            break
        try:
            newpos = int(next_key)
        except (ValueError, TypeError):
            raise ValueError("ページ位置の形式が不正です") from None
        if newpos <= next_position:
            raise ValueError("ページ位置が進みません")
        next_position = newpos
    combined = {"STATISTICAL_DATA": {"DATA_INF": {"VALUE": []}}}
    for stat in rows:
        combined["STATISTICAL_DATA"]["DATA_INF"]["VALUE"].extend(
            seq(stat.get("DATA_INF", {}).get("VALUE")))
    return parse_values(combined, valid_codes, areas, times, dataset_id)

def make_document(table_id, title, rows):
    rows.sort(key=lambda x: (x["period"], x["country"], x["hs_code"]))
    months = sorted({row["period"] for row in rows})
    if months[-1] > f"{YEAR}-12":
        raise ValueError("時間軸の範囲が不正です")
    return {
        "schema_version": 1,
        "dataset": "Japan customs official national commodity-by-country exports",
        "status": "available",
        "year": YEAR,
        "stats_data_id": table_id,
        "table_title": title,
        "source_url": SOURCE_URL,
        "hs_reference_url": "https://www.customs.go.jp/yusyutu/2026_01_01/data/j_87.htm",
        "coverage": "Used passenger cars in the listed 16 HS subheadings, NO quantity-1, by importing country, customs month. Missing rows are unknown, not zero.",
        "months": months,
        "hs_labels": HS,
        "rows": rows,
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }

def main():
    app_id = os.environ.get("ESTAT_APP_ID", "").strip()
    if not app_id:
        raise ValueError("ESTAT_APP_ID 未設定。GitHub Secretsに登録してください")
    table_id, title = find_dataset(app_id)
    meta = result(api_json("getMetaInfo", dict(appId=app_id, statsDataId=table_id)), "GET_META_INFO")
    valid_codes, areas, times = validate_metadata(meta.get("METADATA_INF", {}), table_id)
    rows = get_data(app_id, table_id, valid_codes, areas, times)
    new = make_document(table_id, title, rows)
    if OUTPUT.exists():
        old = json.loads(OUTPUT.read_text(encoding="utf-8"))
        if old.get("status") == "available":
            if old.get("year") == YEAR and max(old.get("months", ["2026-01"])) > max(new["months"]):
                raise ValueError("取得できた最新月が以前より古いため更新中止")
            unchanged = {k: v for k, v in old.items() if k != "updated_at"} == {
                k: v for k, v in new.items() if k != "updated_at"}
            if unchanged:
                print("UNCHANGED: official data matches stored file")
                return
    OUTPUT.write_text(json.dumps(new, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(f"UPDATED: source {table_id}, months={len(new['months'])}, cells={len(rows)}")
if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as e:
        print("SAFE STOP: " + str(e), file=sys.stderr)
        raise SystemExit(1)
