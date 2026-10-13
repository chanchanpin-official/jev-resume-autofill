import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'bridge'))
spec = importlib.util.spec_from_file_location('configure_script', ROOT / 'scripts/configure.py')
configuration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(configuration)


class ConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name) / 'runtime/config.json'
        self.output.parent.mkdir()
        self.existing = {'JEV_BASE_URL': 'https://same.example.invalid/v1', 'TYPESAFE_API_KEY': 'fixture-jev-key',
                         'LLM_PROTOCOL': 'openai-chat', 'LLM_BASE_URL': 'https://same.example.invalid/v1',
                         'LLM_MODEL': 'fixture-model', 'LLM_API_KEY': 'fixture-llm-key'}
        self.output.write_text(json.dumps(self.existing))
        env = patch.dict(os.environ, {}, clear=True)
        env.start(); self.addCleanup(env.stop)

    def configure(self, base='https://same.example.invalid/v1', keys=('', ''), protocol='openai-chat', existing=True):
        with patch.object(configuration, 'local_config', return_value=dict(self.existing) if existing else {}), \
             patch.object(configuration, 'CONFIG_PATH', self.output), \
             patch.object(configuration, 'ask', side_effect=[base, 'fixture-jev', protocol, base, 'fixture-model', 'on']), \
             patch.object(configuration.getpass, 'getpass', side_effect=keys), \
             patch('sys.stdin.isatty', return_value=True), patch('sys.stdout', new_callable=io.StringIO) as stdout:
            configuration.main()
            self.assertNotIn('fixture-jev-key', stdout.getvalue())
            self.assertNotIn('fixture-llm-key', stdout.getvalue())
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o600)
        return json.loads(self.output.read_text())

    def test_changed_provider_requires_new_secret_and_preserves_original_file(self):
        before = self.output.read_bytes()
        with self.assertRaisesRegex(ValueError, '配置未保存'):
            self.configure('https://new.example.invalid/v1')
        self.assertEqual(self.output.read_bytes(), before)

    def test_same_provider_preserves_existing_secret_without_echo(self):
        result = self.configure()
        self.assertEqual(result['TYPESAFE_API_KEY'], 'fixture-jev-key')
        self.assertEqual(result['LLM_API_KEY'], 'fixture-llm-key')

    def test_fresh_cloud_configuration_rejects_blank_keys(self):
        before = self.output.read_bytes()
        with self.assertRaisesRegex(ValueError, 'TYPESAFE_API_KEY'):
            self.configure(existing=False)
        self.assertEqual(self.output.read_bytes(), before)

    def test_each_protocol_can_be_configured_from_scratch(self):
        for protocol in configuration.PROTOCOLS:
            with self.subTest(protocol=protocol):
                result = self.configure(keys=('fixture-jev-key', 'fixture-llm-key'), protocol=protocol, existing=False)
                self.assertEqual(result['LLM_PROTOCOL'], protocol)

    def test_invalid_previous_protocol_can_be_repaired_without_a_traceback(self):
        self.existing['LLM_PROTOCOL'] = 'invalid-protocol'
        result = self.configure(keys=('', 'replacement-fixture-key'))
        self.assertEqual(result['LLM_PROTOCOL'], 'openai-chat')

    def test_loopback_llm_can_omit_its_key_but_jev_still_requires_one(self):
        result = self.configure(base='http://127.0.0.1:19000/v1', keys=('fixture-jev-key', ''), existing=False)
        self.assertNotIn('LLM_API_KEY', result)

    def test_environment_shadowing_is_rejected_before_prompt_or_write(self):
        before = self.output.read_bytes()
        with patch.dict(os.environ, {'LLM_API_KEY': 'PRIVATE_ENV_SENTINEL'}), \
             patch('sys.stdin.isatty', return_value=True), patch.object(configuration, 'ask') as ask:
            with self.assertRaises(ValueError) as error:
                configuration.main()
            self.assertIn('LLM_API_KEY', str(error.exception))
            self.assertNotIn('PRIVATE_ENV_SENTINEL', str(error.exception))
            ask.assert_not_called()
        self.assertEqual(self.output.read_bytes(), before)

    def test_noninteractive_input_never_falls_back_to_echoing_secrets(self):
        with patch('sys.stdin.isatty', return_value=False), patch.object(configuration.getpass, 'getpass') as secret:
            with self.assertRaisesRegex(ValueError, '交互终端'):
                configuration.main()
            secret.assert_not_called()

    def test_getpass_warning_stops_before_echo_fallback(self):
        with patch.object(configuration.getpass, 'getpass', side_effect=configuration.getpass.GetPassWarning):
            with self.assertRaisesRegex(ValueError, '隐藏密钥'):
                configuration.ask_secret('Secret: ')
