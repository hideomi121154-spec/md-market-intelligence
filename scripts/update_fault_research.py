#!/usr/bin/env python3
"""Collect only headlines/URLs from the publicly offered Google News RSS query feed.
Not SNS scraping; report numbers are an independently sourced collection."""
import datetime as dt
import email.utils
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
FILE = ROOT / "data" / "fault-research-index.json"
TARGETS = [
    ("日産", "ノート", "E12"),
    ("日産", "ノート", "HE12"),
    ("日産", "デイズ", "B21W"),
    ("日産", "セレナ", "C27"),
    ("トヨタ", "プリウス", "ZVW30"),
    ("トヨタ", "アクア", "NHP10"),
    ("ホンダ", "フィット", "GK3"),
    ("ホンダ", "N-BOX", "JF3"),
    ("スズキ", "ワゴンR", "MH23S"),
    ("ダイハツ", "タント", "LA600S"),
]
CATEGORIES = [
    ("エアコン・温度調整", r"エアコン|エアミックス|コンプレッサ|冷房|暖房"),
    ("ミッション・CVT", r"CVT|ミッション|変速|トランスミッション"),
    ("吸気・過給", r"インタークーラ|スーパーチャージャ|吸気|インテーク"),
    ("電装・バッテリー", r"バッテリー|電装|発電機|オルタネータ|電気系"),
    ("エンジン・始動", r"エンジン|エンスト|始動|点火"),
    ("ブレーキ", r"ブレーキ|制動|ABS"),
    ("足回り・操舵", r"サスペンション|ハブベアリング|ステアリング|足回り"),
    ("その他", r"故障|不具合|修理|リコール|交換|壊れ|異音"),
]
DEFECT_WORDS = re.compile(r"故障|不具合|修理|リコール|壊れ|異音|効かない|交換|破損|エンスト")
def clean(text):
    return re.sub(r"\s+", " ", text or "").strip()
def matches_model(text, name, code):
    # Require code token, not just car name: E12 must not absorb HE12.
    return (name.lower() in text.lower() and
            re.search(r"(?<![A-Za-z0-9])" + re.escape(code) + r"(?![A-Za-z0-9])", text, re.I) is not None)
def classify(title):
    if not DEFECT_WORDS.search(title):
        return None
    for label, pattern in CATEGORIES:
        if re.search(pattern, title, re.I):
            return label
    return "その他"
def parse_feed(xml_bytes, name, code):
    result, seen = [], set()
    xml = ET.fromstring(xml_bytes)
    for item in xml.findall("./channel/item")[:40]:
        title = clean(item.findtext("title"))
        link = clean(item.findtext("link"))
        if not title or not matches_model(title, name, code) or not link.startswith("https://news.google.com/"):
            continue
        category = classify(title)
        if not category or title in seen:
            continue
        seen.add(title)
        when = clean(item.findtext("pubDate"))
        try:
            date = email.utils.parsedate_to_datetime(when).date().isoformat()
        except (TypeError, ValueError):
            date = ""
        result.append({"category": category, "title": title[:160], "url": link[:1000],
                       "kind": "news_rss", "published_at": date})
    return result
def fetch(make, model, code):
    query = f'"{make}" "{model}" "{code}" 故障 OR 修理 OR 不具合'
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({
        "q": query, "hl": "ja", "gl": "JP", "ceid": "JP:ja"})
    req = urllib.request.Request(url, headers={"User-Agent": "MD-MARKET-research/0.1 (metadata-only RSS reader)"})
    with urllib.request.urlopen(req, timeout=15) as r:
        if r.status != 200:
            raise OSError(f"HTTP {r.status}")
        content = r.read(900_000)
    return parse_feed(content, model, code)
def update(current, results):
    """Never overwrite manually curated report groups or erase prior articles after a failure."""
    vehicles = current["vehicles"]
    index = {(v["make"], v["model"], v["code"]): v for v in vehicles}
    changes = 0
    for (make, model, code), articles in results.items():
        if not articles:
            continue
        key = (make, model, code)
        if key not in index:
            x = {"make": make, "model": model, "code": code, "label": code,
                 "report_groups": [], "supplemental": [], "web_mentions": [],
                 "source_note": "ニュースRSS見出しの収録のみ。国交省報告の順位ではありません。"}
            vehicles.append(x)
            index[key] = x
        entry = index[key]
        old = {(a.get("title"), a.get("url")): a for a in entry.get("web_mentions", []) if a.get("kind") == "news_rss"}
        for a in articles:
            old[a["title"], a["url"]] = a
        merged = sorted(old.values(), key=lambda a: a.get("published_at", ""), reverse=True)[:80]
        if entry.get("web_mentions") != merged:
            entry["web_mentions"] = merged
            changes += 1
    if changes:
        current["updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    return changes
def main():
    current = json.loads(FILE.read_text(encoding="utf-8"))
    results = {}
    for target in TARGETS:
        try:
            items = fetch(*target)
            print("RSS", target, len(items))
            results[target] = items
        except (OSError, ValueError, ET.ParseError) as exc:
            print("WARN: RSS unavailable", target, str(exc), file=sys.stderr)
            results[target] = []
    if update(current, results):
        FILE.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Updated RSS search metadata; no full articles stored.")
    else:
        print("No new metadata; preserving current report index.")
if __name__ == "__main__":
    main()
