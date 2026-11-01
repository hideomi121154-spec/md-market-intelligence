#!/usr/bin/env python3
"""Normalize carefully transcribed e-Stat table 12 rows to MD MARKET JSON.
Never claims the manual CSV has been automatically checked against the workbook.
Usage:
 python scripts/normalize_prefecture_jobs.py --csv my_prefecture_monthly.csv \
   --published-on 2026-10-30 --out prefecture-data-local.json
Input CSV has exactly: month,prefecture,new_job_offers
Every month must have all 47 prefectures, and duplicate months/areas are rejected.
"""
import argparse,csv,datetime,json,re
from pathlib import Path

PREF=("北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 "
"埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 "
"岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 "
"鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 "
"福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県").split()
SOURCE="https://www.e-stat.go.jp/stat-search/files?cycle=1&layout=dataset&page=1&toukei=00450222&tstat=000001020327"
def normalize(rows,published_on):
    dt=datetime.date.fromisoformat(published_on)
    monthly={}
    for r in rows:
        if set(r)!= {'month','prefecture','new_job_offers'}:raise ValueError('CSV header mismatch')
        month,name=r['month'].strip(),r['prefecture'].strip()
        if not re.fullmatch(r'20\d\d-(0[1-9]|1[0-2])',month):raise ValueError('bad month')
        if name not in PREF:raise ValueError('unknown prefecture: '+name)
        amount=r['new_job_offers'].strip()
        if not amount.isascii() or not amount.isdecimal():raise ValueError('non integer new job offers')
        amount=int(amount)
        if amount>2000000:raise ValueError('implausible number')
        bucket=monthly.setdefault(month,{})
        if name in bucket:raise ValueError('duplicate prefecture and month: '+month+' '+name)
        bucket[name]=amount
    if not monthly:raise ValueError('no monthly values')
    if max(monthly)>dt.strftime('%Y-%m'):raise ValueError('publication date before latest month')
    for month,areas in monthly.items():
        if set(areas)!=set(PREF):raise ValueError(f'{month}: expected 47 prefectures; got {len(areas)}')
    return {
      "schema_version":1,"dataset":"hello_work_prefecture_new_offers",
      "geography":"accepted_at_prefecture","measure":"monthly_new_job_offers_original_count",
      "source_type":"user_import_unverified","source_url":SOURCE,"source_table":"long_term_table_12",
      "available":True,"published_on":published_on,
      "months":[{"month":month,"values":{p:monthly[month][p] for p in PREF}} for month in sorted(monthly)]
    }
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--csv',type=Path,required=True)
    ap.add_argument('--published-on',required=True)
    ap.add_argument('--out',type=Path,required=True)
    args=ap.parse_args()
    with args.csv.open(newline='',encoding='utf-8-sig') as f:
      result=normalize(csv.DictReader(f),args.published_on)
    args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"Normalized {len(result['months'])} fully-covered month(s), marked as unverified user import.")
if __name__=='__main__':main()
