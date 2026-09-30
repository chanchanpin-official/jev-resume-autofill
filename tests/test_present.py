import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bridge"))
from engine import Engine


class PresentClient:
    def __init__(self, answer="yes", confidence=.96, route_confidence=.97, retry_confidence=.96):
        self.usage, self.calls = [], []
        self.answer, self.confidence, self.route_confidence = answer, confidence, route_confidence
        self.retry_confidence = retry_confidence
        self.present_calls = 0

    def jev(self, state, questions):
        self.calls.append((state, questions))
        result = {}
        for key in questions:
            if key.startswith("group_"):
                result[key] = {"choice": "projects_0", "confidence": self.route_confidence}
            elif key.startswith("narrative_"):
                result[key] = {"noul": 0}
            elif key == "present":
                self.present_calls += 1
                result[key] = {"choice": self.answer, "confidence": self.confidence if self.present_calls == 1 else self.retry_confidence}
            elif key == "option":
                result[key] = {"choice": "none", "confidence": .2}
            else:
                raise AssertionError("Present must not enter literal field matching")
        return result

    def generate(self, *args):
        raise AssertionError("Present must never generate new content")


class PresentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "profile.json"
        self.profile = {"projects": [{"name_en": "Synthetic project", "start": "2024-09", "end": None, "date_display_zh": "2024-09 至今"}]}
        self.field = {"id": "p", "label": "起止时间 / Period / 至今 / Present", "type": "checkbox", "section": "项目经验 / Projects", "record_index": 0}

    def tearDown(self):
        self.temp.cleanup()

    def engine(self, client):
        self.path.write_text(json.dumps(self.profile))
        return Engine(self.path, client)

    def test_explicit_present_uses_jev_truth_decision_without_generator(self):
        client = PresentClient()
        out = self.engine(client).decide([self.field], {})["decisions"][0]
        self.assertEqual(out["value"], "Yes")
        self.assertEqual(out["source"], "jev:present:projects_0")
        evidence = client.calls[-1][0]["temporal_evidence"]
        self.assertTrue(any("至今" in c["value"] for c in evidence))

    def test_ended_record_can_be_unchecked(self):
        self.profile["projects"][0].update(end="2025-06", date_display_zh="2024-09 至 2025-06")
        out = self.engine(PresentClient("no")).decide([self.field], {})["decisions"][0]
        self.assertEqual(out["value"], "No")

    def test_missing_end_is_not_treated_as_present(self):
        del self.profile["projects"][0]["date_display_zh"]
        client = PresentClient("none", confidence=.99)
        out = self.engine(client).decide([self.field], {})["decisions"][0]
        self.assertEqual(out["status"], "review")
        self.assertNotIn("value", out)

    def test_low_confidence_is_review_without_generation(self):
        out = self.engine(PresentClient(confidence=.4)).decide([self.field], {})["decisions"][0]
        self.assertEqual(out["status"], "review")

    def test_medium_confidence_retries_with_record_context(self):
        client = PresentClient(confidence=.7)
        out = self.engine(client).decide([self.field], {})["decisions"][0]
        self.assertEqual(out["value"], "Yes")
        self.assertEqual(client.present_calls, 2)
        self.assertIn("related_record_evidence", client.calls[-1][0])

    def test_uncertain_record_is_not_used(self):
        client = PresentClient(route_confidence=.7)
        self.field["record_hint"] = "Unrecognized project already entered on the page"
        out = self.engine(client).decide([self.field], {})["decisions"][0]
        self.assertEqual(out["status"], "review")
        self.assertEqual(client.present_calls, 0)

    def test_option_mapping_does_not_reintroduce_generator(self):
        out = self.engine(PresentClient()).choose_options(self.field, "Yes", [{"id": "o0", "text": "Yes"}, {"id": "o1", "text": "No"}], {})
        self.assertEqual(out["status"], "review")


if __name__ == "__main__":
    unittest.main()
