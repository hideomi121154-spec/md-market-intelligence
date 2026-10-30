"""TEMPORARY: inspect five official JADA annual-ranking PDF page layouts."""
import json,urllib.request
from pathlib import Path
import fitz
URLS={2021:"https://www.jada.or.jp/files/libs/6127/202509241143583379.pdf",2022:"https://www.jada.or.jp/files/libs/6120/202509241131464590.pdf",2023:"https://www.jada.or.jp/files/libs/6128/202509241144117936.pdf",2024:"https://www.jada.or.jp/files/libs/6122/20250924113213650.pdf",2025:"https://www.jada.or.jp/files/libs/6986/202604031138081429.pdf"}
results=[]
for year,url in URLS.items():
 try:
  req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 MDMarket stats research"})
  with urllib.request.urlopen(req,timeout=25) as response:
   body=response.read(2_500_000); mime=response.headers.get("Content-Type");final=response.url
  entry={"year":year,"http_source":final,"mime":mime,"bytes":len(body),"magic":body[:12].hex()}
  if body.startswith(b"%PDF-"):
   doc=fitz.open(stream=body,filetype="pdf")
   entry["pages"]=len(doc); entry["page_headers"]=[]
   if year in (2022,2023):
    last=doc[-1]
    entry["last_page_samples"]={}
    import re
    for fraction in (.44,.45,.46,.47,.48,.49):
     txt=last.get_text("text",sort=True,clip=fitz.Rect(last.rect.width*fraction,0,last.rect.width,last.rect.height))
     lines=[l.strip() for l in txt.splitlines() if l.strip()]
     matched=[l for l in lines if re.match(r'^\d{1,2}\s+[^\s]+\s+(?:トヨタ|日産|ホンダ|スズキ|マツダ|三菱|ダイハツ|レクサス|SUBARU)\s+[0-9,]+',l)]
     entry["last_page_samples"][str(fraction)]={"count":len(matched),"first":matched[:3],"last":matched[-3:],"start":lines[:9]}

   for p in doc:
    t=p.get_text("text",sort=True)
    first=[l.strip() for l in t.splitlines() if l.strip()][:5]
    # summarize last parts on all pages to find yearly totals
    right=p.get_text("text",sort=True,clip=fitz.Rect(p.rect.width/2,0,p.rect.width,p.rect.height))
    rl=[l.strip() for l in right.splitlines() if l.strip()]
    entry["page_headers"].append({"page":p.number+1,"first":first[:3],"last":first[-1:] ,"right_last":rl[-5:],"right_first":rl[:7],"right_count":len(rl)})
  results.append(entry)
 except Exception as e:results.append({"year":year,"error":str(e)})
Path("data").mkdir(exist_ok=True)
Path("data/annual_pdf_layout_diag.json").write_text(json.dumps(results,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print([(x["year"],x.get("pages"),x.get("error"),x.get("mime")) for x in results])
