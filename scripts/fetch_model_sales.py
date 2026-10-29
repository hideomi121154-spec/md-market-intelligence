"""Fetch official lightweight-vehicle MODEL-LEVEL NEW CAR sales, not used-car prices.

Source: Japan Mini Vehicles Association (Zenkeijikyo) official passenger model ranking.
Only top 15 *passenger* nameplates are extracted; no individual years/grades/prices.
Fail closed if source table shape is unrecognised. Respect copyright and provenance.
"""
from __future__ import annotations

import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

INDEX_URL = "https://www.zenkeijikyo.or.jp/statistics/tushokaku"
BOOTSTRAP_URL = "https://www.zenkeijikyo.or.jp/statistics/tushokaku-14172"  # 2026-09
DEST = Path("data/model_sales.json")
MAKERS = {"スズキ", "ホンダ", "ダイハツ", "日産", "三菱", "トヨタ", "マツダ", "スバル", "SUBARU", "レクサス", "いすゞ"}


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self.links: list[str] = []
        self._table_depth = 0
        self._row = None
        self._cell = None
        self._cell_depth = 0
        self._href = None

    def handle_starttag(self, tag, attrs):
        at = dict(attrs)
        if tag == "a":
            self._href = at.get("href")
            if self._href:
                self.links.append(self._href)
        if tag == "table":
            if self._table_depth == 0:
                self.tables.append([])
            self._table_depth += 1
        if self._table_depth == 1 and tag == "tr":
            self._row = []
        if self._table_depth == 1 and tag in ("th", "td") and self._row is not None:
            self._cell = []
            self._cell_depth = 1
        elif self._cell is not None and tag in ("th", "td"):
            self._cell_depth += 1

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("th", "td") and self._cell is not None:
            self._cell_depth -= 1
            if self._cell_depth == 0:
                val = re.sub(r"\s+", " ", "".join(self._cell)).strip()
                self._row.append(val)
                self._cell = None
        if tag == "tr" and self._row is not None and self._table_depth == 1:
            self.tables[-1].append(self._row)
            self._row = None
        if tag == "table" and self._table_depth:
            self._table_depth -= 1


def fetch(url):
    if urlparse(url).hostname != "www.zenkeijikyo.or.jp" or not url.startswith("https://"):
        raise ValueError("Not an approved official host: " + url)
    request = urllib.request.Request(url, headers={"User-Agent": "MDMarketResearch/1.0 (official public sales statistics; 1 request/day)"})
    with urllib.request.urlopen(request, timeout=25) as response:
        if urlparse(response.geturl()).hostname != "www.zenkeijikyo.or.jp":
            raise ValueError("Redirect away from official host")
        body = response.read(2_000_001)
        encoding = response.headers.get_content_charset() or "utf-8"
        content_type = response.headers.get("Content-Type", "")
    if len(body) > 2_000_000 or "html" not in content_type.lower():
        raise ValueError("Unexpected source size or type")
    return body.decode(encoding, errors="replace")


def candidate_urls(index_html):
    page = Page()
    page.feed(index_html)
    slugs = set()
    for href in page.links:
        url = urljoin(INDEX_URL, href)
        match = re.search(r"/statistics/tushokaku-(\d+)(?:[/?#]|$)", url)
        if match and urlparse(url).hostname == "www.zenkeijikyo.or.jp":
            slugs.add((int(match.group(1)), url.split("?")[0].split("#")[0]))
    return [url for _, url in sorted(slugs, reverse=True)[:6]]


def parse_monthly(html, source_url):
    title = re.search(r"(20\d{2})年\s*(1[0-2]|[1-9])月\s*軽四輪車\s*通称名別\s*新車販売確報", html)
    if not title:
        raise ValueError("Not a single-month final official model report")
    year, month = int(title.group(1)), int(title.group(2))
    if not 2020 <= year <= datetime.now(timezone.utc).year + 1:
        raise ValueError("Unexpected year")
    page = Page()
    page.feed(html)
    ranking_tables = [t for t in page.tables if any("通称名" in " ".join(row) and "本月" in " ".join(row) for row in t[:5])]
    if not ranking_tables:
        raise ValueError("No official passenger sales table found")
    results = []
    for row in ranking_tables[0]:
        maker_at = next((i for i, cell in enumerate(row) if cell in MAKERS), None)
        if maker_at is None or maker_at + 2 >= len(row):
            continue
        maker, model, count = row[maker_at:maker_at + 3]
        model = re.sub(r"\s+", "", model)
        if not model or len(model) > 45 or not re.fullmatch(r"[0-9,]+", count):
            continue
        units = int(count.replace(",", ""))
        if not (50 <= units <= 100000):
            raise ValueError("Implausible monthly registration count: " + model)
        prev = row[maker_at + 6] if maker_at + 6 < len(row) else ""
        yoy = float(prev) if re.fullmatch(r"\d{2,3}(?:\.\d+)?", prev) else None
        results.append({"make": maker, "model": model, "units": units, "yoy_pct": yoy})
    if len(results) < 12 or len(results) > 15 or len({(r["make"], r["model"]) for r in results}) != len(results):
        raise ValueError(f"Expected 12-15 unique passenger ranking entries, got {len(results)}")
    if results != sorted(results, key=lambda r: -r["units"]):
        raise ValueError("Passenger ranking is not descending")
    return {"month": f"{year}-{month:02d}", "source_url": source_url, "models": results}


def main():
    existing = None
    if DEST.exists():
        try:
            existing = json.loads(DEST.read_text("utf-8"))
        except (json.JSONDecodeError, UnicodeError):
            existing = None
    previous_month = existing.get("month") if isinstance(existing, dict) else None
    urls = candidate_urls(fetch(INDEX_URL))
    if BOOTSTRAP_URL not in urls:
        urls.append(BOOTSTRAP_URL)
    selected = None
    for url in urls[:7]:
        try:
            row = parse_monthly(fetch(url), url)
            if selected is None or row["month"] > selected["month"]:
                selected = row
        except (OSError, ValueError) as error:
            print(f"Skip candidate {url}: {error}")
    if not selected:
        raise RuntimeError("No verifiable official passenger model-ranking data; keeping prior file")
    if previous_month and selected["month"] < previous_month:
        raise RuntimeError("Source went backwards in time; keeping prior file")
    selected.update({
        "schema_version": 1,
        "dataset": "Japan mini vehicle NEW-CAR passenger nameplate ranking",
        "source_name": "Japan Mini Vehicles Association (Zenkeijikyo)",
        "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "scope": "top 15 light passenger nameplates; excludes other vehicle classes",
        "caution": "NEW registrations, not used car sales, auction prices, model years or grades. Not a direct demand or price proxy.",
    })
    DEST.parent.mkdir(exist_ok=True, parents=True)
    DEST.write_text(json.dumps(selected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Validated {len(selected['models'])} official NEW car models for {selected['month']}")

if __name__ == "__main__":
    main()