import copy
import json
import tempfile
import unittest
from pathlib import Path

from test_engine import Engine, Catalog, FakeClient, PROFILE


class NarrativeTests(unittest.TestCase):
    def test_complete_sources_are_offered_in_full_without_metadata_values(self):
        profile = copy.deepcopy(PROFILE)
        text = '我的经历。' * 60 + '最后一段：跨团队协作。'
        profile['narratives']['self_introduction_versions'] = {'long_zh': text}
        profile['narratives']['source_metadata'] = {
            'self_introduction_versions.long_zh': {
                'description_en': 'Complete professional introduction',
                'source_file': 'old-submission.pdf',
                'corrections': ['Historical typo corrected.'],
            }
        }
        cid = 'narratives_self_introduction_versions_long_zh'

        class Client(FakeClient):
            def jev(self, state, questions):
                result = super().jev(state, questions)
                if 'field_0' in questions:
                    criteria = questions['field_0']['criteria']
                    assert '最后一段：跨团队协作。' in criteria[cid]
                    assert 'Complete professional introduction' in criteria[cid]
                    result['field_0'] = {'choice': cid, 'confidence': .97}
                return result

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'profile.json'
            path.write_text(json.dumps(profile))
            for label in ('个人介绍', '自我介绍', '个人简介', '自我描述', '自我评价', 'Professional summary'):
                with self.subTest(label=label):
                    client = Client(narrative=True)
                    result = Engine(path, client).decide([{'id': 'intro', 'label': label, 'type': 'textarea', 'max_length': 1000}], {})['decisions'][0]
                    self.assertEqual(result['value'], text)
                    self.assertEqual(client.generated, 0)
                    self.assertTrue(result['review'])
        self.assertFalse(any('source_metadata' in c['source'] for c in Catalog(profile).candidates.values()))

    def test_short_limit_offers_short_candidate_instead_of_generating(self):
        profile = copy.deepcopy(PROFILE)
        profile['narratives']['self_introduction_versions'] = {'long_zh': '研究与设计。' * 200}

        class Client(FakeClient):
            def jev(self, state, questions):
                result = super().jev(state, questions)
                if 'field_0' in questions:
                    assert 'narratives_self_introduction_versions_long_zh' not in questions['field_0']['criteria']
                    assert 'narratives_one_liner_en' in questions['field_0']['criteria']
                return result

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'profile.json'
            path.write_text(json.dumps(profile))
            client = Client(narrative=True)
            result = Engine(path, client).decide([{'id': 'intro', 'label': 'Self-introduction', 'max_length': 100}], {})['decisions'][0]
            self.assertEqual(result['value'], PROFILE['narratives']['one_liner_en'])
            self.assertEqual(client.generated, 0)


if __name__ == '__main__':
    unittest.main()
