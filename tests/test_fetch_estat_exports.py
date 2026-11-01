"""Offline validation of the official e-Stat import; no real credentials."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("estat",root/"scripts/fetch_estat_used_car_exports.py")
M=importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)
def metadata():
 return {"TABLE_INF":{"TITLE":{"$":"確報 品別国別表 輸出(1-9月：確報) 2026年"}},
  "CLASS_INF":{"CLASS_OBJ":[
   {"@id":"cat01","CLASS":[{"@code":c,"@name":c} for c in M.HS]},
   {"@id":"cat02","CLASS":[{"@code":c,"@name":str(i+1)+"月_数量1"} for i,c in enumerate(M.MONTH_CODES)]+[{"@code":"100","@name":"単位1"}]},
   {"@id":"area","CLASS":[{"@code":"50224","@name":"224_ロシア"}]},
   {"@id":"time","CLASS":[{"@code":"2026000000","@name":"2026年"}]}
  ]}}
class Tests(unittest.TestCase):
 def test_metadata(self):
  codes,areas,times=M.validate_metadata(metadata(),"0004049306")
  self.assertEqual(len(codes),16)
  self.assertEqual(areas["50224"],"224_ロシア")
  payload={"STATISTICAL_DATA":{"DATA_INF":{"VALUE":[
    {"@cat01":"870322910","@cat02":"100","@area":"50224","@time":"2026000000","$":"NO"},
    {"@cat01":"870322910","@cat02":"390","@area":"50224","@time":"2026000000","$":"1024"},
    {"@cat01":"870322910","@cat02":"150","@area":"50224","@time":"2026000000","$":"0"},
    {"@cat01":"870322910","@cat02":"180","@area":"50224","@time":"2026000000","$":"-"}]}}}
  rows=M.parse_values(payload,codes,areas,times,"0004049306")
  self.assertEqual(len(rows),2)
  self.assertEqual([v["units"] for v in rows if v["period"]=="2026-09"],[1024])
  self.assertEqual([v["units"] for v in rows if v["period"]=="2026-01"],[0])
  self.assertFalse(any(v["period"]=="2026-02" for v in rows))
  payload["STATISTICAL_DATA"]["DATA_INF"]["VALUE"][0]["$"]="KG"
  with self.assertRaisesRegex(ValueError,"NO"):
   M.parse_values(payload,codes,areas,times,"0004049306")
  payload["STATISTICAL_DATA"]["DATA_INF"]["VALUE"][0]["$"]="NO"
  payload["STATISTICAL_DATA"]["DATA_INF"]["VALUE"][1]["$"]="秘匿"
  with self.assertRaisesRegex(ValueError,"整数"):
   M.parse_values(payload,codes,areas,times,"0004049306")
  bad=metadata()
  bad["CLASS_INF"]["CLASS_OBJ"][1]["CLASS"][8]["@name"]="9月_金額"
  with self.assertRaisesRegex(ValueError,"数量1"):
   M.validate_metadata(bad,"0004049306")
 def test_discovery(self):
  api={"GET_STATS_LIST":{"RESULT":{"STATUS":0},"DATALIST_INF":{"TABLE_INF":[
   {"@id":"0004049305","TITLE":{"$":"確報 品別国別表 輸出(1-8月：確報) 2026年"},"OPEN_DATE":"2026-09-29"},
   {"@id":"0004049306","TITLE":{"$":"確報 品別国別表 輸出(1-9月：確報) 2026年"},"OPEN_DATE":"2026-10-29"},
   {"@id":"0004049999","TITLE":{"$":"確報 品別国別表 輸入(1-9月：確報) 2026年"}},
   {"@id":"0004048888","TITLE":{"$":"税関別品別国別表 輸出(1-9月) 2026年"}}]}}}
  with patch.object(M,"api_json",return_value=api):
   id,title=M.find_dataset("secret-not-to-display")
  self.assertEqual(id,"0004049306")
  self.assertTrue(M.suitable_title(title))
 def test_output(self):
  out=M.make_document("0004049306","確報 品別国別表 輸出(1-9月：確報) 2026年",
   [{"period":"2026-09","country":"ロシア","hs_code":"870322910","area_code":"50224","units":5}])
  self.assertEqual(out["months"],["2026-09"])
  self.assertEqual(out["status"],"available")
  self.assertNotIn("appId",json.dumps(out))
if __name__=="__main__":unittest.main()
