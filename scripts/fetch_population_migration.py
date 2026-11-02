#!/usr/bin/env python3
"""Fetch and verify Statistics Bureau interprefectural migration, Table 2.
No API key, no scraping of private data. Reads official XLSX with stdlib ZIP/XML.
Only a complete, reconciled 47-prefecture table is published; otherwise fail closed.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import io
import json
import re
import sys
from pathlib import Path
import unicodedata
import urllib.request
from xml.etree import ElementTree as ET
from zipfile import ZipFile, is_zipfile

INDEX = "https://www.stat.go.jp/data/idou/sokuhou/tsuki/"
XLSX = INDEX + "zuhyou/hyo02.xlsx"
PREF = ("北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県").split()
N = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
MAX_SIZE = 2_000_000

def normalize(text):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(text or "")))

def read_workbook(binary):
    if len(binary)>MAX_SIZE or not is_zipfile(io.BytesIO(binary)):
        raise ValueError("公式Excelの形式・サイズが不正です")
    with ZipFile(io.BytesIO(binary)) as z:
        members=set(z.namelist())
        if "xl/worksheets/sheet1.xml" not in members:
            raise ValueError("公式Excelの最初のシートを取得できません")
        shared=[]
        if "xl/sharedStrings.xml" in members:
            root=ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall(N+"si"):
                shared.append("".join((t.text or "") for t in si.iter(N+"t")))
        rows={}
        root=ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
        for row in root.findall(".//"+N+"sheetData/"+N+"row"):
            idx=int(row.get("r",0));cells={}
            for c in row.findall(N+"c"):
                match=re.match(r"([A-Z]+)\d+",c.get("r",""))
                if not match:continue
                v=c.find(N+"v");ins=c.find(N+"is")
                if v is not None:
                    text=v.text or ""
                    if c.get("t")=="s":text=shared[int(text)]
                elif ins is not None:
                    text="".join((t.text or "") for t in ins.iter(N+"t"))
                else:continue
                cells[match[1]]=str(text).strip()
            rows[idx]=cells
    return rows

def month_in(text):
    m=re.search(r"(20\d{2})年\s*(1[0-2]|[1-9])月",normalize(text))
    if not m:raise ValueError("表2の年月を確認できません")
    return f"{m[1]}-{int(m[2]):02}"

def positive_integer(text):
    text=normalize(text)
    if not re.fullmatch(r"\d{1,8}",text):
        raise ValueError("月間の転入・転出数が0以上の整数ではありません: "+text[:45])
    return int(text)

def signed_integer(text):
    text=normalize(text).replace("−","-").replace("－","-")
    if not re.fullmatch(r"-?\d{1,9}",text):
        raise ValueError("転入超過が整数ではありません: "+text[:45])
    return int(text)

def extract(rows):
    if "都道府県別転入・転出者数" not in (rows.get(1,{}) .get("A","")):
        raise ValueError("表題が人口移動・都道府県別表2ではありません")
    h=rows.get(3,{})
    for col,value in (("A","都道府県"),("B","転入者数"),("F","転出者数"),("J","転入超過数")):
        if normalize(value) not in normalize(h.get(col,"")):
            raise ValueError(f"ヘッダ{col}が一致しません")
    r5=rows.get(5,{})
    month=month_in(r5.get("B"));previous=month_in(r5.get("C"))
    if month_in(r5.get("F"))!=month or month_in(r5.get("J"))!=month:
        raise ValueError("転入・転出・転入超過の最新月が一致しません")
    if month_in(r5.get("G"))!=previous or month_in(r5.get("K"))!=previous:
        raise ValueError("前年同月の列が一致しません")
    if int(month[:4])-int(previous[:4])!=1 or month[5:]!=previous[5:]:
        raise ValueError("前年同月比較ではありません")
    out={month:{},previous:{}}
    totals={month:{"in":0,"out":0},previous:{"in":0,"out":0}}
    for i,name in enumerate(PREF,9):
        row=rows.get(i,{})
        if normalize(row.get("A"))!=name:raise ValueError(f"{i}行の都道府県が{name}と一致しません")
        for period,inc,outc,netc in ((month,"B","F","J"),(previous,"C","G","K")):
            in_count=positive_integer(row.get(inc))
            out_count=positive_integer(row.get(outc))
            if signed_integer(row.get(netc))!=in_count-out_count:
                raise ValueError(f"{period} {name}の転入超過が差引と不一致")
            out[period][name]={"in":in_count,"out":out_count}
            totals[period]["in"]+=in_count;totals[period]["out"]+=out_count
    national=rows.get(8,{})
    for period,inc,outc,netc in ((month,"B","F","J"),(previous,"C","G","K")):
        a=positive_integer(national.get(inc));b=positive_integer(national.get(outc))
        if a!=b or totals[period]!={"in":a,"out":b} or signed_integer(national.get(netc))!=0:
            raise ValueError(f"{period}の全国合計と47都道府県の合計が不一致")
    return out

def publication_date(page):
    # The Statistics Bureau labels its publication as Reiwa year/month/day.
    m=re.search(r"令和\s*([0-9０-９]{1,2})年\s*([0-9０-９]{1,2})月\s*([0-9０-９]{1,2})日公表",page)
    if not m:raise ValueError("公式結果ページの公表日が不明です")
    yr=2018+int(unicodedata.normalize("NFKC",m[1]))
    return dt.date(yr,int(unicodedata.normalize("NFKC",m[2])),int(unicodedata.normalize("NFKC",m[3]))).isoformat()

def verified_document(page,workbook,previous=None):
    published=publication_date(page)
    extracted=extract(read_workbook(workbook))
    current=max(extracted)
    if published[:7]<current:
        raise ValueError("公表日が対象月より前です")
    digest=hashlib.sha256(workbook).hexdigest()
    saved={}
    if previous and previous.get("available") and previous.get("source_type")=="stat_go_jp_xlsx_verified":
        for x in previous.get("months",[]):
            if x["month"]<=current:saved[x["month"]]=x
    for month,values in extracted.items():
        saved[month]={"month":month,"values":values,
            "source_file_url":XLSX,"source_sha256":digest,"source_published_on":published}
    return {"schema_version":1,"dataset":"interprefecture_migration_total",
        "geography":"prefecture","measure":"monthly_in_out_domestic_moves",
        "source_url":INDEX,"source_table":"stat_go_jp_table_2","available":True,
        "source_type":"stat_go_jp_xlsx_verified","published_on":published,
        "source_file_url":XLSX,"source_sha256":digest,
        "series_definition":"全移動者・国内他都道府県間転入者数/転出者数（実数）",
        "months":[saved[k] for k in sorted(saved)[-36:]]}

def fetch(url):
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (public statistical verification)"})
    with urllib.request.urlopen(req,timeout=30) as response:
        data=response.read(MAX_SIZE+1)
    if len(data)>MAX_SIZE:raise ValueError("公表資料が上限を超えました")
    return data

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--out",type=Path,default=Path(__file__).resolve().parents[1]/"data/prefecture_migration.json")
    ap.add_argument("--check-only",action="store_true")
    args=ap.parse_args()
    previous=json.loads(args.out.read_text(encoding="utf-8")) if args.out.exists() else None
    result=verified_document(fetch(INDEX).decode("cp932"),fetch(XLSX),previous)
    print(f"VERIFIED migration {result['months'][-1]['month']}: {len(result['months'])} months x 47; SHA {result['source_sha256']}")
    if not args.check_only and result!=previous:
        args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print("Saved "+str(args.out))
    else:print("No write")

if __name__=="__main__":
    try:main()
    except (ValueError,KeyError,IndexError,ET.ParseError) as e:
        print("SAFE STOP: "+str(e),file=sys.stderr);raise SystemExit(1)
