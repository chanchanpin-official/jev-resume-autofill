import json
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bridge"))
from engine import Engine, Catalog, ModelClient, redact, clean_field, block_reason, scoped_records, format_for_field

PROFILE = {
    "person": {"email": "demo@example.invalid", "name_en": "Demo Applicant", "id_number_ref": "local only"},
    "atomic_fields": [{"id": "email", "en": "Applicant email address", "value": "demo@example.invalid"}],
    "education": [{"id": "edu_one", "school_en": "Example University", "start": "2020-09", "end_exact": "2024-06-23"}],
    "narratives": {"one_liner_en": "I conduct user interviews and analyze feedback."},
    "unknown_fields": [{"id": "expected_salary", "aliases_zh": ["期望薪资"]}],
    "resume_files": {"latest_cn_pdf": "demo.pdf"},
}


class FakeClient:
    def __init__(self, confidence=1, retry_confidence=1, narrative=False, proposal=None, support=1):
        self.calls, self.usage = [], []
        self.confidence, self.retry_confidence = confidence, retry_confidence
        self.narrative, self.proposal, self.support = narrative, proposal, support
        self.generated = 0

    def jev(self, state, questions):
        self.calls.append((state, questions))
        result = {}
        for key, q in questions.items():
            if key.startswith("group_"):
                result[key] = {"choice": "narratives" if self.narrative else "atomic", "confidence": 1}
            elif key.startswith("narrative_"):
                result[key] = {"noul": 1 if self.narrative else 0}
            elif key.startswith("field_"):
                result[key] = {"choice": "narratives_one_liner_en" if self.narrative else "atomic_email", "confidence": self.confidence}
            elif key == "match":
                result[key] = {"choice": "atomic_email", "confidence": self.retry_confidence}
            elif key == "supported":
                result[key] = {"noul": self.support}
            elif key.startswith("support_"):
                result[key] = {"choice": "supported", "confidence": self.support}
            elif key == "accept":
                result[key] = {"choice": "proposed", "confidence": 1}
            elif key == "file":
                result[key] = {"choice": "latest_cn_pdf", "confidence": 1}
            else:
                result[key] = {"choice": "o0", "confidence": 1}
        return result

    def generate(self, *args):
        self.generated += 1
        return self.proposal or {"text": "demo@example.invalid", "source_ids": ["atomic_email"], "missing_facts": []}


class EngineTests(unittest.TestCase):
    def test_all_attachment_types_are_manual_without_model_calls(self):
        for label in ('照片', '作品集', '附件简历', '成绩单', '证书', '其他文件', '身份证扫描件', '隐私声明附件'):
            for required, status in ((True, 'review'), (False, 'skip'), (None, 'review')):
                client = FakeClient()
                out = Engine(self.path, client).decide([{'id': 'file', 'label': label,
                    'type': 'file', 'required': required}], {})['decisions'][0]
                self.assertEqual(out['status'], status)
                self.assertEqual(out['issue_kind'], 'manual_attachment')
                self.assertEqual(client.calls, [])
                self.assertEqual(client.generated, 0)

    def test_project_role_keeps_explicit_source_when_responsibilities_are_identical(self):
        self.path.write_text(json.dumps({'projects':[{'name_zh':'示例项目',
            'responsibilities_zh':'用户研究','role_zh':'用户研究'}]}))
        seen=[]
        class Client(FakeClient):
            def jev(self,state,questions):
                result=super().jev(state,questions)
                if 'field_0' in questions:
                    seen.append(questions['field_0']['criteria'])
                    result['field_0']={'choice':'projects_0__role_zh','confidence':.95}
                return result
        result=Engine(self.path,Client()).decide([{'id':'role','label':'项目角色','type':'text',
            'section':'项目经历','record_index':0,'record_group':'projects_0'}],{})['decisions'][0]
        self.assertEqual(result['status'],'fill')
        self.assertEqual(result['source'],'projects[0].role_zh')
        self.assertIn('Project role',seen[0]['projects_0__role_zh'])
        self.assertNotIn('Student leadership role',seen[0]['projects_0__role_zh'])
        self.assertNotIn('projects_0__responsibilities_zh',seen[0])

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "profile.json"
        self.path.write_text(json.dumps(PROFILE))

    def tearDown(self):
        self.temp.cleanup()

    def decide(self, client, **field):
        return Engine(self.path, client).decide([dict(id="a", label="Email", type="text", **field)], {})["decisions"][0]

    def test_high_confidence_fills_existing_only(self):
        client = FakeClient()
        out = self.decide(client)
        self.assertEqual(out["value"], "demo@example.invalid")
        self.assertEqual(client.generated, 0)

    def test_medium_retries_before_generator(self):
        client = FakeClient(.7)
        self.assertEqual(self.decide(client)["status"], "fill")
        self.assertEqual(client.generated, 0)
        self.assertIn("match", client.calls[2][1])

    def test_low_factual_match_hands_off_without_generation(self):
        client = FakeClient(.2)
        out = self.decide(client)
        self.assertEqual(client.generated, 0)
        self.assertEqual(out["status"], "review")
        self.assertEqual(out["issue_kind"], "fact_unresolved")

    def test_optional_missing_link_skips_but_required_or_unknown_stays_visible(self):
        for required,status in [(False,'skip'),(True,'review'),(None,'review')]:
            client=FakeClient(.1)
            out=Engine(self.path,client).decide([{'id':'url','label':'项目链接','type':'text','required':required}],{})['decisions'][0]
            self.assertEqual(out['status'],status)
            self.assertEqual(out['issue_kind'],'missing_link')
            self.assertEqual(client.generated,0)

    def test_medium_failed_retry_hands_off_without_generation(self):
        client = FakeClient(.7, retry_confidence=.6)
        self.assertEqual(self.decide(client)["status"], "review")
        self.assertEqual(client.generated, 0)

    def test_factual_invention_rejected(self):
        client = FakeClient(.1, proposal={"text": "invented@example.invalid", "source_ids": ["atomic_email"], "missing_facts": []})
        self.assertEqual(self.decide(client)["status"], "review")

    def test_company_name_is_not_delegated_to_generator(self):
        client = FakeClient()
        result = Engine(self.path, client).fallback({"id": "company", "label": "Company", "type": "custom"}, {}, "atomic", False)
        self.assertEqual(result["status"], "review")
        self.assertEqual(client.generated, 0)

    def test_company_dictionary_recheck_requires_canonical_evidence_and_confidence(self):
        profile = dict(PROFILE, experience=[{"company_zh": "示例科技", "company_group_zh": "示例集团"}])
        self.path.write_text(json.dumps(profile))
        class CompanyClient(FakeClient):
            def jev(self, state, questions):
                self.calls.append((state, questions))
                if "employer_evidence" in state:
                    return {key: {"choice": "accept", "confidence": self.confidence} for key in questions}
                return {"option": {"choice": "none", "confidence": .4}}
            def generate(self, *args):
                return {"text": "", "source_ids": [], "missing_facts": ["unknown"]}
        for confidence, forged, expected in [(1, False, "select"), (.84, False, "review"), (1, True, "review")]:
            engine = Engine(self.path, CompanyClient(confidence=confidence))
            context = engine.catalog.evidence("experience_0")
            if forged:
                for item in context: item["value"] = "伪造公司"
            result = engine.choose_options({"label": "公司名称", "type": "custom"}, "示例科技", [{"id": "o0", "text": "示例集团股份有限公司EXAMPLE"}], {}, {"verified_record": context})
            self.assertEqual(result["status"], expected)

    def test_fake_source_rejected(self):
        client = FakeClient(.1, proposal={"text": "demo@example.invalid", "source_ids": ["made_up"], "missing_facts": []})
        self.assertEqual(self.decide(client)["status"], "review")

    def test_grounded_narrative_is_reviewable(self):
        client = FakeClient(.2, narrative=True, proposal={"text": "My research includes interviews and feedback analysis.", "source_ids": ["narratives_one_liner_en"], "missing_facts": []})
        out = self.decide(client)
        self.assertTrue(out["generated"])
        self.assertTrue(out["review"])

    def test_unsupported_narrative_rejected(self):
        client = FakeClient(.2, narrative=True, proposal={"text": "I led ten teams.", "source_ids": ["narratives_one_liner_en"], "missing_facts": []}, support=.2)
        self.assertEqual(self.decide(client)["status"], "review")

    def test_length_limit_rejects_unfit_generated_answer(self):
        self.assertEqual(self.decide(FakeClient(), max_length=4)["status"], "review")

    def test_private_id_never_reaches_models(self):
        private = {"fields": {"id_number": {"value": "110101199001010011"}}}
        self.path.with_name("profile.private.json").write_text(json.dumps(private))
        client = FakeClient()
        output = Engine(self.path, client).decide([{"id": "a", "label": "身份证号"}], {})
        self.assertTrue(output["decisions"][0]["local_only"])
        self.assertEqual(client.calls, [])

    def test_blocked_fields_never_reach_models(self):
        client = FakeClient()
        fields = [{"id": str(i), "label": value} for i, value in enumerate(["密码", "验证码", "同意隐私政策", "期望薪资", "护照号码"])]
        output = Engine(self.path, client).decide(fields, {})
        self.assertTrue(all(x["status"] == "skip" for x in output["decisions"]))
        self.assertEqual(client.calls, [])

    def test_local_id_not_used_for_other_people(self):
        self.assertIsNotNone(block_reason({"label": "身份证号", "section": "紧急联系人"}, PROFILE))
        self.assertIsNotNone(block_reason({"label": "父亲身份证号"}, PROFILE))

    def test_input_cleaning_discards_existing_values_and_html(self):
        result = clean_field({"id": "a", "label": "Email", "value": "SECRET", "html": "SECRET"})
        self.assertNotIn("SECRET", json.dumps(result))

    def test_followup_question_context_is_bounded_and_redacted(self):
        result = clean_field({"label": "If so, describe it", "preceding_labels": ["Old"] + ["x" * 600, "AI experience?", "110101199001010011"], "value": "PRIVATE ANSWER"})
        self.assertEqual(len(result["preceding_labels"]), 3)
        self.assertEqual(len(result["preceding_labels"][0]), 400)
        self.assertNotIn("110101199001010011", json.dumps(result))
        self.assertNotIn("PRIVATE ANSWER", json.dumps(result))
        self.assertNotIn("preceding_labels", clean_field({"preceding_labels": {"html": "SECRET"}}))

    def test_ranked_policy_requires_unique_supported_option_before_fallback(self):
        profile = json.loads(self.path.read_text())
        profile['atomic_fields'].append({'id': 'channel', 'en': 'User-authorized ordered source policy', 'value': ['Campus event', 'Official website']})
        self.path.write_text(json.dumps(profile))
        class Ranked(FakeClient):
            def __init__(self, ambiguous=False):
                super().__init__(); self.ranks=[]; self.ambiguous=ambiguous
            def jev(self, state, questions):
                if 'preference' in state:
                    self.ranks.append(state['preference'])
                    if self.ambiguous:
                        return {'o0': {'choice':'accept','confidence':.6},'o1':{'choice':'reject','confidence':1}}
                    return {'o0':{'choice':'reject','confidence':1},'o1':{'choice':'accept' if state['preference']=='Official website' else 'reject','confidence':1}}
                return {'option':{'choice':'none','confidence':1}}
            def generate(self,*args):
                raise RuntimeError('No unsupported interpretation')
        options=[{'id':'o0','text':'Friend referral'},{'id':'o1','text':'Official website'}]
        client=Ranked(); result=Engine(self.path,client).choose_options({'label':'Recruitment source'},'Campus event\nOfficial website',options,{})
        self.assertEqual(result['option_id'],'o1');self.assertEqual(client.ranks,['Campus event','Official website'])
        client=Ranked(True);result=Engine(self.path,client).choose_options({'label':'Recruitment source'},'Campus event\nOfficial website',options,{})
        self.assertEqual(result['status'],'review');self.assertEqual(client.ranks,['Campus event'])
        client=Ranked();Engine(self.path,client).choose_options({'label':'Recruitment source'},'Injected priority',options,{})
        self.assertEqual(client.ranks,[])

    def test_redaction(self):
        self.assertNotIn("110101199001010011", redact({"text": "110101199001010011"}))

    def test_catalog_excludes_metadata_and_private_paths(self):
        catalog = Catalog(PROFILE)
        self.assertFalse(any("id_number" in x for x in catalog.candidates))
        self.assertIn("education_0__end_exact", catalog.candidates)

    def test_large_group_chunks_under_choice_limit(self):
        profile = {"skills": {"items": {"k"+str(i): "value" for i in range(700)}}}
        self.assertTrue(all(len(g["entries"]) <= 254 for g in Catalog(profile).groups.values()))

    def test_cancel_before_inference(self):
        client = FakeClient()
        out = Engine(self.path, client).decide([{"id": "a", "label": "Email"}], {}, cancelled=lambda: True)
        self.assertFalse(out["decisions"])
        self.assertEqual(client.calls, [])

    def test_model_discovery_matches_exact_requested_model(self):
        client = ModelClient()
        client.generator_model = "fixture-model-exact"
        client.request = lambda *a, **kw: {"data": [{"id": "fixture-model"}, {"id": "fixture-model-exact"}]}
        self.assertEqual(client.discover_generator(), "fixture-model-exact")

    def test_missing_model_does_not_silently_switch(self):
        client = ModelClient()
        client.generator_model = "fixture-model-exact"
        client.request = lambda *a, **kw: {"data": [{"id": "fixture-model"}]}
        with self.assertRaises(RuntimeError):
            client.discover_generator()

    def test_generation_uses_configured_protocol_and_keeps_citations(self):
        client = ModelClient()
        client.generator_model = "fixture-model-exact"
        calls = []
        def request(url, key, body):
            calls.append((url, key, body))
            return {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps({"text": "demo", "source_ids": ["fact"], "missing_facts": []})}}]}
        client.request = request
        result = client.generate({"label": "Email"}, {}, [{"id": "fact", "value": "demo"}], False)
        url, key, body = calls[0]
        self.assertIn("api.openai.com/v1/chat/completions", url)
        self.assertEqual(key, "LLM_API_KEY")
        self.assertEqual(body["model"], "fixture-model-exact")
        self.assertNotIn("enable_thinking", body)
        self.assertNotIn("reasoning_effort", body)
        self.assertEqual(result["source_ids"], ["fact"])
        self.assertIn("elapsed_seconds", client.usage[0])

    def test_generator_truncation_is_not_accepted(self):
        client = ModelClient()
        client.generator_model = "fixture-model-exact"
        client.request = lambda *a: {"choices": [{"finish_reason": "length", "message": {"content": "{}"}}]}
        with self.assertRaisesRegex(RuntimeError, "截断"):
            client.generate({}, {}, [], False)

    def test_key_file_and_environment_precedence(self):
        p = Path(self.temp.name) / "key"
        p.write_text("test-file-key\n")
        with patch.dict("os.environ", {"LLM_API_KEY": "", "LLM_API_KEY_FILE": str(p)}):
            self.assertEqual(ModelClient.credential("LLM_API_KEY"), "test-file-key")
        with patch.dict("os.environ", {"LLM_API_KEY": "env-key", "LLM_API_KEY_FILE": str(p)}):
            self.assertEqual(ModelClient.credential("LLM_API_KEY"), "env-key")

    def test_moka_autocomplete_new_password_is_not_a_password(self):
        self.assertIsNone(block_reason({"label": "姓名 / Name", "autocomplete": "new_password", "type": "text"}, PROFILE))

    def test_separate_fulltime_section_not_filled_with_internships(self):
        profile = {"experience": [{"title_zh": "用户研究实习生"}, {"title_zh": "产品经理"}]}
        self.assertEqual(scoped_records(profile, "实习经历", {}), ["experience_0"])
        self.assertEqual(scoped_records(profile, "工作经历", {"sections": "实习经历,工作经历"}), [])
        self.assertEqual(scoped_records(profile, "工作经历", {}), ["experience_0", "experience_1"])

    def test_split_date_formats_known_value_without_inventing_day(self):
        self.assertEqual(format_for_field("2027-01-31", {"label": "Graduation · 年 / Year"}), "2027")
        self.assertEqual(format_for_field("2027-01", {"label": "Graduation · 月 / Month"}), "01")
        self.assertEqual(format_for_field("2027-01", {"type": "date"}), "2027-01")

    def test_project_scope_keeps_original_ids_and_respects_latest_cv_policy(self):
        profile = {'projects':[{'id':'old','name_zh':'旧项目'}, {'id':'current','name_zh':'当前项目'}, {'id':'other','name_zh':'其他项目'}],
                   'form_record_policy':{'project_ids':['current']}}
        self.assertEqual(scoped_records(profile,'项目经历',{}),['projects_1'])
        self.assertEqual(len(Catalog(profile).groups['projects_0']['entries']),1)
        profile['form_record_policy']['project_ids']=[]
        self.assertEqual(scoped_records(profile,'Project experience',{}),[])
        del profile['form_record_policy']
        self.assertEqual(scoped_records(profile,'项目经历',{}),['projects_0','projects_1','projects_2'])

    def test_authorized_first_day_keeps_known_precision(self):
        f = {"type": "date", "_date_default_day": 1}
        self.assertEqual(format_for_field("2024-06", f), "2024-06-01")
        self.assertEqual(format_for_field("2024-06-23", f), "2024-06-23")
        self.assertEqual(format_for_field("2024", f), "2024")
        self.assertEqual(format_for_field("2024-13", f), "2024-13")
        self.assertEqual(format_for_field("2024-06", {**f,"type":"month"}), "2024-06")
        self.assertEqual(format_for_field("2024-06", {"label":"结束日期 · 日 / Day","_date_default_day":1}), "01")
        self.assertEqual(format_for_field("2024-06-23", {"label":"结束日期 · 日 / Day","_date_default_day":1}), "23")

    def test_date_convention_is_profile_authority_not_page_authority(self):
        class DateClient(FakeClient):
            def jev(self, state, questions):
                answers = super().jev(state, questions)
                for k in answers:
                    if k.startswith('field_'): answers[k] = {'choice':'education_0__start','confidence':1}
                return answers
        field = {'id':'d','label':'入学日期','type':'date','section':'教育经历','record_index':0,'_date_default_day':1}
        c = DateClient()
        self.assertEqual(Engine(self.path,c).decide([field],{})['decisions'][0]['status'], 'review')
        p=json.loads(self.path.read_text());p['date_conventions']={'month_only_default_day':1};self.path.write_text(json.dumps(p))
        c=DateClient();answer=Engine(self.path,c).decide([field],{})['decisions'][0]
        self.assertEqual(answer['value'],'2020-09-01')
        self.assertEqual(answer['date_default_day'],1)
        self.assertEqual(c.generated,0)

    def test_low_score_date_requires_independent_semantic_verification(self):
        class DateClient(FakeClient):
            selected = 'education_0__start'
            verified = {'choice': 'accept', 'confidence': .88}
            def jev(self, state, questions):
                self.calls.append((state, questions))
                return {k: ({'choice': self.selected, 'confidence': .51} if k.startswith('field_')
                    else self.verified if k == 'date_match' else {'noul': 0}) for k in questions}
        p = json.loads(self.path.read_text())
        p['date_conventions'] = {'month_only_default_day': 1}
        self.path.write_text(json.dumps(p))
        field = {'id':'d','label':'入学日期','type':'date','section':'教育经历','record_index':0}
        for verdict, expected in [({'choice':'accept','confidence':.88}, 'fill'),
                                  ({'choice':'accept','confidence':.84}, 'review'),
                                  ({'choice':'reject','confidence':.99}, 'review')]:
            c = DateClient(); c.verified = verdict
            out = Engine(self.path,c).decide([field],{})['decisions'][0]
            self.assertEqual(out['status'], expected)
            self.assertEqual(c.generated, 0)
            if expected == 'fill': self.assertEqual(out['value'],'2020-09-01')
        # Neither a foreign record nor an unauthorized missing day gets checked.
        c = DateClient(); c.selected = 'atomic_email'
        self.assertEqual(Engine(self.path,c).decide([field],{})['decisions'][0]['status'], 'review')
        self.assertFalse(any('date_match' in q for _,q in c.calls))
        del p['date_conventions']; self.path.write_text(json.dumps(p))
        c = DateClient()
        self.assertEqual(Engine(self.path,c).decide([field],{})['decisions'][0]['status'], 'review')
        self.assertFalse(any('date_match' in q for _,q in c.calls))


if __name__ == "__main__":
    unittest.main()
