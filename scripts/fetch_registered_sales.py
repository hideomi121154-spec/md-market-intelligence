"""Daily retrieval of JADA official registered-passenger NEW-car nameplate rankings.
Source: official PDFs linked from https://www.jada.or.jp/pages/340/
Only explicitly single-month ranked figures are accepted. Never mix cumulative
April-September/Jan-September rankings with one month's counts.
"""
from __future__ import annotations

import json
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

import fitz

INDEX = 'https://www.jada.or.jp/pages/340/'
OUTPUT = Path('data/registered_sales.json')
MAKERS = ['SUBARU', 'ＳＵＢＡＲＵ', 'ダイハツ', 'レクサス', 'スズキ', 'トヨタ', 'ホンダ', 'マツダ', '三菱', '日産']
MAKER_EXPR = '|'.join(sorted(MAKERS, key=len, reverse=True))
ROW_RE = re.compile(r'^\s*(\d{1,2})\s+(.+?)\s+(' + MAKER_EXPR + r')\s+([0-9,]+)\s+([^\s]+)\s*$')
PERIOD_RE = re.compile(r'^乗用車ブランド通称名別順位\s*(20\d{2})年\s*(1[0-2]|[1-9])月分$')


class RankingLinks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.current = {'href': dict(attrs).get('href', ''), 'text': ''}

    def handle_data(self, value):
        if self.current is not None:
            self.current['text'] += value

    def handle_endtag(self, tag):
        if tag == 'a' and self.current is not None:
            self.links.append(self.current)
            self.current = None


def safe_fetch(url: str, *, binary=False) -> bytes:
    p = urlparse(url)
    if p.scheme != 'https' or p.hostname != 'www.jada.or.jp':
        raise ValueError('Only official HTTPS JADA URLs are allowed')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (MDMarket official statistics, daily check)'})
    with urllib.request.urlopen(req, timeout=30) as response:
        destination = urlparse(response.url)
        if destination.scheme != 'https' or destination.hostname != 'www.jada.or.jp':
            raise ValueError('Unexpected redirect')
        payload = response.read(3_000_001)
        if len(payload) > 3_000_000:
            raise ValueError('Source too large')
        if binary:
            if not payload.startswith(b'%PDF-'):
                raise ValueError('Official document is not PDF')
        elif b'<html' not in payload[:500].lower() and b'<!doctype' not in payload[:500].lower():
            raise ValueError('Expected official HTML page')
    return payload


def ranking_pdf_links(html: str) -> list[str]:
    parser = RankingLinks()
    parser.feed(html)
    links = []
    for link in parser.links:
        href = urljoin(INDEX, link['href'])
        if (urlparse(href).hostname == 'www.jada.or.jp' and
                re.search(r'\.pdf$', urlparse(href).path, re.I) and
                'ブランド通称名別ランキング' in link['text'] and
                '参考資料' not in link['text']):
            links.append(href)
    return list(dict.fromkeys(links))


def parse_ranked_text(text: str, month: str) -> list[dict]:
    rows = []
    for line in text.splitlines():
        m = ROW_RE.fullmatch(line.strip())
        if not m:
            continue
        rank, name, maker, units_str, yoy_str = m.groups()
        rank = int(rank)
        units = int(units_str.replace(',', ''))
        name = unicodedata.normalize('NFKC', name).strip()
        maker = unicodedata.normalize('NFKC', maker).strip()
        try:
            yoy = float(yoy_str)
        except ValueError:
            if not re.fullmatch(r'\(\d{2}-\d{1,2}\)|[-—]', yoy_str):
                raise ValueError(f'Unexpected YoY cell in {month} at rank {rank}: {yoy_str}')
            yoy = None
        if not name or len(name) > 45 or units < 1 or units > 200000 or not (yoy is None or 0 < yoy < 100000):
            raise ValueError(f'Invalid official row: {line}')
        rows.append({'rank': rank, 'make': maker, 'model': name, 'units': units, 'yoy_pct': yoy})
    if len(rows) != 50 or [r['rank'] for r in rows] != list(range(1, 51)):
        raise ValueError(f'Expected 50 ordered unique nameplates, got {len(rows)} for {month}')
    if any(a['units'] < b['units'] for a,b in zip(rows, rows[1:])):
        raise ValueError('Ranking is not descending by units')
    if len({(r['make'],r['model']) for r in rows}) != 50:
        raise ValueError('Duplicate names in JADA ranking')
    return rows


def parse_pdf(document: bytes, source_url: str) -> dict:
    doc = fitz.open(stream=document, filetype='pdf')
    monthly = []
    for page in doc:
        txt = page.get_text(sort=True)
        lines = [line.strip() for line in txt.splitlines() if line.strip()]
        if not lines:
            continue
        period = PERIOD_RE.fullmatch(lines[0])
        if period:
            year, mon = map(int, period.groups())
            month = f'{year}-{mon:02d}'
            monthly.append((month, txt, page.number + 1))
    if not monthly:
        raise ValueError('No single-month JADA ranking in official PDF')
    month, monthly_text, page_num = max(monthly, key=lambda t: t[0])
    rows = parse_ranked_text(monthly_text, month)
    if month > datetime.now(timezone.utc).strftime('%Y-%m'):
        raise ValueError('Ranking month appears to be in the future')
    return {
        'month': month, 'source_url': source_url, 'source_page': page_num,
        'models': rows, 'dataset': 'JADA domestic brand registered new passenger nameplate sales',
        'period_type': 'single_month', 'schema_version': 1,
        'source_name': 'Japan Automobile Dealers Association (JADA)',
        'scope': 'top 50 registered passenger nameplates; excludes kei vehicles and foreign brands; nameplate families aggregated',
        'caution': 'NEW registrations; not used-car sales or auction prices. Includes small/compact cars. Some nameplates aggregate multiple models.',
    }


def main():
    candidates = ranking_pdf_links(safe_fetch(INDEX).decode('utf-8','replace'))
    if not candidates:
        raise RuntimeError('Official ranking PDF not discoverable; refusing to publish unverified values')
    winner = None
    errors = []
    for url in candidates[:4]:
        try:
            result = parse_pdf(safe_fetch(url, binary=True), url)
            if winner is None or result['month'] > winner['month']:
                winner = result
        except (OSError, ValueError, RuntimeError) as exc:
            errors.append(f'{url}: {exc}')
    if winner is None:
        raise RuntimeError('Official PDF parsing failed: ' + '; '.join(errors))
    if OUTPUT.exists():
        previous = json.loads(OUTPUT.read_text('utf-8'))
        if winner['month'] < previous.get('month',''):
            raise RuntimeError('Official published month older than existing record; keeping previous data')
    winner['checked_at_utc'] = datetime.now(timezone.utc).isoformat()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(winner, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('Validated',len(winner['models']),'registered passenger nameplates,', winner['month'], 'official PDF page', winner['source_page'])


if __name__=='__main__':
    main()