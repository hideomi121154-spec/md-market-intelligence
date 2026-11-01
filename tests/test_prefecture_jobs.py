import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from normalize_prefecture_jobs import PREF,normalize
class TestPrefectureNormalizer(unittest.TestCase):
 def test_complete_month_and_sorted(self):
  rows=[dict(month=month,prefecture=p,new_job_offers=str(100+i)) for month in ('2026-08','2026-09') for i,p in enumerate(PREF)]
  out=normalize(reversed(rows),'2026-10-30')
  self.assertEqual(len(out['months']),2)
  self.assertEqual(out['months'][0]['month'],'2026-08')
  self.assertEqual(out['months'][1]['values']['愛知県'],100+PREF.index('愛知県'))
  self.assertEqual(out['source_type'],'user_import_unverified')
 def test_reject_partial(self):
  rows=[dict(month='2026-09',prefecture=p,new_job_offers='100') for p in PREF[:46]]
  with self.assertRaisesRegex(ValueError,'expected 47'):normalize(rows,'2026-10-30')
 def test_reject_duplicate(self):
  rows=[dict(month='2026-09',prefecture=p,new_job_offers='100') for p in PREF]
  with self.assertRaisesRegex(ValueError,'duplicate'):normalize(rows+[rows[0]],'2026-10-30')
 def test_reject_negative(self):
  rows=[dict(month='2026-09',prefecture=p,new_job_offers='-1') for p in PREF]
  with self.assertRaisesRegex(ValueError,'non integer'):normalize(rows,'2026-10-30')
 def test_reject_future_month(self):
  rows=[dict(month='2026-11',prefecture=p,new_job_offers='100') for p in PREF]
  with self.assertRaisesRegex(ValueError,'publication date'):normalize(rows,'2026-10-30')
if __name__=='__main__':unittest.main()
