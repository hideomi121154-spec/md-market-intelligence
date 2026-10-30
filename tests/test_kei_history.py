"""Offline fixture tests for annual table and identity validation."""
import unittest
from scripts.fetch_kei_history import parse_annual, SOURCE_URLS

MAKERS=['ホンダ','スズキ','ダイハツ','日産','三菱']
MODELS=['Ｎ-ＢＯＸ','スペーシア','タント','ハスラー','ムーヴ','ワゴンＲ','ルークス','アルト','デイズ','タフト','ミラ','ジムニー','Ｎ-ＷＧＮ','サクラ','Ｎ-ＯＮＥ']

def fixture(year=2024):
    month_head='<table><tr><th>メーカー</th><th>通称名</th><th>本月</th><th>本年累計</th></tr></table>'
    header='<table><tr><th>順位</th><th>メーカー</th><th>通称名</th><th>本年累計</th><th>前年累計</th></tr>'
    rows=''.join(f'<tr><td>{i+1}</td><td>{MAKERS[i%len(MAKERS)]}</td><td>{name}</td><td>{200000-i*5000}</td><td>0</td></tr>' for i,name in enumerate(MODELS))
    return f'<h1>{year}年12月 軽四輪車 通称名別 新車販売確報</h1>'+month_head+header+rows+'</table>'

class TestAnnual(unittest.TestCase):
    def test_annual_extracted_not_monthly(self):
        data=parse_annual(fixture(),2024,SOURCE_URLS[2024])
        self.assertEqual(len(data['models']),15)
        self.assertEqual(data['models'][0]['units'],200000)
        self.assertEqual(data['models'][8]['model'],'デイズ')
    def test_reject_wrong_month(self):
        with self.assertRaises(ValueError):parse_annual(fixture(2024),2023,SOURCE_URLS[2023])
    def test_reject_incomplete(self):
        with self.assertRaises(ValueError):parse_annual(fixture().replace('<td>Ｎ-ＯＮＥ</td>','<td></td>'),2024,SOURCE_URLS[2024])
    def test_reject_non_official(self):
        with self.assertRaises(ValueError):parse_annual(fixture(),2024,'https://example.com/stats')
    def test_reject_duplicate_rank(self):
        x=fixture().replace('<td>三菱</td><td>Ｎ-ＯＮＥ</td>','<td>ホンダ</td><td>Ｎ-ＢＯＸ</td>')
        with self.assertRaises(ValueError):parse_annual(x,2024,SOURCE_URLS[2024])
if __name__=='__main__':unittest.main()