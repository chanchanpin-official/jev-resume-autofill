import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bridge'))
from engine import clean_page, scoped_records
from project_scope import resolve_projects, plan_cleanup, _cache


class ProjectScopeTests(unittest.TestCase):
    def setUp(self):
        _cache.clear()
        self.profile = {'projects':[{'id':f'p{i}', 'name_zh':f'Project {i}'} for i in range(6)],
            'form_record_policy':{'project_ids':['p0','p1','p2','p3'], 'allow_high_match_extras':True}}
        self.jd = '\n'.join(['Develop and validate software product concepts using substantive user research evidence.',
            'Design and evaluate prototypes for international consumer hardware and software experiences.',
            'Collaborate with engineers to prioritize product requirements and measure usability.'])
        self.calls = []
        outer = self
        class Client:
            def jev(self, state, questions):
                outer.calls.append(state)
                return outer.answers
        self.engine = SimpleNamespace(profile=self.profile, high=.85, client=Client())
        self.answers = {'projects_4':{'choice':'add','confidence':.95},
            'projects_4_requirement':{'choice':'jd_0','confidence':.95},
            'projects_5':{'choice':'add','confidence':.89},
            'projects_5_requirement':{'choice':'jd_1','confidence':.99}}

    def test_core_is_mandatory_extras_require_two_high_confidence_decisions(self):
        page = resolve_projects(self.engine, {'job_context':self.jd,'host':'example.test'})
        self.assertEqual(scoped_records(self.profile,'项目经历',clean_page(page)), [f'projects_{i}' for i in range(5)])
        resolve_projects(self.engine, {'job_context':self.jd,'host':'example.test'})
        self.assertEqual(len(self.calls),1)

    def test_title_alone_and_spoofed_scope_never_admit_old_projects(self):
        page = clean_page({'job_context':'AI产品经理','_project_scope':['p5']})
        result = resolve_projects(self.engine, page)
        self.assertEqual(scoped_records(self.profile,'项目经历',result),[f'projects_{i}' for i in range(4)])
        self.assertEqual(self.calls,[])

    def test_unknown_jd_requirement_is_rejected(self):
        self.answers['projects_4_requirement']['choice']='invented'
        page=resolve_projects(self.engine,{'job_context':self.jd})
        self.assertEqual(len(scoped_records(self.profile,'项目经历',page)),4)
        self.assertEqual(len(scoped_records(self.profile,'项目经历',page,include_archived=True)),6)

    def test_cleanup_requires_exact_page_authorization_and_all_core_identities(self):
        page=resolve_projects(self.engine,{'host':'example.test','path':'/apply'})
        control={'project_records':[{'hint':f'Project {i}'} for i in range(6)]}
        self.answers={f'row_{i}':{'choice':f'p{i}','confidence':.96} for i in range(6)}
        self.assertEqual(plan_cleanup(self.engine,control,page),{})
        self.profile['form_record_policy']['cleanup_authorizations']=[{'host':'example.test','path':'/apply'}]
        self.assertEqual(plan_cleanup(self.engine,control,page)['remove_project_indices'],[4,5])
        self.assertEqual(plan_cleanup(self.engine,control,dict(page,path='/other')), {})
        self.answers['row_0']['confidence']=.89
        self.assertNotIn('remove_project_indices',plan_cleanup(self.engine,control,page))

    def test_cleanup_uses_configured_core_size_instead_of_a_fixed_count(self):
        for count in (1, 2, 5):
            with self.subTest(count=count):
                self.profile['form_record_policy'].update(project_ids=[f'p{i}' for i in range(count)],
                    allow_high_match_extras=False, cleanup_authorizations=[{'host':'example.test','path':'/apply'}])
                page=resolve_projects(self.engine,{'host':'example.test','path':'/apply'})
                control={'project_records':[{'hint':f'Project {i}'} for i in range(count+1)]}
                self.answers={f'row_{i}':{'choice':f'p{i}','confidence':.96} for i in range(count+1)}
                self.assertEqual(plan_cleanup(self.engine,control,page)['remove_project_indices'],[count])

    def test_cleanup_preserves_unknown_rows_and_high_match_extras(self):
        page=resolve_projects(self.engine,{'host':'example.test','path':'/apply','job_context':self.jd})
        self.profile['form_record_policy']['cleanup_authorizations']=[{'host':'example.test','path':'/apply'}]
        control={'project_records':[{'hint':f'Project {i}'} for i in range(6)]}
        self.answers={f'row_{i}':{'choice':f'p{i}','confidence':.96} for i in range(6)}
        result=plan_cleanup(self.engine,control,page)
        self.assertEqual(result['remove_project_indices'],[5])
        self.answers['row_5']['choice']='none'
        self.assertEqual(plan_cleanup(self.engine,control,page)['remove_project_indices'],[])


if __name__ == '__main__':
    unittest.main()
