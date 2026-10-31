import importlib.util
import pathlib
import unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("collector", ROOT / "scripts" / "update_fault_research.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
class TestFaultFeed(unittest.TestCase):
    def test_parse_and_separate_codes(self):
        xml = """<rss><channel>
          <item><title>日産 ノート E12 エアコン 故障 の修理</title>
          <link>https://news.google.com/rss/articles/1</link>
          <pubDate>Mon, 26 Oct 2026 00:00:00 GMT</pubDate></item>
          <item><title>日産 ノート HE12 エアコン 故障</title>
          <link>https://news.google.com/rss/articles/2</link></item>
          <item><title>日産 ノート E12 好評</title>
          <link>https://news.google.com/rss/articles/3</link></item>
        </channel></rss>"""
        items=mod.parse_feed(xml.encode("utf-8"), "ノート", "E12")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["category"], "エアコン・温度調整")
        self.assertEqual(items[0]["published_at"], "2026-10-26")
    def test_merge_preserves_reports(self):
        data={"vehicles":[{"make":"日産","model":"ノート","code":"E12","report_groups":[{"count":47}],
                           "web_mentions":[]}]}
        news=[{"category":"CVT","title":"Test","url":"https://news.google.com/1","kind":"news_rss","published_at":"2026-10-26"}]
        self.assertEqual(mod.update(data,{("日産","ノート","E12"):news}),1)
        self.assertEqual(data["vehicles"][0]["report_groups"][0]["count"],47)
        self.assertEqual(mod.update(data,{("日産","ノート","E12"):news}),0)
if __name__=="__main__":
    unittest.main()
