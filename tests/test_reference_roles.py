import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'bridge'))
from engine import Engine, evidence_role_allowed

class ReferenceRoleTests(unittest.TestCase):
    def test_applicant_and_implicit_supervisor_are_not_reference_people(self):
        field={'label':'证明人姓名'}
        for path in ['person.name_zh','atomic_fields.person_name_zh','education[0].supervisor_zh','experience[0].title_zh']:
            self.assertFalse(evidence_role_allowed({'source':path},field))
        self.assertTrue(evidence_role_allowed({'source':'experience[0].reference.name'},field))
        self.assertTrue(evidence_role_allowed({'source':'person.name_zh'},{'label':'姓名'}))

    def test_fallback_does_not_generate_a_reference_from_applicant_identity(self):
        class Catalog:
            groups={}
            def evidence(self,*args,**kwargs):
                return [{'id':'applicant','source':'person.name_zh','value':'Example Applicant'}]
        class Client:
            def generate(self,*args):
                raise AssertionError('Must not ask generator to invent a referee')
        engine=object.__new__(Engine);engine.catalog=Catalog();engine.client=Client()
        result=engine.fallback({'id':'f1','label':'证明人姓名'},{},None,False)
        self.assertEqual(result['status'],'review')
        self.assertIn('证明人',result['reason'])

if __name__=='__main__':unittest.main()
