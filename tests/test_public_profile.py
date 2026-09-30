import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'bridge'))
import server
from engine import Catalog


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


inventory = module('skill_inventory', 'skills/jev-profile/scripts/inventory.py').inventory
validate = module('skill_validation', 'skills/jev-profile/scripts/validate_profile.py').validate
public_files = module('public_package', 'scripts/package.py').public_files


class PublicProfileTests(unittest.TestCase):
    def test_default_template_is_empty_and_empty_profile_does_not_call_model(self):
        self.assertEqual(json.loads((ROOT / 'profile/profile.example.json').read_text()), {})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'profile.json'
            path.write_text('{}')
            server.JOBS['empty-fixture'] = {'cancelled': False}
            with patch.object(server, 'PROFILE', path), patch('engine.ModelClient.jev') as call:
                server.run_job('empty-fixture', {'mode': 'fields', 'fields': [{'label': 'Name'}]})
                call.assert_not_called()
            self.assertEqual(server.JOBS['empty-fixture']['status'], 'error')
            self.assertIn('skill', server.JOBS['empty-fixture']['error'])
            del server.JOBS['empty-fixture']

    def test_inventory_covers_nested_documents_and_excludes_private_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'nested').mkdir()
            (root / 'nested/resume.md').write_text('Synthetic applicant')
            (root / 'experience.txt').write_text('Verified responsibility')
            (root / '.runtime').mkdir()
            (root / '.runtime/config.json').write_text('secret')
            (root / 'profile').mkdir()
            (root / 'profile/profile.json').write_text('{}')
            (root / 'external.md').symlink_to(root / 'nested/resume.md')
            result = inventory(root, root / 'profile/source-inventory.json')
            self.assertEqual([row['path'] for row in result['documents']], ['experience.txt', 'nested/resume.md'])
            self.assertTrue(all(len(row['sha256']) == 64 for row in result['documents']))
            self.assertNotIn('Synthetic applicant', json.dumps(result))

    def test_generated_shape_creates_candidates_without_source_metadata(self):
        profile = {'person': {'name_en': 'Synthetic Applicant'}, 'education': [{'id': 'edu-one', 'school_en': 'Example University', 'start': '2020-09', 'end': '2024-06'}],
                   'source_metadata': {'person.name_en': {'file': 'resume.md'}}}
        self.assertEqual(validate(profile, require_facts=True), [])
        candidates = Catalog(profile).candidates
        self.assertIn('person_name_en', candidates)
        self.assertIn('education_0__school_en', candidates)
        self.assertNotIn('resume.md', json.dumps(candidates))

    def test_bad_shapes_duplicate_ids_and_private_values_are_rejected(self):
        for profile in ([], {'education': 'bad'}, {'projects': [{'id': 'same'}, {'id': 'same'}]}, {'atomic_fields': [{}]}, {'person': {'id_number': 'local-only'}}, {'projects': [{'is_present': True, 'end': '2024-06'}]}):
            with self.subTest(profile=profile):
                self.assertTrue(validate(profile))
        self.assertTrue(validate({}, require_facts=True))
        self.assertTrue(validate({'honors': {'dated_items': []}}, require_facts=True))
        self.assertTrue(validate({'education': [{'start': '2024-02-31'}]}))

    def test_archive_white_list_never_includes_private_runtime_or_profile(self):
        files = [path.relative_to(ROOT).as_posix() for path in public_files()]
        self.assertIn('profile/profile.example.json', files)
        self.assertIn('skills/jev-profile/SKILL.md', files)
        self.assertNotIn('profile/profile.json', files)
        self.assertNotIn('extension/local-config.js', files)
        self.assertFalse(any(name.startswith(('.runtime/', 'dist/', 'test-results/', 'node_modules/')) for name in files))
