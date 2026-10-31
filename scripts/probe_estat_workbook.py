import io,re,zipfile,requests,openpyxl
# Probe only: no data files are committed.
URL='https://www.e-stat.go.jp/stat-search/files?cycle=1&layout=dataset&page=1&toukei=00450222&tstat=000001020327'
u='https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040505323&fileKind=0'
for url in [URL,'https://www.e-stat.go.jp/stat-search/files?layout=dataset&stat_infid=000040505323&toukei_kind=8']:
 try:
  r=requests.get(url,timeout=25,headers={'User-Agent':'Mozilla/5.0'},allow_redirects=True)
  print('PAGE',url,r.status_code,r.url,len(r.content),r.text[:200])
  print('ID MATCHES',re.findall(r'(?:stat_infid|statInfId)[^"<>]{0,60}',r.text)[:20])
  print('2026 9',r.text.find('令和8年9月'),r.text.find('長期時系列表 12'))
 except Exception as exc:print(type(exc).__name__,exc)
try:
 r=requests.get(u,timeout=35,headers={'User-Agent':'Mozilla/5.0'},allow_redirects=True)
 print('XLS',r.status_code,r.url,len(r.content),r.headers.get('Content-Type'),r.content[:16])
 if r.content[:2]==b'PK':
  book=openpyxl.load_workbook(io.BytesIO(r.content),read_only=True,data_only=True)
  for sheet in book.worksheets[:3]:
   print('SHEET',sheet.title,sheet.max_row,sheet.max_column)
   for row in sheet.iter_rows(min_row=1,max_row=min(40,sheet.max_row or 40),values_only=True):
    vals=[(i+1,str(v)[:60]) for i,v in enumerate(row) if v is not None and str(v).strip()]
    if vals:print(vals[:19])
 elif r.content[:8]==b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':print('XLS BINARY OLD')
except Exception as exc:print(type(exc).__name__,exc)
