import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from fetch_model_sales import candidate_urls, parse_monthly

MAKERS = ['ホンダ','スズキ','ダイハツ','ダイハツ','日産','スズキ','三菱','スズキ','ダイハツ','ダイハツ','スズキ','日産','スズキ','ホンダ','ホンダ']
MODELS = ['Ｎ-ＢＯＸ','スペーシア','タント','ムーヴ','ルークス','ハスラー','デリカミニ／ｅＫ','ワゴンＲ','ミラ','タフト','アルト','デイズ','ジムニー','Ｎ-ＷＧＮ','Ｎ-ＯＮＥ']
COUNTS = [19105,16088,12158,12119,10332,8158,7505,5308,4647,4491,4441,4260,2497,2146,2018]


def sample():
    rows = '<tr><th>順位</th><th>メーカー</th><th>通称名</th><th>本月</th><th>前月</th><th>前月比</th><th>前年同月</th><th>前年同月比</th></tr>'
    for i, (maker, model, n) in enumerate(zip(MAKERS, MODELS, COUNTS), 1):
        rows += f'<tr><td>{i}</td><td>{maker}</td><td>{model}</td><td>{n}</td><td>1000</td><td>110.0</td><td>900</td><td>105.0</td></tr>'
    return f'<html><title>2026年9月 軽四輪車 通称名別 新車販売確報</title><h2>乗用車ベスト15</h2><table>{rows}</table></html>'

class ModelSalesTest(unittest.TestCase):
    def test_parse_passenger_15(self):
        d=parse_monthly(sample(), 'https://www.zenkeijikyo.or.jp/statistics/tushokaku-14172')
        self.assertEqual(d['month'], '2026-09')
        self.assertEqual(d['models'][0]['units'], 19105)
        self.assertEqual(d['models'][-1]['model'],'Ｎ-ＯＮＥ')
    def test_reject_broken_table(self):
        with self.assertRaises(ValueError):parse_monthly('<title>2026年9月 軽四輪車 通称名別 新車販売確報</title>', 'x')
    def test_reject_nonmonthly(self):
        with self.assertRaises(ValueError):parse_monthly(sample().replace('2026年9月','2026年4月～9月'), 'x')
    def test_reject_out_of_order(self):
        with self.assertRaises(ValueError):parse_monthly(sample().replace('19105','1905'), 'x')
    def test_link_discovery(self):
        html='<a href="/statistics/tushokaku-13948">8</a><a href="https://www.zenkeijikyo.or.jp/statistics/tushokaku-14172">9</a>'
        self.assertEqual(candidate_urls(html)[0],'https://www.zenkeijikyo.or.jp/statistics/tushokaku-14172')

if __name__ == '__main__':unittest.main()