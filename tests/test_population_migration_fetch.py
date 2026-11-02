"""Offline tests for the official prefecture migration Excel parser."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import fetch_population_migration as src

def fixture():
    rows={1:{"A":"表２ 都道府県別転入・転出者数（移動者）"},
          3:{"A":"都道府県","B":"転 入 者 数","F":"転 出 者 数","J":"転 入 超 過 数"},
          5:{"B":"2026年9月","C":"2025年9月","F":"2026年9月",
             "G":"2025年9月","J":"2026年9月","K":"2025年9月"},
          8:{"A":"全国","B":str(47*100),"C":str(47*120),
             "F":str(47*100),"G":str(47*120),"J":"0","K":"0"}}
    for i,name in enumerate(src.PREF,9):
        rows[i]={"A":name,"B":"100","C":"120","F":"100","G":"120","J":"0","K":"0"}
    return rows

class TestOfficialMigration(unittest.TestCase):
    def test_47_prefecture_month_and_national_reconciliation(self):
        data=src.extract(fixture())
        self.assertEqual(sorted(data),["2025-09","2026-09"])
        self.assertEqual(len(data["2026-09"]),47)
        self.assertEqual(data["2026-09"]["島根県"],{"in":100,"out":100})

    def test_reject_wrong_net_and_missing_prefecture(self):
        rows=fixture()
        rows[40]["J"]="-2"
        with self.assertRaisesRegex(ValueError,"差引"):
            src.extract(rows)
        rows=fixture()
        rows.pop(55)
        with self.assertRaisesRegex(ValueError,"47|沖縄"):
            src.extract(rows)

    def test_reject_wrong_country_total_and_title(self):
        rows=fixture()
        rows[8]["B"]="999"
        with self.assertRaisesRegex(ValueError,"全国合計"):
            src.extract(rows)
        rows=fixture()
        rows[1]["A"]="別の統計"
        with self.assertRaisesRegex(ValueError,"表題"):
            src.extract(rows)

    def test_parse_publication_date(self):
        self.assertEqual(src.publication_date("令和8年10月27日公表"),"2026-10-27")
        with self.assertRaisesRegex(ValueError,"公表日"):
            src.publication_date("未公表")

if __name__=="__main__":
    unittest.main()
