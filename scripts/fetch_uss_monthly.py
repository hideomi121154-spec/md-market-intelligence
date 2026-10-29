"""Collect USS official IR *aggregate* monthly auction figures, not vehicle records.

No third-party scraping, no guessed figures. A changed source structure aborts
rather than silently publishing misleading data.
"""
from __future__ import annotations

import hashlib
from html.parser import HTMLParser
import json
from datetime import datetime, timezone
from pathlib import Path
import re
import urllib.request

URL = 'https://www.ussnet.co.jp/ir/library/monthly/index.html'
METRICS = Path('data/uss_monthly.json')
STATUS = Path('data/uss_source_status.json')
MONTH_RE = re.compile(r'^\s*(1[0-2]|[1-9])\s*月\s*$')
FISCAL_RE = re.compile(r'(20\d{2})\s*年\s*3\s*月\s*期')

class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.tables = []
        self.rows = []
        self.cells = []
        self.cell = None
        self.doc_text = []

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.depth += 1
            if self.depth == 1:
                self.rows = []
        elif tag == 'tr' and self.depth == 1:
            self.cells = []
        elif tag in ('td', 'th') and self.depth == 1:
            self.cell = []

    def handle_data(self, data):
        self.doc_text.append(data)
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.depth == 1 and self.cell is not None:
            self.cells.append(' '.join(''.join(self.cell).split()))
            self.cell = None
        elif tag == 'tr' and self.depth == 1 and self.cells:
            self.rows.append(self.cells)
            self.cells = []
        elif tag == 'table' and self.depth:
            if self.depth == 1:
                self.tables.append(self.rows)
            self.depth -= 1

def intval(s):
    s = re.sub(r'[*,\s]', '', s)
    if not re.fullmatch(r'[0-9]+', s):
        raise ValueError('Invalid integer: '+repr(s))
    return int(s)

def percent(s):
    s = re.sub(r'\s', '', s)
    if not re.fullmatch(r'[0-9]+(?:\.[0-9]+)?%', s):
        raise ValueError('Invalid percent: '+repr(s))
    return float(s[:-1])

def parse_html(html: str, source_url=URL, fetched_at=None):
    doc = Tables()
    doc.feed(html)
    fiscal_match = FISCAL_RE.search(' '.join(doc.doc_text))
    if not fiscal_match:
        raise ValueError('Missing fiscal-year header (20xx年3月期)')
    fiscal_year = int(fiscal_match.group(1))
    candidates = []
    for table in doc.tables:
        header = ' '.join(' '.join(row) for row in table[:5])
        if not all(x in header for x in ('出品台数', '成約台数', '成約率', '成約車両単価')):
            continue
        candidates.append(table)
    if not candidates:
        raise ValueError('USS monthly metrics table not found; source may have changed')
    table = candidates[0]
    months = []
    seen = set()
    for row in table:
        if not row or not MONTH_RE.match(row[0]):
            continue
        month = int(MONTH_RE.match(row[0]).group(1))
        if len(row) < 14 or not row[3].strip():
            continue  # Unpublished future month, never fill with zero.
        if len(row) != 14:
            raise ValueError('Unexpected USS monthly row shape: '+repr(row))
        if month in seen:
            raise ValueError('Duplicate month in official table')
        seen.add(month)
        offered = intval(row[3]); offered_prev = intval(row[4]); offered_yoy = percent(row[5])
        sold = intval(row[6]); sold_prev = intval(row[7]); sold_yoy = percent(row[8])
        rate = percent(row[9]); rate_prev = percent(row[10])
        price = intval(row[11]); price_prev = intval(row[12]); price_yoy = percent(row[13])
        if not (0 < sold <= offered < 1_000_000 and 0 < price < 100_000):
            raise ValueError('Out-of-bounds USS data for month '+str(month))
        if abs(sold/offered*100-rate) > 0.16:
            raise ValueError('Sale rate inconsistent with volumes for month '+str(month))
        for curr, previous, yoy in ((offered, offered_prev, offered_yoy), (sold,sold_prev,sold_yoy), (price,price_prev,price_yoy)):
            if previous == 0 or abs(100*curr/previous - yoy) > 0.16:
                raise ValueError('Year-on-year figure inconsistent for month '+str(month))
        calendar_year = fiscal_year - 1 if month >= 4 else fiscal_year
        months.append({
            'month': f'{calendar_year:04d}-{month:02d}',
            'offered': offered, 'offered_prev': offered_prev, 'offered_yoy_pct': offered_yoy,
            'sold': sold, 'sold_prev': sold_prev, 'sold_yoy_pct': sold_yoy,
            'sale_rate_pct': rate, 'sale_rate_prev_pct': rate_prev,
            'avg_sold_price_thousand_jpy': price,
            'avg_sold_price_prev_thousand_jpy': price_prev,
            'avg_sold_price_yoy_pct': price_yoy,
        })
    if not months:
        raise ValueError('No published USS monthly rows found')
    months.sort(key=lambda x:x['month'])
    if months[0]['month'] != f'{fiscal_year-1}-04':
        raise ValueError('Fiscal-year data missing April row')
    if len(months) > 12:
        raise ValueError('Unexpected count of monthly observations')
    return {
        'schema_version': 1,
        'dataset': 'USS auction aggregate monthly statistics',
        'fiscal_year_end': f'{fiscal_year}-03',
        'source_url': source_url,
        'checked_at_utc': fetched_at or datetime.now(timezone.utc).isoformat(),
        'verified_source': 'USS official investor-relations page',
        'notes': 'Aggregated USS auction results, NOT model-specific transactions. Price is a monthly average of sold vehicles (unit: 1,000 JPY). Historical values may be revised by USS.',
        'months': months,
    }

def main():
    request = urllib.request.Request(URL, headers={'User-Agent': 'MDMarketResearch/1.2 (official IR aggregate; daily)'})
    with urllib.request.urlopen(request, timeout=30) as response:
        final_url = response.geturl()
        raw = response.read(2_000_001)
        content_type = response.headers.get('Content-Type', '')
        charset = response.headers.get_content_charset() or 'utf-8'
    if len(raw) > 2_000_000 or 'html' not in content_type.lower():
        raise ValueError('Unexpected response type or size')
    if not (final_url.startswith('https://www.ussnet.co.jp/ir/') or final_url.startswith('https://qtwcca163.secure.jp/ir/')):
        raise ValueError('Unexpected redirect URL: '+final_url)
    now = datetime.now(timezone.utc).isoformat()
    parsed = parse_html(raw.decode(charset, errors='replace'),final_url,now)
    METRICS.parent.mkdir(parents=True, exist_ok=True)
    METRICS.write_text(json.dumps(parsed, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    status = {
        'source': 'USS official investor relations monthly data',
        'source_url': final_url,
        'checked_at_utc': now,
        'source_sha256': hashlib.sha256(raw).hexdigest(),
        'status': 'monthly_aggregates_parsed',
        'rows': len(parsed['months']),
        'latest_month': parsed['months'][-1]['month'],
        'warning': 'Aggregate USS statistics; never mix with individual vehicle or retail listing prices.',
    }
    STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('USS official months parsed:',len(parsed['months']),'latest:',status['latest_month'])

if __name__ == '__main__':
    main()