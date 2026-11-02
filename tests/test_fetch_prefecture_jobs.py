"""Synthetic workbook tests for official Excel importer. No fake data is shipped."""
import io
import json
import sys
import unittest
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
from xml.sax.saxutils import escape
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import fetch_prefecture_jobs as S

def fixture():
    dates=[f"2025-{m:02}" for m in range(8,13)]+[f"2026-{m:02}" for m in range(1,10)]
    rows=[{"A":"都道府県（受理地）別 雇用形態別 新規求人数（実数）（パートタイムを含む一般）"},
     {"D":"全国",**{S.col(i):p for i,p in enumerate(S.PREF,5)}},
     {"D":"人"}]
    for i,month in enumerate(dates):
        vals={S.col(j):str(1000+j*10+i*3) for j in range(5,52)}
        rows.append({"A":month[:4]+"年","C":str(int(month[5:]))+"月","D":str(sum(int(v) for v in vals.values())),**vals})
    return rows

def zip_fixture(rows):
    xml=['<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>']
    for j,row in enumerate(rows,1):
        xml.append(f'<row r="{j}">')
        for col,txt in row.items():
            addr=f"{col}{j}"
            if txt.isdecimal(): xml.append(f'<c r="{addr}"><v>{txt}</v></c>')
            else:xml.append(f'<c r="{addr}" t="inlineStr"><is><t>{escape(txt)}</t></is></c>')
        xml.append('</row>')
    xml.append('</sheetData></worksheet>')
    book='<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets>'+''.join(
      f'<sheet name="{name}" sheetId="{i}"/>' for i,name in enumerate(
      ["第１２表－１（パート含む一般）","第１２表－２（パート除く一般）","第１２表－３（一般パート）"],1))+'</sheets></workbook>'
    bio=io.BytesIO()
    with ZipFile(bio,"w",ZIP_DEFLATED) as z:
        z.writestr("xl/workbook.xml",book)
        z.writestr("xl/worksheets/sheet1.xml","".join(xml))
    return bio.getvalue()

class TestOfficialImporter(unittest.TestCase):
 def test_discovery_month_and_title_not_numeric_position(self):
  html='<a href="/stat-search/file-download?statInfId=000040518991&fileKind=0">Excel</a> 長期時系列表 11 別の表 調査年月 2026年9月 公開（更新）日 2026-10-30 '+\
    '<a href="/stat-search/file-download?statInfId=000040518992&fileKind=0">Excel</a> 長期時系列表 12 都道府県（受理地）別 雇用形態別 新規求人数（実数） 調査年月 2026年9月 公開（更新）日 2026-10-30 '+\
    '<a href="/stat-search/file-download?statInfId=000040518993&fileKind=0">Excel</a> 長期時系列表 13 新規求職申込件数 調査年月 2026年9月'
  self.assertEqual(S.discover_document(html),("2026-09","2026-10-30","000040518992"))
 def test_extract_and_strict_sheet_selection(self):
  rows=fixture()
  months=S.extract_months(rows,"2026-10-30")
  self.assertEqual(len(months),14)
  self.assertEqual(months[-1]["month"],"2026-09")
  self.assertEqual(months[0]["month"],"2025-08")
  self.assertEqual(months[-1]["values"]["愛知県"],1000+S.PREF.index("愛知県")*10+5*10+13*3)
  blob=zip_fixture(rows)
  parsed=S.parse_workbook(blob)
  self.assertEqual(len(parsed),len(rows))
  self.assertEqual(S.extract_months(parsed,"2026-10-30"),months)
  with self.assertRaisesRegex(ValueError,"Excel"):
   S.parse_workbook(b"not excel")
  self.assertTrue(parsed[0]["A"].find("パートタイムを含む一般")>0)
 def test_wrong_total_must_fail(self):
  rows=fixture();rows[-1]["D"]="9999999"
  with self.assertRaisesRegex(ValueError,"不一致"):
   S.extract_months(rows,"2026-10-30")
 def test_missing_pref_and_swapped_columns_must_fail(self):
  rows=fixture();rows[-1].pop(S.col(28))
  with self.assertRaisesRegex(ValueError,"整数"):
   S.extract_months(rows,"2026-10-30")
  rows=fixture();rows[1]["E"]="青森県";rows[1]["F"]="北海道"
  with self.assertRaisesRegex(ValueError,"北海道"):
   S.extract_months(rows,"2026-10-30")
 def test_wrong_series_or_month_must_fail(self):
  rows=fixture();rows[0]["A"]="パートタイムを除く一般 新規求人数"
  with self.assertRaisesRegex(ValueError,"表題"):
   S.extract_months(rows,"2026-10-30")
  rows=fixture();rows[-1]["C"]="10月"
  with self.assertRaisesRegex(ValueError,"公表日"):
   S.extract_months(rows,"2026-09-30")
 def test_year_average_must_not_count_as_month(self):
  rows=fixture()
  rows.insert(3,{"A":"2025年","C":"","D":"1"})
  self.assertEqual(len(S.extract_months(rows,"2026-10-30")),14)

if __name__=="__main__":unittest.main(verbosity=2)
