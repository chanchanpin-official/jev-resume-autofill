import io
import json
import sys
import socket
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bridge'))
from engine import ModelClient, ModelServiceError, Engine
from test_engine import FakeClient, PROFILE

class TransportTests(unittest.TestCase):
    def request(self, effects):
        with patch.object(ModelClient, 'credential', return_value='fixture-secret'), patch('engine.urllib.request.OpenerDirector.open', side_effect=effects) as call, patch('engine.time.sleep'):
            try:
                return ModelClient().request('https://provider.invalid/v1', 'LLM_API_KEY'), call.call_count
            except ModelServiceError as e:
                return e, call.call_count

    def test_dns_retries_then_recovers(self):
        result, count = self.request([urllib.error.URLError(socket.gaierror(8, 'DNS')), io.BytesIO(b'{"ok":true}')])
        self.assertEqual(count, 2)
        self.assertTrue(result['ok'])

    def test_dns_outage_is_one_sanitized_service_failure(self):
        result, count = self.request([urllib.error.URLError('fixture-secret in unsafe provider message')]*3)
        self.assertEqual(count, 3)
        self.assertIsInstance(result, ModelServiceError)
        self.assertNotIn('fixture-secret', str(result))
        self.assertIn('DNS', str(result))

    def test_timeouts_are_retryable(self):
        result, count = self.request([TimeoutError('timed out')]*3)
        self.assertEqual(count, 3)
        self.assertIn('超时', str(result))

    def test_auth_failure_is_not_retried(self):
        error = urllib.error.HTTPError('https://provider.invalid', 401, 'unsafe', {}, None)
        result, count = self.request([error])
        self.assertEqual(count, 1)
        self.assertIsInstance(result, ModelServiceError)
        self.assertIn('401', str(result))

    def test_rate_limit_recovers(self):
        error = urllib.error.HTTPError('https://provider.invalid', 429, 'unsafe', {}, None)
        result, count = self.request([error, io.BytesIO(b'{"ok":true}')])
        self.assertEqual(count, 2)
        self.assertTrue(result['ok'])

    def test_partial_decisions_survive_without_cascading_reviews(self):
        class Client(FakeClient):
            def jev(self, state, questions):
                answers = super().jev(state, questions)
                if 'field_1' in answers:
                    for key in answers:
                        if key.startswith('field_') and key != 'field_0': answers[key]['confidence'] = .1
                return answers
            def generate(self, *args):
                self.generated += 1
                raise ModelServiceError('outage')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'profile.json';path.write_text(json.dumps(PROFILE))
            client = Client(narrative=True)
            result = Engine(path, client).decide([{'id':str(i),'label':'Introduction','type':'textarea'} for i in range(80)], {})
            self.assertTrue(result['paused'])
            self.assertEqual(len(result['decisions']), 1)
            self.assertEqual(result['decisions'][0]['status'], 'fill')
            self.assertEqual(client.generated, 1)

    def test_option_no_match_does_not_call_generator(self):
        client = FakeClient()
        client.jev = lambda *args: {'option': {'choice':'none','confidence':.1}}
        client.generate = lambda *args: (_ for _ in ()).throw(AssertionError('control must not generate'))
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'profile.json';path.write_text(json.dumps(PROFILE))
            result=Engine(path,client).choose_options({'label':'Degree'},'Master',[{'id':'o0','text':'Master'}],{})
            self.assertEqual(result['status'],'review')

if __name__ == '__main__': unittest.main()
