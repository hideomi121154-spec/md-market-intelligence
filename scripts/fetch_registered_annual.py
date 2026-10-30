"""2022-25 JADA official annual new-car rankings; 2021 separately attributed secondary reference."""
from __future__ import annotations
import json
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
import fitz

SOURCES = {
  2022:'https://www.jada.or.jp/files/libs/6120/202509241131464590.pdf',
  2023:'https://www.jada.or.jp/files/libs/6128/202509241144117936.pdf',
  2024:'https://www.jada.or.jp/files/libs/6122/20250924113213650.pdf',
  2025:'https://www.jada.or.jp/files/libs/6986/202604031138081429.pdf'
}
SECONDARY=Path('data/registered_annual_2021_reference.json')
DEST=Path('data/registered_annual_history.json')
MAKERS=('SUBARU','ダイハツ','レクサス','スズキ','トヨタ','ホンダ','マツダ','三菱','日産')
MAKER_PATTERN='|'.join(sorted(MAKERS,key=len,reverse=True))
LINE=re.compile(r'^\s*(\d{1,2})\s+(.+?)\s+('+MAKER_PATTERN+r')\s+([0-9,]+)(?:\s+(\S+))?\s*$')
KNOWN_TOP={2022:('ヤリス',168557),2023:('ヤリス',194364),2024:('カローラ',166956),2025:('ヤリス',166533)}

def normalized(t):
    return unicodedata.normalize('NFKC',t)

def repair_2023_pdf_text(raw):
    """Only repair three PDF-broken SUBARU maker labels; never modify numeric units."""
    t=normalized(raw)
    for model in ('インプレッサ','フォレスター'):
        pattern=r'(?m)^(\d{1,2})\s+'+model+r'\s*\n\s*SUBAR\s*\n\s*U\s+([0-9,]+)\s+(\S+)'
        t,n=re.subn(pattern,lambda m:f'{m[1]} {model} SUBARU {m[2]} {m[3]}',t)
        if n!=1: raise ValueError(f'Expected one split SUBARU entry: {model}; got {n}')
    t,n=re.subn(r'(?m)^(37\s+レヴォーグ\s+)SUBAR(\s+[0-9,]+\s+\S+)$',r'\g<1>SUBARU\g<2>',t)
    if n!=1: raise ValueError('Expected one SUBARU maker font truncation at rank37')
    return t

def check_rows(rows,year):
    if len(rows)!=50 or [r['rank'] for r in rows]!=list(range(1,51)):
        raise ValueError(f'Expected ranked 1-50 list for {year}; found {len(rows)}')
    if any(a['units']<b['units'] for a,b in zip(rows,rows[1:])):
        raise ValueError('Annual unit counts not descending')
    if any(not r['make'] or not r['model'] or not isinstance(r['units'],int) or r['units']<1 or r['units']>400000 for r in rows):
        raise ValueError('Invalid make, nameplate or units')
    if len({(r['make'],normalized(r['model'])) for r in rows})!=50:
        raise ValueError('Duplicate manufacturer/nameplate in year')

def extract_rows(text,year):
    t=normalized(text)
    rows=[]
    for line in t.splitlines():
        m=LINE.fullmatch(line.strip())
        if m:
            rank,model,make,units,_yoy=m.groups()
            rows.append({'rank':int(rank),'make':make,
                         'model':re.sub(r'\s+',' ',model.strip()),
                         'units':int(units.replace(',',''))})
    if year==2023:
        # The original official 2023 PDF splits the maker font in exactly three
        # annual TOTAL rows. Reconcile those rows against the PDF's visible text.
        # Never fill a missing row without confirming name AND literal unit count.
        visible_ranks={r['rank'] for r in rows}
        for rank,model,units in (
            (22,'インプレッサ',34371),
            (30,'フォレスター',22141),
            (37,'レヴォーグ',15267),
        ):
            if rank in visible_ranks:
                continue
            match=re.search(r'(?m)^\s*'+str(rank)+r'\s+'+re.escape(model)+r'(?=\s|$)',t)
            if match is None:
                pos=t.find(model)
                raise ValueError(f'2023 PDF missing wrapped model {rank}: {model}; excerpt={t[max(0,pos-55):pos+130]!r}')
            excerpt=t[match.start():match.start()+110]
            if f'{units:,}' not in excerpt or not re.search(r'(?:\sU\s|SUBAR)',excerpt):
                raise ValueError(f'2023 PDF wrapped model or units unconfirmed: {model}')
            rows.append({'rank':rank,'make':'SUBARU','model':model,'units':units})
        rows.sort(key=lambda r:r['rank'])
    check_rows(rows,year)
    return rows

def fetch_pdf(url):
    if urlparse(url).scheme!='https' or urlparse(url).hostname!='www.jada.or.jp':
        raise ValueError('Only official JADA HTTPS domain')
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (MD MARKET annual JADA public statistics verification)'})
    with urllib.request.urlopen(req,timeout=30) as r:
        if urlparse(r.url).scheme!='https' or urlparse(r.url).hostname!='www.jada.or.jp':
            raise ValueError('Unexpected JADA PDF redirect')
        blob=r.read(2_500_001)
    if len(blob)>2_500_000 or not blob.startswith(b'%PDF-'):
        raise ValueError('JADA source does not return a valid PDF')
    return blob

def parse_pdf(pdf,year,source_url):
    doc=fitz.open(stream=pdf,filetype='pdf')
    if year in (2022,2023):
        if len(doc)!=8: raise ValueError('Unexpected historical PDF page count')
        page=doc[-1]
        # The right-hand table is the ANNUAL TOTAL, not the left-hand December ranking.
        text=page.get_text('text',sort=True,clip=fitz.Rect(page.rect.width*.46,0,page.rect.width,page.rect.height))
        date_pattern=rf'{year}年\s*1月\s*[~～〜\-]\s*{year}年\s*12月'
    else:
        if len(doc)<8: raise ValueError('Unexpected recent PDF page count')
        page=doc[0]
        text=page.get_text('text',sort=True)
        date_pattern=rf'{year}年\s*1月\s*[~～〜\-]\s*(?:{year}年\s*)?12月'
    if not re.search(date_pattern,normalized(text)):
        raise ValueError('Full Jan-Dec CALENDAR YEAR was not identified explicitly')
    rows=extract_rows(text,year)
    if (rows[0]['model'],rows[0]['units'])!=KNOWN_TOP[year]:
        raise ValueError(f'Annual cross-check failed for year {year}: {rows[0]}')
    return {'year':year,'source_type':'official','source_url':source_url,
            'source_page':page.number+1,'models':rows}

def main():
    first=json.loads(SECONDARY.read_text(encoding='utf-8'))
    if first.get('year')!=2021 or first.get('source_type')!='secondary':
        raise ValueError('2021 secondary reference metadata missing')
    check_rows(first['models'],2021)
    if (first['models'][0]['model'],first['models'][0]['units'])!=('ヤリス',212927):
        raise ValueError('2021 secondary cross-check failed')
    years=[first]
    for y,url in SOURCES.items():
        row=parse_pdf(fetch_pdf(url),y,url)
        years.append(row)
        print(f'{y} JADA official TOP50, source PDF p{row["source_page"]}: {row["models"][0]}')
    result={'schema_version':1,'dataset':'Registered NEW passenger car annual sales, not the used car market',
      'years':years,'checked_at_utc':datetime.now(timezone.utc).isoformat(),
      'scope':'Jan-Dec 2021-2025, registered domestic-brand passenger vehicles only (kei/foreign brands excluded), top50/year',
      'provenance_caution':'2021 data comes from explicitly attributed SECONDARY reporting; original JADA 2021 PDF returned a GIF on 2026-10-30. Data for 2022-25 were read from JADA official PDF.',
      'market_caution':'Not used car inventory, auction transactions, sales prices or demand. Some nameplates aggregate model families and naming changes may prevent direct comparisons.'}
    DEST.parent.mkdir(parents=True,exist_ok=True)
    DEST.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Completed 250 annual vehicle nameplate figures, four official years plus 2021 secondary.')

if __name__=='__main__':main()
