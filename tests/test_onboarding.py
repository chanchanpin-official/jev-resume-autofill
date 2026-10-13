import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'bridge'))
import model_config
import readiness
from engine import ModelClient


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


doctor = module('onboarding_doctor', 'scripts/doctor.py')
installer = module('onboarding_installer', 'scripts/install_skill.py')


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.config_path = self.root / 'config.json'
        self.config = {'JEV_BASE_URL': 'https://jev.example.invalid/v1', 'JEV_MODEL': 'fixture-jev',
                       'TYPESAFE_API_KEY': 'fixture-jev-key', 'LLM_PROTOCOL': 'openai-chat',
                       'LLM_BASE_URL': 'https://llm.example.invalid/v1', 'LLM_MODEL': 'fixture-model',
                       'LLM_API_KEY': 'fixture-llm-key'}
        self.config_path.write_text(json.dumps(self.config))
        for context in [patch.dict(os.environ, {}, clear=True), patch.object(model_config, 'CONFIG_PATH', self.config_path)]:
            context.start(); self.addCleanup(context.stop)

    def test_missing_invalid_and_environment_overridden_configuration(self):
        status = model_config.configuration_status()
        self.assertTrue(status['jev_configured'] and status['generator_configured'])
        with patch.dict(os.environ, {'LLM_API_KEY': '', 'LLM_MODEL': ''}):
            status = model_config.configuration_status()
            self.assertFalse(status['generator_configured'])
            self.assertIn('LLM_API_KEY', status['environment_overrides'])
        for change in [{'LLM_PROTOCOL': 'bad'}, {'LLM_MODEL': None}, {'JEV_MODEL': ''}, {'LLM_JSON_MODE': 'bad'},
                       {'LLM_BASE_URL': 'https://llm.example.invalid/v1/chat/completions'}]:
            status = model_config.configuration_status(dict(self.config, **change), {})
            self.assertTrue(status['errors'])
            self.assertNotIn('fixture-llm-key', json.dumps(status))

    def test_key_file_must_be_readable_and_nonempty(self):
        config = dict(self.config, LLM_API_KEY='', LLM_API_KEY_FILE=str(self.root / 'key'))
        self.assertFalse(model_config.configuration_status(config, {})['generator_configured'])
        (self.root / 'key').write_text('fixture-file-key')
        self.assertTrue(model_config.configuration_status(config, {})['generator_configured'])
        (self.root / 'key').write_text('  ')
        self.assertFalse(model_config.configuration_status(config, {})['generator_configured'])

    def test_profile_check_requires_real_structure_and_never_returns_values(self):
        path = self.root / 'profile.json'
        for value in [{}, [], {'education': 'PRIVATE_PROFILE_SENTINEL'}, {'person': {'id_number': 'PRIVATE_PROFILE_SENTINEL'}}]:
            path.write_text(json.dumps(value))
            ok, message = readiness.profile_status(path)
            self.assertFalse(ok)
            self.assertNotIn('PRIVATE_PROFILE_SENTINEL', message)
        path.write_text(json.dumps({'person': {'name_en': 'Synthetic Applicant'}}))
        self.assertTrue(readiness.profile_status(path)[0])

    def test_fingerprint_detects_stale_key_and_is_bound_to_pairing_token(self):
        initial = readiness.configuration_identity('pairing-one')
        self.assertNotEqual(initial, readiness.configuration_identity('pairing-two'))
        with patch.dict(os.environ, {'LLM_API_KEY': 'different-fixture-key'}):
            self.assertNotEqual(initial, readiness.configuration_identity('pairing-one'))
        self.assertNotIn('fixture', initial)

    def test_install_into_space_path_then_update_without_nesting_or_losing_custom_files(self):
        public = self.root / 'plugin'
        shutil.copytree(ROOT / 'skills', public / 'skills', ignore=shutil.ignore_patterns('__pycache__'))
        (public / 'skills/jev-profile/config.json').write_text('{"private": "Do not copy"}')
        destination = self.root / 'agent skills'
        with patch.object(installer, 'ROOT', public):
            target, changed = installer.install(destination)
            self.assertTrue(changed)
            self.assertTrue((target / 'references/onboarding.md').is_file())
            self.assertFalse((target / 'jev-profile').exists())
            self.assertFalse(installer.install(destination)[1])
            (target / 'custom.txt').write_text('Keep this custom note')
            (public / 'skills/jev-profile/SKILL.md').write_text('Updated skill')
            self.assertTrue(installer.install(destination)[1])
            self.assertEqual((target / 'custom.txt').read_text(), 'Keep this custom note')
            self.assertTrue(list((public / '.runtime/skill-backups').glob('*/jev-profile/SKILL.md')))
            self.assertFalse(any(p.name in ('.runtime', 'profile', 'config.json') for p in target.rglob('*')))

    def test_missing_skill_source_is_a_failure_not_an_already_installed_success(self):
        with patch.object(installer, 'ROOT', self.root), self.assertRaisesRegex(ValueError, '不完整'):
            installer.install(self.root / 'skills')

    def test_default_install_does_not_create_duplicate_of_legacy_skill(self):
        (self.root / '.codex/skills/jev-profile').mkdir(parents=True)
        with patch.object(Path, 'home', return_value=self.root), patch.object(sys, 'argv', ['install_skill.py']):
            with self.assertRaisesRegex(SystemExit, '第二份'):
                installer.main()
        self.assertFalse((self.root / '.agents/skills/jev-profile').exists())

    def test_install_refuses_symlink_before_changing_existing_skill(self):
        directory = self.root / 'skills'
        directory.mkdir()
        (directory / 'jev-profile').symlink_to(ROOT / 'skills/jev-profile', target_is_directory=True)
        with self.assertRaises(ValueError):
            installer.install(directory)

    def test_doctor_offline_failure_has_nonzero_exit_and_never_probes(self):
        with patch.object(doctor, 'ROOT', self.root), patch.object(doctor, 'probe_models') as probes, \
             patch.object(sys, 'argv', ['doctor.py', '--json']), patch('sys.stdout', new_callable=io.StringIO) as out:
            self.assertEqual(doctor.main(), 1)
            self.assertFalse(json.loads(out.getvalue())['ok'])
            probes.assert_not_called()

    def test_doctor_rejects_wrong_profile_stale_service_and_wrong_version(self):
        runtime = self.root / '.runtime'
        runtime.mkdir(); (runtime / 'bridge-token').write_text('pairing-one')
        (self.root / 'extension').mkdir()
        (self.root / 'extension/manifest.json').write_text(json.dumps({'version': 'fixture-version'}))
        profile = self.root / 'profile.json'
        good = dict(ok=True, profile=True, jev_configured=True, generator_configured=True,
                    version='fixture-version', profile_id=readiness.profile_identity(profile),
                    configuration_id=readiness.configuration_identity('pairing-one'))
        for changes in [{}, {'profile_id': 'different'}, {'configuration_id': 'stale'}, {'version': 'old'}, {'profile': False}]:
            health = dict(good, **changes)
            with patch.object(doctor, 'ROOT', self.root), patch('urllib.request.OpenerDirector.open', return_value=io.BytesIO(json.dumps(health).encode())):
                result = doctor.check_bridge(profile, 19000)
                self.assertEqual(result['ok'], not changes)
                self.assertNotIn('pairing-one', json.dumps(result))


class SyntheticProbeTests(unittest.TestCase):
    def test_both_services_roundtrip_for_every_protocol_without_profile_data(self):
        calls = []
        status = [200]
        answer = {'text': 'READY', 'source_ids': ['setup_fact'], 'missing_facts': []}
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_POST(self):
                payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                calls.append((self.path, payload))
                if self.path.endswith('/systemone'):
                    response = {'answers': {'setup': {'choice': 'ready', 'confidence': 1}}}
                elif self.path.endswith('/chat/completions'):
                    response = {'choices': [{'message': {'content': json.dumps(answer)}}]}
                elif self.path.endswith('/responses'):
                    response = {'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps(answer)}]}]}
                elif self.path.endswith('/messages'):
                    response = {'content': [{'type': 'text', 'text': json.dumps(answer)}]}
                else:
                    response = {'candidates': [{'content': {'parts': [{'text': json.dumps(answer)}]}}]}
                self.send_response(status[0]); self.end_headers()
                self.wfile.write(json.dumps(response if status[0] == 200 else {'error': 'PRIVATE_PROVIDER_SENTINEL'}).encode())
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            base = 'http://127.0.0.1:%d/v1' % server.server_address[1]
            env = {'JEV_BASE_URL': base, 'JEV_MODEL': 'fixture-jev', 'TYPESAFE_API_KEY': 'fixture-jev-key',
                   'LLM_BASE_URL': base, 'LLM_MODEL': 'fixture-model', 'LLM_API_KEY': 'fixture-llm-key'}
            with tempfile.TemporaryDirectory() as directory, patch.object(model_config, 'CONFIG_PATH', Path(directory) / 'missing.json'), patch.dict(os.environ, env, clear=True):
                for protocol in model_config.PROTOCOLS:
                    os.environ['LLM_PROTOCOL'] = protocol
                    self.assertTrue(all(c['ok'] for c in doctor.probe_models()))
                self.assertEqual(len(calls), 8)
                self.assertTrue(all('setup_test' in json.dumps(body) or 'setup_fact' in json.dumps(body) for _, body in calls))
                status[0] = 401
                failed = doctor.probe_models()
                self.assertFalse(any(c['ok'] for c in failed))
                self.assertEqual(len(calls), 10)  # No repeated authentication attempts.
                self.assertNotIn('PRIVATE_PROVIDER_SENTINEL', json.dumps(failed))
                self.assertNotIn('fixture-llm-key', json.dumps(failed))
        finally:
            server.shutdown(); server.server_close(); thread.join()
