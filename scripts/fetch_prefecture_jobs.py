#!/usr/bin/env python3
"""Fetch/verify e-Stat 00450222 long-term Table 12, sheet 1 only.

Explicit scope: accepted-prefecture, monthly NEW offers (original count),
"一般（パートタイムを含む）", not active offers, not posting counts,
not place of actual employment, not seasonally adjusted.

The XLSX is decoded using Python standard-library XML+ZIP. Any change in
table title, 47 prefecture column order, monthly totals or units FAILS CLOSED.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import html
import io
import json
from pathlib import Path
import re
import sys
import unicodedata
from urllib.error import HTTPError
from urllib.request import build_opener, HTTPCookieProcessor, Request
from http.cookiejar import CookieJar
from xml.etree import ElementTree as ET
from zipfile import ZipFile, is_zipfile

INDEX = "https://www.e-stat.go.jp/stat-search/files?cycle=1&layout=dataset&page=1&toukei=00450222&tstat=000001020327"
SOURCE = INDEX
ORIGIN = "https://www.e-stat.go.jp"
KNOWN_SEPT_2026_ID = "000040518992"  # verified 2026-11-02 against actual e-Stat file listing
PREF = ("北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 "
        "埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 "
        "岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 "
        "鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 "
        "福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県").split()
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
MAX_BYTES = 8_000_000

def visible(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()

def discover_document(index_html):
    """Use the title *next to* the download link, never its position in the list."""
    rex = re.compile(r'href="/stat-search/file-download\?statInfId=(\d{10})&fileKind=0"')
    matches = list(rex.finditer(index_html))
    eligible = []
    for i, hit in enumerate(matches):
        following = index_html[hit.end():matches[i+1].start() if i+1<len(matches) else hit.end()+4500]
        block = visible(following[:4500])
        if not re.search(r"長期時系列表\s*12\s*都道府県.*新規求人数（実数）", block):
            continue
        if "新規求職申込件数" in block.split("長期時系列表 12",1)[-1].split("長期時系列表",1)[0]:
            raise ValueError("統計表の題名が別表に切り替わっています")
        month = re.search(r"調査年月\s*(\d{4})年\s*(\d{1,2})月", block)
        published = re.search(r"公開（更新）日\s*(\d{4}-\d{2}-\d{2})", block)
        if month and published:
            ym = f"{int(month[1]):04}-{int(month[2]):02}"
            eligible.append((ym,published[1],hit[1]))
    if not eligible:
        raise ValueError("e-Stat一覧から長期時系列表12の公表年月・Excel IDを確認できません")
    return max(eligible)

def col(n):
    s=""
    while n:
        n,r=divmod(n-1,26);s=chr(65+r)+s
    return s

def parse_workbook(data):
    if len(data)>MAX_BYTES or not is_zipfile(io.BytesIO(data)):
        raise ValueError("公式のExcelファイルとして認識できません")
    with ZipFile(io.BytesIO(data)) as z:
        files=set(z.namelist())
        if "xl/workbook.xml" not in files or "xl/worksheets/sheet1.xml" not in files:
            raise ValueError("公式Excelのシート定義が不足しています")
        w=ET.fromstring(z.read("xl/workbook.xml"))
        sheets=w.findall("m:sheets/m:sheet",NS)
        if len(sheets)<3 or "パート含む一般" not in (sheets[0].get("name") or ""):
            raise ValueError("最初のシートがパートタイムを含む一般新規求人数ではありません")
        shared=[]
        if "xl/sharedStrings.xml" in files:
            root=ET.fromstring(z.read("xl/sharedStrings.xml"))
            for item in root.findall("m:si",NS):
                texts=item.findall("m:r/m:t",NS)
                if not texts:
                    texts=item.findall("m:t",NS)
                shared.append("".join(x.text or "" for x in texts))
        xml=ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
        rows=[]
        for row in xml.findall("m:sheetData/m:row",NS):
            record={}
            for cell in row.findall("m:c",NS):
                addr=cell.get("r","")
                v=cell.find("m:v",NS)
                inline=cell.find("m:is",NS)
                if v is not None:
                    text=v.text or ""
                    if cell.get("t")=="s":
                        try:text=shared[int(text)]
                        except (ValueError,IndexError):raise ValueError("共有文字列が不正です") from None
                elif inline is not None:
                    text="".join(e.text or "" for e in inline.findall(".//m:t",NS))
                else:continue
                record[re.sub(r"\d+","",addr)]=unicodedata.normalize("NFKC",str(text)).strip()
            rows.append(record)
    return rows

def extract_months(rows,published_on):
    if len(rows)<36:
        raise ValueError("公表Excelの行数が不足しています")
    title=rows[0].get("A","")
    if not all(q in title for q in ["都道府県","新規求人数","実数","パートタイムを含む一般"]):
        raise ValueError("表題が都道府県別・パート含む一般の新規求人数と一致しません")
    header=rows[1]
    if header.get("D")!="全国":
        raise ValueError("全国の列見出しがD列にありません")
    for i,pref in enumerate(PREF,5):
        h=header.get(col(i),"")
        if not h.startswith(pref):
            raise ValueError(f"{col(i)}列が{pref}ではありません：{h}")
    if rows[2].get("D","").replace(" ","") not in ("人","人ヒト"):
        raise ValueError("単位は人である必要があります")
    months=[]
    for row in rows[3:]:
        month_text=row.get("C","")
        m=re.fullmatch(r"(\d{1,2})月",month_text)
        if not m:continue  # annual / FY average is *not* a monthly observation
        yr=re.match(r"^(20\d{2})年",row.get("A",""))
        if not yr:raise ValueError("月別行の西暦年が不正です")
        mon=int(m[1])
        if not 1<=mon<=12:raise ValueError("月が1〜12の範囲外です")
        period=f"{yr[1]}-{mon:02}"
        if period>published_on[:7]:
            raise ValueError("公表日より先の月が収録されています")
        if months and period<=months[-1]["month"]:
            raise ValueError("月別データが昇順ではないか重複しています")
        vals={}
        for i,pref in enumerate(PREF,5):
            v=row.get(col(i),"")
            if not re.fullmatch(r"\d{1,7}",v):
                raise ValueError(f"{period} {pref}の月間新規求人数が整数ではありません")
            amount=int(v)
            if amount>2_000_000:raise ValueError("都道府県別の月間台数が上限を超えました")
            vals[pref]=amount
        nat=row.get("D","")
        if not re.fullmatch(r"\d{1,9}",nat):raise ValueError("全国合計が整数ではありません")
        national=int(nat)
        if sum(vals.values())!=national:
            raise ValueError(f"{period}全国{national}と47都道府県合計{sum(vals.values())}が不一致です")
        months.append({"month":period,"values":vals})
    if not months:
        raise ValueError("月次データが見つかりません")
    if months[-1]["month"]!=published_on[:7] and months[-1]["month"]<published_on[:7]:
        # Excel may be published in following calendar month; acceptable.
        pass
    if len(months)<14:raise ValueError("前年同期比較に必要な月次データが不足しています")
    return months[-36:]

def build_document(index_html,workbook_bytes,expected_id=None):
    ym,published,stat_id=discover_document(index_html)
    if expected_id and expected_id!=stat_id:
        raise ValueError("指定したExcel IDと一覧の最新表12が異なります")
    rows=parse_workbook(workbook_bytes)
    months=extract_months(rows,published)
    if months[-1]["month"]!=ym:
        raise ValueError(f"公表一覧 {ym} とExcelの最新月 {months[-1]['month']} が違います")
    return {
        "schema_version":1,"dataset":"hello_work_prefecture_new_offers",
        "geography":"accepted_at_prefecture",
        "measure":"monthly_new_job_offers_original_count",
        "source_type":"e_stat_file_verified","source_url":SOURCE,"source_table":"long_term_table_12",
        "available":True,"published_on":published,
        "source_file_id":stat_id,
        "source_file_url":f"{ORIGIN}/stat-search/files?layout=dataset&stat_infid={stat_id}&toukei=00450222",
        "source_sha256":hashlib.sha256(workbook_bytes).hexdigest(),
        "series_definition":"パートタイムを含む一般・受理地別・新規求人数・原数値",
        "months":months
    }

def fetch():
    opener=build_opener(HTTPCookieProcessor(CookieJar()))
    def get(url,ref=None):
        headers={"User-Agent":"Mozilla/5.0","Accept":"*/*"}
        if ref:headers["Referer"]=ref
        try:
            with opener.open(Request(url,headers=headers),timeout=30) as r:
                data=r.read(MAX_BYTES+1)
                if len(data)>MAX_BYTES:raise ValueError("原本ファイルが上限を超えました")
                return data
        except HTTPError as e:
            raise ValueError(f"e-Stat取得失敗 HTTP {e.code}。古いデータは維持します") from None
    page=get(INDEX).decode("utf-8")
    ym,published,ident=discover_document(page)
    link=f"{ORIGIN}/stat-search/file-download?statInfId={ident}&fileKind=0"
    binary=get(link,INDEX)
    result=build_document(page,binary,ident)
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out",type=Path,default=Path(__file__).resolve().parents[1]/"data/prefecture_jobs.json")
    parser.add_argument("--check-only",action="store_true")
    args=parser.parse_args()
    doc=fetch()
    if args.out.exists():
        previous=json.loads(args.out.read_text(encoding="utf-8"))
        if previous.get("available") and previous.get("source_type")=="e_stat_file_verified":
            old=max(x["month"] for x in previous["months"])
            new=doc["months"][-1]["month"]
            if new<old:raise ValueError("公開済みの最新月より古い原本なので置き換えません")
            compare={k:v for k,v in previous.items() if k!="checked_at_utc"}
            if compare==doc:
                print("UNCHANGED: official prefecture dataset matches the published Excel")
                return
    print(f"VERIFIED: official {doc['months'][-1]['month']}, {len(doc['months'])} months x 47 prefectures; "+
        f"source workbook #{doc['source_file_id']} (published {doc['published_on']})")
    if not args.check_only:
        args.out.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print("SAVED: "+str(args.out))

if __name__=="__main__":
    try:main()
    except (ValueError,KeyError,ET.ParseError) as e:
        print("SAFE STOP: "+str(e),file=sys.stderr);raise SystemExit(1)
