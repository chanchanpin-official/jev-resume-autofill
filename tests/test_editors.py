import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bridge'))
from engine import Engine, block_reason


class EditorTests(unittest.TestCase):
    def setUp(self):
        self.engine = Engine.__new__(Engine)
        self.engine.high = .85
        self.engine.client = Mock()
        self.engine.client.jev.return_value = {'action': {'choice': 'operate', 'confidence': .95}}

    def test_resume_actions_require_jev(self):
        for kind, label in [('open', '编辑'), ('open', '添加'), ('save', '保存')]:
            self.assertEqual(self.engine.choose_editor({'kind': kind, 'label': label, 'section': '教育经历'}, {'host': 'xyz.51job.com'})['status'], 'operate')
        self.assertEqual(self.engine.client.jev.call_count, 3)

    def test_final_submission_unknown_host_and_wrong_pair_never_operate(self):
        for kind, label, host in [('save', '提交简历', 'xyz.51job.com'), ('save', '保存', 'other.invalid'), ('open', '保存', 'xyz.51job.com'), ('open', '删除', 'xyz.51job.com')]:
            self.assertEqual(self.engine.choose_editor({'kind': kind, 'label': label, 'section': '教育经历'}, {'host': host})['status'], 'review')
        self.engine.client.jev.assert_not_called()

    def test_low_confidence_or_none_preserves_draft(self):
        for answer in [{'choice': 'operate', 'confidence': .84}, {'choice': 'none', 'confidence': .99}]:
            self.engine.client.jev.return_value = {'action': answer}
            self.assertEqual(self.engine.choose_editor({'kind': 'save', 'label': '保存', 'section': '教育经历'}, {'host': 'xyz.51job.com'})['status'], 'review')

    def test_privacy_editor_never_reaches_model(self):
        for title in ['隐私声明确认', '诚信承诺', '我的意向志愿', 'Consent']:
            self.assertEqual(self.engine.choose_editor({'kind': 'open', 'label': '编辑', 'section': title}, {'host': 'xyz.51job.com'})['status'], 'review')
        self.engine.client.jev.assert_not_called()

    def test_review_retains_confidence_for_diagnostics(self):
        self.engine.client.jev.return_value = {'action': {'choice': 'operate', 'confidence': .65}}
        self.assertEqual(self.engine.choose_editor({'kind': 'open', 'label': '编辑', 'section': '教育经历'}, {'host': 'xyz.51job.com'})['confidence'], .65)

    def test_editor_ambiguous_rechecks_focused_control_without_lowering_threshold(self):
        self.engine.client.jev.side_effect = [
            {'action': {'choice': 'operate', 'confidence': .84}},
            {'action': {'choice': 'operate', 'confidence': .93}}]
        result = self.engine.choose_editor({'kind': 'open', 'label': '添加', 'section': '在校职务', 'location': 'section_header'}, {'host': 'xyz.51job.com'})
        self.assertEqual(result['status'], 'operate')
        self.assertEqual(result['confidence'], .93)
        self.assertEqual(self.engine.client.jev.call_args.args[0]['section_heading'], '在校职务')

    def test_section_recheck_uses_internship_scope(self):
        self.engine.profile = {'experience': [{'is_internship': True}, {'is_full_time': True}, {'is_internship': True, 'application_policy': {'exclude_industries': ['internet']}}]}
        self.engine.client.jev.side_effect = [
            {'collection': {'choice': 'experience', 'confidence': .84}},
            {'collection': {'choice': 'experience', 'confidence': .94}}]
        result = self.engine.choose_section({'section': '实习经历', 'label': '添加'}, {'application_industry': 'internet'})
        self.assertEqual(result['desired_count'], 1)
        self.assertEqual(result['confidence'], .94)

    def test_section_low_or_wrong_collection_never_expands(self):
        self.engine.profile = {'leadership': [{}, {}], 'experience': [{}, {}]}
        for key, confidence in [('leadership', .84), ('experience', .99), ('none', .99)]:
            self.engine.client.jev.return_value = {'collection': {'choice': key, 'confidence': confidence}}
            result = self.engine.choose_section({'section': '在校职务', 'label': '添加'}, {})
            self.assertEqual(result['status'], 'review')
            self.assertEqual(result['confidence'], confidence)

    def test_truth_attestation_inside_mixed_section_requires_user(self):
        self.assertIsNotNone(block_reason({'label': '请确认本简历中所填写的所有个人信息、教育经历、在校职务、实习经历等均为真实有效，无虚假陈述', 'section': '补充信息'}, {}))
