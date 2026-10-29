"""Inspect official JADA brand-name ranking page link structure."""
import json, urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from pathlib import Path
URL='https://www.jada.or.jp/pages/340/'
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]; self._link=None
    def handle_starttag(self,tag,attrs):
        if tag=='a':self._link={'href':dict(attrs).get('href',''),'title':''}
    def handle_data(self,data):
        if self._link is not None:self._link['title']+=data.strip()+' '
    def handle_endtag(self,tag):
        if tag=='a' and self._link is not None:self.links.append(self._link); self._link=None
req=urllib.request.Request(URL,headers={'User-Agent':'Mozilla/5.0 (MDMarket public statistics check)'})
with urllib.request.urlopen(req,timeout=25) as resp:
    raw=resp.read(3_000_000);status=resp.status;final=resp.url
page=raw.decode('utf-8','replace');p=Links();p.feed(page)
arr=[]
for link in p.links:
    href=urljoin(URL,link['href'])
    if urlparse(href).hostname and urlparse(href).hostname.endswith('jada.or.jp') and ('.pdf' in href.lower() or 'ブランド' in link['title'] or '乗用車' in link['title'] or '通称名' in link['title']):
        arr.append({'href':href[:300],'title':link['title'][:120]})
summary={'bytes':len(raw),'http':status,'final':final,'title_keywords':{t:page.count(t) for t in ['乗用車ブランド','2026年9月','2026年8月','2026年4月','pdf','files/libs/']},'links':arr[:90],'links_total':len(arr)}
Path('data').mkdir(exist_ok=True)
Path('data/jada_discovery.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Discovered',len(arr),'matching links',summary['title_keywords'])
