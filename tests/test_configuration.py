import importlib.util
import io
import json
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
    def configure(self, old_base, new_base):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'runtime/config.json'
            existing = {'JEV_BASE_URL': old_base, 'TYPESAFE_API_KEY': 'fixture-jev-key', 'LLM_PROTOCOL': 'openai-chat',
                        'LLM_BASE_URL': old_base, 'LLM_MODEL': 'fixture-model', 'LLM_API_KEY': 'fixture-llm-key'}
            with patch.object(configuration, 'local_config', return_value=existing), patch.object(configuration, 'CONFIG_PATH', output), \
                 patch.object(configuration, 'ask', side_effect=[new_base, 'fixture-jev', 'openai-chat', new_base, 'fixture-model', 'on']), \
                 patch.object(configuration.getpass, 'getpass', return_value=''), patch('sys.stdout', new_callable=io.StringIO) as stdout:
                configuration.main()
                self.assertNotIn('fixture-jev-key', stdout.getvalue())
                self.assertNotIn('fixture-llm-key', stdout.getvalue())
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            return json.loads(output.read_text())

    def test_changed_provider_does_not_reuse_previous_secret(self):
        result = self.configure('https://old.example.invalid/v1', 'https://new.example.invalid/v1')
        self.assertNotIn('TYPESAFE_API_KEY', result)
        self.assertNotIn('LLM_API_KEY', result)

    def test_same_provider_preserves_existing_secret_without_echo(self):
        result = self.configure('https://same.example.invalid/v1', 'https://same.example.invalid/v1')
        self.assertEqual(result['TYPESAFE_API_KEY'], 'fixture-jev-key')
        self.assertEqual(result['LLM_API_KEY'], 'fixture-llm-key')
