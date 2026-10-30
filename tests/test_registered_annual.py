import unittest
from scripts.fetch_registered_annual import (extract_rows,check_rows,repair_2023_pdf_text,normalized)

class AnnualTests(unittest.TestCase):
 def test_2022_rejects_incomplete(self):
  with self.assertRaises(ValueError):extract_rows('1 ヤリス トヨタ 168,557 79.2',2022)
 def test_yearly_order(self):
  rows=[{'rank':i+1,'make':'トヨタ','model':'車'+str(i),'units':150000-i*100} for i in range(50)]
  check_rows(rows,2022)
  rows[4]['units']=190000
  with self.assertRaises(ValueError):check_rows(rows,2022)
 def test_rank_duplicate(self):
  rows=[{'rank':i+1,'make':'トヨタ','model':'車'+str(i),'units':150000-i*100} for i in range(50)]
  rows[5]['rank']=5
  with self.assertRaises(ValueError):check_rows(rows,2023)
 def test_2023_split_maker_fixed_without_price_changes(self):
  body=('22 インプレッサ\nＳＵＢＡＲ\nＵ 34,371 149.2\n'
        '30 フォレスター\nＳＵＢＡＲ\nＵ 22,141 88.2\n'
        '37 レヴォーグ ＳＵＢＡＲ 15,267 106.9\n')
  out=repair_2023_pdf_text(body)
  self.assertIn('22 インプレッサ SUBARU 34,371 149.2',out)
  self.assertIn('30 フォレスター SUBARU 22,141 88.2',out)
  self.assertIn('37 レヴォーグ SUBARU 15,267 106.9',out)
 def test_2023_never_guess_missing_maker(self):
  with self.assertRaises(ValueError):repair_2023_pdf_text('22 インプレッサ SUBARU 34,371 149.2')
 def test_nfkc_month(self):
  self.assertIn('2023年1月',normalized('２０２３年１月'))
if __name__=='__main__':unittest.main()
