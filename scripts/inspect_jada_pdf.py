import json,urllib.request
from pathlib import Path
import fitz
u='https://www.jada.or.jp/files/libs/7724/202610051041269611.pdf'
req=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0 MDMarketResearch/1.0'})
with urllib.request.urlopen(req,timeout=30) as response:
 raw=response.read(3_000_000);ct=response.headers.get('Content-Type','');final=response.url
if not raw.startswith(b'%PDF-'):raise RuntimeError('Response is not PDF: '+ct)
doc=fitz.open(stream=raw,filetype='pdf')
pages=[]
for p in doc:
 lines=[l.strip() for l in p.get_text(sort=True).splitlines() if l.strip()]
 tables=p.find_tables().tables
 pages.append({'page':p.number+1,'text_first_lines':lines[:85],'table_count':len(tables),'table_first_rows':[t.extract()[:7] for t in tables[:2]]})
info={'source_url':final,'pages':len(doc),'bytes':len(raw),'pages_data':pages}
Path('data').mkdir(exist_ok=True)
Path('data/jada_pdf_inspect.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('PDF pages=',len(doc),' tables=',[x['table_count'] for x in pages])
