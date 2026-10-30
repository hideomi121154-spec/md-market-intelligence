"""Validated annual *new* kei passenger car nameplate rankings, not used-car inventory.

Read 2021-2025 official Zenkeijikyo December reports (calendar-year total section).
Allow only official host; fail closed on table changes. Writes an aggregated public
statistical snapshot; never accesses individual transaction or licensed data.
"""
from __future__ import annotations
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

try:
    from .fetch_model_sales import Page, MAKERS, fetch
except ImportError:  # direct script execution by GitHub Actions
    from fetch_model_sales import Page, MAKERS, fetch

SOURCE_URLS = {
    2021: 'https://www.zenkeijikyo.or.jp/statistics/tushokaku-7359',
    2022: 'https://www.zenkeijikyo.or.jp/statistics/tushokaku-8837',
    2023: 'https://www.zenkeijikyo.or.jp/statistics/tushokaku-9859',
    2024: 'https://www.zenkeijikyo.or.jp/statistics/tushokaku-11351',
    2025: 'https://www.zenkeijikyo.or.jp/statistics/tushokaku-12926',
}
DEST = Path('data/kei_annual_history.json')


def parse_annual(html: str, year: int, source_url: str) -> dict:
    if urlparse(source_url).hostname != 'www.zenkeijikyo.or.jp':
        raise ValueError('Non-official source URL')
    title = rf'{year}年\s*12月\s*軽四輪車\s*通称名別\s*新車販売確報'
    if not re.search(title, html):
        raise ValueError(f'Not official {year} December report')
    page = Page()
    page.feed(html)
    # The December report contains three tables: single-month top15, annual
    # calendar-year top15, and full nameplate breakdown. The annual table has
    # 「本年累計」「前年累計」 but *no* 「本月」 column.
    eligible = []
    for table in page.tables:
        header = ' '.join(' '.join(row) for row in table[:4])
        if '本年累計' in header and '前年累計' in header and '本月' not in header and '通称名' in header:
            eligible.append(table)
    if len(eligible) != 1:
        raise ValueError(f'Expected exactly 1 calendar annual top15 table; got {len(eligible)}')
    models = []
    for row in eligible[0]:
        maker_at = next((i for i, s in enumerate(row) if s in MAKERS), None)
        if maker_at is None or maker_at + 2 >= len(row):
            continue
        make, model, quantity = row[maker_at:maker_at+3]
        model = re.sub(r'\s+', '', model)
        if not model or len(model) > 45 or not re.fullmatch(r'\d{1,3}(?:,?\d{3})*|\d+', quantity):
            continue
        units = int(quantity.replace(',', ''))
        if not 100 <= units <= 500_000:
            raise ValueError(f'Implausible annual units: {model}={units}')
        models.append({'rank': len(models)+1, 'make': make, 'model': model, 'units': units})
    if len(models) != 15:
        raise ValueError(f'Expected 15 kei new-car nameplates; got {len(models)}')
    if models != sorted(models, key=lambda r: -r['units']):
        raise ValueError('Annual ranking is not descending')
    if len(set((x['make'], x['model']) for x in models)) != 15:
        raise ValueError('Duplicate nameplates in annual ranking')
    return {'year': year, 'source_url': source_url, 'scope': 'calendar year January-December, kei passenger top15', 'models': models}


def validate_history(data):
    years = data.get('years')
    if not isinstance(years, list) or [x.get('year') for x in years] != sorted(SOURCE_URLS):
        raise ValueError('Missing years or year mismatch')
    for row in years:
        if len(row['models']) != 15 or row['source_url'] != SOURCE_URLS[row['year']]:
            raise ValueError('Wrong source or annual top15 count')
    return True


def main():
    rows = [parse_annual(fetch(url), year, url) for year, url in SOURCE_URLS.items()]
    data = {
        'schema_version': 1,
        'dataset': 'Official kei passenger NEW-CAR nameplate annual top15, calendar year',
        'source_name': 'Japan Mini Vehicles Association (Zenkeijikyo)',
        'checked_at_utc': datetime.now(timezone.utc).isoformat(),
        'years': rows,
        'caution': 'New-car sales are not used-car listings, trades, prices, exports or available stock. Missing top15 is not zero sales. Calendar-year totals, nameplate/series merged; cannot infer actual age-specific used supply.',
    }
    validate_history(data)
    DEST.parent.mkdir(exist_ok=True, parents=True)
    DEST.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'Validated official KEI annual passenger new-car top15 for {len(rows)} years, '+','.join(str(r['year']) for r in rows))
    for row in rows:
        print(row['year'], row['models'][0]['model'], row['models'][0]['units'], 'デイズ:', next((v['units'] for v in row['models'] if v['model']=='デイズ'),'outside top15'))


if __name__ == '__main__':
    main()