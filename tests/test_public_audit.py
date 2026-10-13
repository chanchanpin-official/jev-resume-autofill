import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('public_audit', ROOT / 'scripts/audit_public.py')
public_audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(public_audit)


class PublicAuditTests(unittest.TestCase):
    def audit_text(self, content, deny_terms=()):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            file = root / 'example.txt'
            file.write_text(content)
            with patch.object(public_audit, 'ROOT', root):
                return public_audit.audit([file], deny_terms)

    def test_number_shaped_private_values_fail_without_echoing_the_value(self):
        for value, category in [('139' + '0' * 8, 'mobile number shape'),
                                ('1' + '0' * 17, 'identity number shape'),
                                ('1' + '0' * 16 + 'X', 'identity number shape')]:
            with self.subTest(category=category):
                errors = self.audit_text('Contact: ' + value)
                self.assertEqual(errors, ['example.txt: ' + category])
                self.assertNotIn(value, '\n'.join(errors))

    def test_invalid_numeric_fixtures_and_reserved_email_remain_publishable(self):
        self.assertEqual(self.audit_text('0' * 18 + ' applicant@example.invalid'), [])

    def test_personal_deny_list_rejects_values_without_echoing_them(self):
        value = 'Fictional Private Candidate'
        self.assertEqual(self.audit_text(value, [value]), ['example.txt: private deny-list match'])
