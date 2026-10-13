"""Shared profile readiness; no personal values in health or diagnostics."""
import hashlib
import hmac
import importlib.util
import json
from pathlib import Path

from engine import Catalog, ModelClient

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('jev_profile_validation', ROOT / 'skills/jev-profile/scripts/validate_profile.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


def profile_identity(path):
    return hashlib.sha256(str(Path(path).resolve()).encode()).hexdigest()


def configuration_identity(token):
    client = ModelClient()
    effective = {'jev_base': client.jev_base, 'jev_model': client.jev_model,
                 'llm_base': client.generator_base, 'llm_model': client.generator_model,
                 'protocol': client.protocol, 'json_mode': client.json_mode,
                 'jev_key': client.credential('TYPESAFE_API_KEY'), 'llm_key': client.credential('LLM_API_KEY')}
    # Keyed fingerprint detects a stale service environment without exposing settings or keys.
    return hmac.new(token.encode(), json.dumps(effective, sort_keys=True).encode(), hashlib.sha256).hexdigest()


def profile_status(path):
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
        if validator.validate(data, require_facts=True):
            return False, 'profile 缺少事实或格式无效；运行 skill 的 validate_profile.py 检查'
        if not Catalog(data).candidates:
            return False, 'profile 没有可用于填写的事实；请使用 $jev-profile 创建资料'
        return True, ''
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return False, 'profile 不存在、不可读或不是有效的个人资料；请使用 $jev-profile 创建资料'
