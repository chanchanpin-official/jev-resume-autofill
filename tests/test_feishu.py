import json, tempfile, unittest, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bridge'))
from engine import Catalog, Engine, clean_field, format_for_field
from test_engine import FakeClient, PROFILE

class FeishuTests(unittest.TestCase):
    def test_failed_claim_gets_one_grounded_revision_and_recheck(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'profile.json';p.write_text(json.dumps(PROFILE))
            class Client(FakeClient):
                def generate(self,field,*args):
                    self.generated+=1
                    if self.generated==1:
                        return {'text':'I managed ten teams.','source_ids':['narratives_one_liner_en'],'missing_facts':[]}
                    assert field['revision_feedback']['unverified_claims']==['I managed ten teams']
                    self.support=1
                    return {'text':'I conduct user interviews and analyze feedback.','source_ids':['narratives_one_liner_en'],'missing_facts':[]}
            client=Client(.1,narrative=True,support=.2)
            result=Engine(p,client).decide([{'id':'self','label':'自我评价','type':'textarea'}],{})['decisions'][0]
            self.assertEqual(result['status'],'fill');self.assertEqual(client.generated,2)
    def test_unique_exact_source_path_citation_is_resolved(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'profile.json';p.write_text(json.dumps(PROFILE))
            client=FakeClient(.1,narrative=True,proposal={'text':'I conduct user interviews and analyze feedback.','source_ids':['narratives.one_liner_en'],'missing_facts':[]})
            answer=Engine(p,client).decide([{'id':'self','label':'Personal introduction','type':'textarea'}],{})['decisions'][0]
            self.assertEqual(answer['status'],'fill')
            self.assertEqual(answer['_learning']['source_ids'],['narratives_one_liner_en'])
            client.proposal['source_ids']=['atomic_fields.invented']
            self.assertEqual(Engine(p,client).decide([{'id':'self','label':'Personal introduction','type':'textarea'}],{})['decisions'][0]['status'],'review')
    def test_no_work_uses_explicit_predicate_without_generation(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'profile.json';p.write_text(json.dumps({'employment_summary':{'has_ever_been_full_time_employee':False}}))
            class Client(FakeClient):
                def jev(self,state,questions):
                    return {'absence':{'choice':'yes','confidence':.97}}
            client=Client();answer=Engine(p,client).decide([{'id':'x','label':'没有工作经历','type':'checkbox','section':'工作经历'}],{'sections':['工作经历','实习经历']})['decisions'][0]
            self.assertEqual(answer['value'],'Yes');self.assertEqual(client.generated,0)
    def test_date_endpoint_and_format_validation(self):
        f={'format':'YYYY-MM','date_endpoint':'end'}
        self.assertEqual(clean_field(f)['date_endpoint'],'end')
        self.assertEqual(format_for_field('2027-01-31',f),'2027-01')
        self.assertTrue(Engine.fits('2027-01',f))
        self.assertFalse(Engine.fits('2024.9 - 2027.1（预计）',f))
        self.assertFalse(Engine.fits('2027-13',f))
        self.assertTrue(Engine.fits('Present',f))
        self.assertFalse(Engine.fits('Present',dict(f,date_endpoint='start')))
    def test_uncertain_date_and_url_do_not_invoke_generator(self):
        for field in [{'label':'起止时间 · 开始 / Start','format':'YYYY-MM'}, {'label':'项目链接'}]:
            with self.subTest(field=field),tempfile.TemporaryDirectory() as d:
                path=Path(d)/'profile.json';path.write_text(json.dumps(PROFILE));client=FakeClient(.1)
                result=Engine(path,client).decide([dict(id='x',**field)],{})['decisions'][0]
                self.assertEqual(result['status'],'review');self.assertEqual(client.generated,0)
    def test_explicit_employment_and_present_are_retrievable(self):
        c=Catalog({'employment_summary':{'statement_zh':'全部经历为实习，无全职经历。'},'projects':[{'name_zh':'Ongoing','is_present':True},{'name_zh':'Unknown end'}]})
        self.assertIn('employment_summary_statement_zh',c.candidates)
        self.assertEqual(c.candidates['projects_0_present_date']['value'],'Present')
        self.assertNotIn('projects_1_present_date',c.candidates)

if __name__=='__main__':unittest.main()
