import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from fetch_registered_sales import ranking_pdf_links, parse_ranked_text, PERIOD_RE

class TestRegisteredCarSales(unittest.TestCase):
    def make_data(self, count=50):
        return '\n'.join(f'{i} 車名{i} トヨタ {15000-i*100:,} 104.1' for i in range(1,count+1))

    def test_exact_month_only_not_cumulative(self):
        self.assertIsNone(PERIOD_RE.fullmatch('乗用車ブランド通称名別順位 2026年4月～2026年9月分'))
        self.assertTrue(PERIOD_RE.fullmatch('乗用車ブランド通称名別順位 2026年9月分'))

    def test_valid_rows(self):
        rows = parse_ranked_text(self.make_data(), '2026-09')
        self.assertEqual(len(rows),50)
        self.assertEqual(rows[0]['units'],14900)

    def test_incomplete_ranking_rejected(self):
        with self.assertRaisesRegex(ValueError,'50 ordered'):
            parse_ranked_text(self.make_data(49), '2026-09')

    def test_out_of_order_rejected(self):
        text=self.make_data().splitlines()
        text[10],text[11]=text[11],text[10]
        with self.assertRaisesRegex(ValueError,'50 ordered'):
            parse_ranked_text('\n'.join(text),'2026-09')

    def test_official_links_only(self):
        html='<a href="/files/libs/7724/file.pdf">ブランド通称名別ランキング（2026年1月～9月）</a><a href="https://not-jada.example.com/data.pdf">ブランド通称名別ランキング</a>'
        self.assertEqual(ranking_pdf_links(html),['https://www.jada.or.jp/files/libs/7724/file.pdf'])

    def test_missing_yoy_marked_none(self):
        txt=self.make_data().replace('車名1 トヨタ 14,900 104.1','車名1 トヨタ 14,900 (26-5)')
        self.assertIsNone(parse_ranked_text(txt,'2026-09')[0]['yoy_pct'])

if __name__ == '__main__': unittest.main()