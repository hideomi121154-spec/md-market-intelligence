import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'scripts'))
from fetch_uss_monthly import parse_html

TEMPLATE = '''<!DOCTYPE html><html><head><title>USS</title></head><body><h2>2027年3月期</h2><table>
<tr><th>2027年3月期</th><th>開催回数</th><th>出品台数（台）</th><th>成約台数（台）</th><th>成約率（%）</th><th>成約車両単価（千円）</th></tr>
<tr><th> </th><th>当期</th><th>前期</th><th>実績</th><th>前年実績</th><th>前年比</th><th>実績</th><th>前年実績</th><th>前年比</th><th>実績</th><th>前年実績</th><th>実績</th><th>前年実績</th><th>前年比</th></tr>
<tr><td>4月</td><td>79</td><td>80</td><td>348,991</td><td>327,914</td><td>106.4%</td><td>224,073</td><td>200,476</td><td>111.8%</td><td>64.2%</td><td>61.1%</td><td>1,221</td><td>1,065</td><td>114.6%</td></tr>
<tr><td>5月</td><td>*60</td><td>64</td><td>281,669</td><td>290,251</td><td>97.0%</td><td>185,404</td><td>187,194</td><td>99.0%</td><td>65.8%</td><td>64.5%</td><td>1,310</td><td>1,184</td><td>110.6%</td></tr>
<tr><td>6月</td><td>*70</td><td>72</td><td>319,720</td><td>289,533</td><td>110.4%</td><td>209,525</td><td>183,429</td><td>114.2%</td><td>65.5%</td><td>63.4%</td><td>1,315</td><td>1,230</td><td>106.9%</td></tr>
<tr><td>7月</td><td>*78</td><td>81</td><td>352,947</td><td>306,955</td><td>115.0%</td><td>225,196</td><td>203,188</td><td>110.8%</td><td>63.8%</td><td>66.2%</td><td>1,345</td><td>1,244</td><td>108.1%</td></tr>
<tr><td>8月</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
</table></body></html>'''

class TestParser(unittest.TestCase):
    def test_extract(self):
        data = parse_html(TEMPLATE)
        self.assertEqual(len(data['months']),4)
        self.assertEqual(data['months'][-1]['month'],'2026-07')
        self.assertEqual(data['months'][-1]['offered'],352947)
        self.assertEqual(data['months'][-1]['avg_sold_price_thousand_jpy'],1345)
        self.assertEqual(data['months'][-1]['sale_rate_pct'],63.8)
    def test_reject_without_metrics(self):
        with self.assertRaises(ValueError):parse_html('<html><p>2027年3月期</p><table><tr><td>4月</td></tr></table></html>')
    def test_reject_inconsistent_rate(self):
        with self.assertRaises(ValueError):parse_html(TEMPLATE.replace('64.2%','99.9%'))
    def test_reject_broken_month(self):
        with self.assertRaises(ValueError):parse_html(TEMPLATE.replace('1,345','abc'))

if __name__=='__main__':unittest.main()