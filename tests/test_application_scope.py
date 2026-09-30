import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bridge'))
from engine import scoped_records
from application_scope import resolve_page, _cache

class IndustryPolicyTests(unittest.TestCase):
    def setUp(self):
        _cache.clear()
        self.profile={'experience':[{'is_internship':True}, {'is_internship':True},
            {'is_internship':True,'application_policy':{'exclude_industries':['internet']}},
            {'is_internship':True,'application_policy':{'exclude_industries':['internet']}}]}

    def test_counts_and_record_allocation_share_industry_filter(self):
        for section in ['实习经历','工作经历']:
            self.assertEqual(scoped_records(self.profile,section,{'application_industry':'internet'}),['experience_0','experience_1'])
            self.assertEqual(scoped_records(self.profile,section,{'application_industry':'fmcg'}),['experience_0','experience_1','experience_2','experience_3'])

    def test_user_confirmed_tenant_override_precedes_model(self):
        self.profile['job_preferences']={'application_industry_overrides':[{'host':'xyz.51job.com','tenant_id':'1000000','industry':'fmcg','company':'示例消费品公司'}]}
        e=SimpleNamespace(profile=self.profile, high=.85)
        p=resolve_page(e,{'host':'xyz.51job.com','tenant_id':'1000000','application_industry':'internet'})
        self.assertEqual(p['application_industry'],'fmcg')

    def test_target_industry_is_jev_judged_and_cached(self):
        calls=[]
        class Client:
            def jev(self,state,questions):
                calls.append(state)
                return {'industry':{'choice':'internet','confidence':.99}}
        e=SimpleNamespace(profile=self.profile,high=.85,client=Client())
        page={'host':'example.invalid','title':'Example Software 招聘','application_industry':'fmcg'}
        self.assertEqual(resolve_page(e,page)['application_industry'],'internet')
        self.assertEqual(resolve_page(e,page)['application_industry'],'internet')
        self.assertEqual(len(calls),1)
        self.assertNotIn('experience',str(calls))

    def test_uncertain_recruiting_platform_does_not_become_internet_company(self):
        class Client:
            def jev(self,*args):return {'industry':{'choice':'internet','confidence':.6}}
        e=SimpleNamespace(profile=self.profile,high=.85,client=Client())
        self.assertEqual(resolve_page(e,{'host':'xyz.51job.com','title':'简历展示页'})['application_industry'],'unknown')

if __name__=='__main__':unittest.main()
