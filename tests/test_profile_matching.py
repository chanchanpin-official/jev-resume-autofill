import json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'bridge'))
from engine import Engine,Catalog,scoped_records
from test_engine import FakeClient,PROFILE

class RecordMatchingTests(unittest.TestCase):
 def test_competitions_exclude_scholarships_but_general_awards_retain_them(self):
  p={'honors':{'dated_items':[{'zh':'National Scholarship'},{'name_zh':'Contest','type_zh':'竞赛获奖'},{'zh':'Graduate Honor'}]}}
  for section in ['竞赛获奖（含商赛）','Competition awards','比赛经历']:
   self.assertEqual(scoped_records(p,section,{}),['award_1'])
  self.assertEqual(scoped_records(p,'获奖经历',{}),['award_0','award_1','award_2'])
 def test_same_school_different_roles_are_visible_to_record_allocator(self):
  c=Catalog({'leadership':[{'school_zh':'University','org_zh':'Student Council','role_zh':'President'},
      {'school_zh':'University','org_zh':'Culture Department','role_zh':'Head','role_aliases_zh':['文体部部长']} ]})
  self.assertIn('Student Council',c.groups['leadership_0']['description'])
  self.assertIn('President',c.groups['leadership_0']['description'])
  self.assertIn('文体部部长',c.groups['leadership_1']['description'])
 def test_medium_candidate_requires_high_confidence_semantic_acceptance(self):
  for selection,confidence,expected in [('accept',.98,0),('accept',.84,1),('reject',.99,1),('none',.99,1)]:
   class Client(FakeClient):
    def jev(self,state,questions):
     if 'proposed' in state and 'related_evidence' in state:
      return {'match':{'choice':selection,'confidence':confidence}}
     return super().jev(state,questions)
   with tempfile.TemporaryDirectory() as d:
    p=Path(d)/'profile.json';p.write_text(json.dumps(PROFILE));c=Client(.7,.7)
    result=Engine(p,c).decide([{'id':'a','label':'Email','type':'text'}],{})['decisions'][0]
    self.assertEqual(c.generated,0)
    self.assertEqual(result["status"],"review" if expected else "fill")
    if not expected:self.assertEqual(result['confidence'],.98)

if __name__=='__main__':unittest.main()
