import io
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bridge'))
from engine import ModelClient, ModelServiceError
from model_config import safe_base

ANSWER = {'text': 'Verified answer', 'source_ids': ['fact'], 'missing_facts': []}


class ProviderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.calls = []
        cls.response = {}
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_POST(self):
                cls.calls.append((self.path, dict(self.headers), json.loads(self.rfile.read(int(self.headers['Content-Length'])))))
                body = json.dumps(cls.response).encode()
                self.send_response(200)
                self.end_headers()
                self.wfile.write(body)
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = 'http://127.0.0.1:%d/v1' % cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.calls.clear()
        self.env = patch.dict(os.environ, {'LLM_BASE_URL': self.base, 'LLM_API_KEY': 'fixture-key', 'LLM_MODEL': 'fixture-model'}, clear=True)
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def generate(self, protocol, response):
        os.environ['LLM_PROTOCOL'] = protocol
        type(self).response = response
        return ModelClient().generate({'label': 'Introduction'}, {}, [{'id': 'fact', 'value': 'Verified answer'}], True)

    def test_all_protocols_roundtrip_normalize_grounded_answer(self):
        text = json.dumps(ANSWER)
        cases = [
            ('openai-chat', {'choices': [{'message': {'content': text}, 'finish_reason': 'stop'}]}, '/v1/chat/completions', 'Authorization', 'Bearer fixture-key'),
            ('openai-responses', {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': text}]}]}, '/v1/responses', 'Authorization', 'Bearer fixture-key'),
            ('anthropic', {'content': [{'type': 'text', 'text': text}], 'stop_reason': 'end_turn'}, '/v1/messages', 'X-Api-Key', 'fixture-key'),
            ('gemini', {'candidates': [{'content': {'parts': [{'text': 'reasoning should be omitted', 'thought': True}, {'text': text}]}, 'finishReason': 'STOP'}]}, '/v1/models/fixture-model:generateContent', 'X-Goog-Api-Key', 'fixture-key'),
        ]
        for protocol, response, path, header, expected in cases:
            with self.subTest(protocol=protocol):
                self.assertEqual(self.generate(protocol, response), ANSWER)
                actual, headers, body = self.calls[-1]
                self.assertEqual(actual, path)
                self.assertEqual(headers[header], expected)
                self.assertNotIn('fixture-key', actual)
                self.assertNotIn('enable_thinking', body)
                if protocol == 'anthropic':
                    self.assertEqual(headers['Anthropic-Version'], '2023-06-01')
                if protocol == 'openai-responses':
                    self.assertFalse(body['store'])
                self.assertIn('fact', json.dumps(body))

    def test_json_mode_can_be_disabled_for_compatible_provider(self):
        os.environ['LLM_JSON_MODE'] = 'off'
        self.generate('openai-chat', {'choices': [{'message': {'content': json.dumps(ANSWER)}}]})
        self.assertNotIn('response_format', self.calls[-1][2])
        self.generate('gemini', {'candidates': [{'content': {'parts': [{'text': json.dumps(ANSWER)}]}}]})
        self.assertNotIn('responseMimeType', self.calls[-1][2]['generationConfig'])

    def test_truncated_or_non_json_answers_are_rejected(self):
        for protocol, response in [
            ('openai-responses', {'status': 'incomplete', 'output': []}),
            ('anthropic', {'content': [], 'stop_reason': 'max_tokens'}),
            ('gemini', {'candidates': [{'finishReason': 'MAX_TOKENS'}]}),
            ('openai-chat', {'choices': [{'message': {'content': 'not JSON'}}]}),
        ]:
            with self.subTest(protocol=protocol), self.assertRaises(RuntimeError):
                self.generate(protocol, response)

    def test_local_provider_can_omit_key_but_remote_cannot(self):
        os.environ['LLM_API_KEY'] = ''
        self.assertEqual(self.generate('openai-chat', {'choices': [{'message': {'content': json.dumps(ANSWER)}}]}), ANSWER)
        self.assertNotIn('Authorization', self.calls[-1][1])
        with self.assertRaises(ModelServiceError):
            ModelClient().request('https://example.invalid/v1', 'LLM_API_KEY')

    def test_jev_base_and_model_are_configurable(self):
        os.environ.update(TYPESAFE_API_KEY='fixture-jev-key', JEV_BASE_URL=self.base, JEV_MODEL='fixture-jev')
        type(self).response = {'answers': {'match': {'choice': 'fact', 'confidence': .99}}}
        self.assertIn('match', ModelClient().jev({'facts': []}, {}))
        self.assertEqual(self.calls[-1][0], '/v1/systemone')
        self.assertEqual(self.calls[-1][2]['model'], 'fixture-jev')

    def test_api_urls_reject_embedded_keys_or_remote_plaintext(self):
        for url in ('https://user:pass@example.invalid/v1', 'http://example.invalid/v1', 'https://example.invalid/v1?key=secret', 'file:///private/file'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                safe_base(url)

    def test_malformed_provider_response_is_sanitized(self):
        with patch('engine.urllib.request.OpenerDirector.open', return_value=io.BytesIO(b'fixture-key INVALID')):
            with self.assertRaises(ModelServiceError) as caught:
                ModelClient().request(self.base, 'LLM_API_KEY')
            self.assertNotIn('fixture-key', str(caught.exception))

    def test_redirect_does_not_forward_api_key(self):
        class Redirect(BaseHTTPRequestHandler):
            requests = 0
            def log_message(self, *args):
                pass
            def do_GET(self):
                type(self).requests += 1
                self.send_response(302)
                self.send_header('Location', '/destination')
                self.end_headers()
        server = ThreadingHTTPServer(('127.0.0.1', 0), Redirect)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with self.assertRaisesRegex(ModelServiceError, '302'):
                ModelClient().request('http://127.0.0.1:%d/source' % server.server_address[1], 'LLM_API_KEY')
            self.assertEqual(Redirect.requests, 1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_config_and_key_file_environment_precedence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / 'config.json'
            config.write_text(json.dumps({'LLM_MODEL': 'file-model', 'LLM_API_KEY': 'file-secret'}))
            with patch('model_config.CONFIG_PATH', config):
                self.assertEqual(ModelClient().generator_model, 'fixture-model')
                del os.environ['LLM_MODEL']
                self.assertEqual(ModelClient().generator_model, 'file-model')
                self.assertEqual(ModelClient.credential('LLM_API_KEY'), 'fixture-key')
                del os.environ['LLM_API_KEY']
                self.assertEqual(ModelClient.credential('LLM_API_KEY'), 'file-secret')
