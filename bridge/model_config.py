"""Local provider settings. Environment values take precedence over private config."""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / ".runtime" / "config.json"
PROTOCOLS = ("openai-chat", "openai-responses", "anthropic", "gemini")
DEFAULT_BASES = {
    "openai-chat": "https://api.openai.com/v1",
    "openai-responses": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta",
}
CONFIG_KEYS = ('TYPESAFE_API_KEY', 'TYPESAFE_API_KEY_FILE', 'JEV_BASE_URL', 'JEV_MODEL',
               'LLM_PROTOCOL', 'LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY', 'LLM_API_KEY_FILE', 'LLM_JSON_MODE')


def local_config():
    if not CONFIG_PATH.is_file():
        return {}
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise ValueError("本机 config.json 无法读取或不是有效 JSON") from None
    if not isinstance(data, dict):
        raise ValueError("本机 config.json 必须是 JSON 对象")
    return data


def setting(name, default=""):
    return os.environ[name] if name in os.environ else local_config().get(name, default)


def credential(name):
    value = setting(name)
    if value:
        return str(value).strip()
    filename = setting(name + "_FILE")
    if filename:
        try:
            return Path(filename).expanduser().read_text(encoding="utf-8").strip()
        except OSError:
            raise ValueError(name + "_FILE 密钥文件不可读") from None
    return ""


def safe_base(url):
    url = str(url).rstrip("/")
    try:
        parsed = urlsplit(url)
        parsed.port  # Validate malformed / out-of-range ports without echoing the input.
    except ValueError:
        raise ValueError('API base URL 格式或端口无效') from None
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("API base URL 不得包含凭据、查询参数或片段")
    if not parsed.hostname or (parsed.scheme != "https" and not (
            parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost", "::1"))):
        raise ValueError("API base URL 必须使用 HTTPS；本机模型可使用 loopback HTTP")
    if parsed.path.endswith(('/chat/completions', '/responses', '/messages', '/systemone', '/models', ':generateContent')):
        raise ValueError("请填写 API base URL，不要填写具体操作接口或 /models 路径")
    return url


def configuration_status(config=None, environment=None):
    """Inspect effective configuration without contacting providers or returning secrets."""
    environment = os.environ if environment is None else environment
    overrides = sorted(key for key in CONFIG_KEYS if key in environment)
    result = {'jev_configured': False, 'generator_configured': False,
              'environment_overrides': overrides, 'errors': []}
    try:
        config = local_config() if config is None else config
    except ValueError as exc:
        result['errors'].append(str(exc))
        return result
    value = lambda key, default='': environment.get(key, config.get(key, default))

    def key_present(name):
        direct = value(name)
        if direct:
            return isinstance(direct, str) and bool(direct.strip())
        filename = value(name + '_FILE')
        if filename:
            try:
                return bool(Path(filename).expanduser().read_text(encoding='utf-8').strip())
            except (OSError, ValueError, TypeError, UnicodeError):
                result['errors'].append(name + '_FILE 密钥文件不可读或无效')
        return False

    for provider in ('JEV', 'LLM'):
        errors = len(result['errors'])
        protocol = value('LLM_PROTOCOL', 'openai-chat') if provider == 'LLM' else None
        if provider == 'LLM' and protocol not in PROTOCOLS:
            result['errors'].append('LLM_PROTOCOL 无效')
            protocol = 'openai-chat'
        base_default = DEFAULT_BASES[protocol] if provider == 'LLM' else 'https://api.typesafe.ai/v1'
        local = False
        try:
            base = safe_base(value(provider + '_BASE_URL', base_default))
            local = urlsplit(base).hostname in ('127.0.0.1', 'localhost', '::1')
        except ValueError:
            result['errors'].append(provider + '_BASE_URL 无效；须填写无凭据的 API 基础地址')
        model = value(provider + '_MODEL', 'jev-latest' if provider == 'JEV' else '')
        if not isinstance(model, str) or not model.strip():
            result['errors'].append(provider + '_MODEL 不能为空')
        key = 'TYPESAFE_API_KEY' if provider == 'JEV' else 'LLM_API_KEY'
        if not key_present(key) and not (provider == 'LLM' and local):
            result['errors'].append('缺少 ' + key + ' 或可读的 _FILE 密钥文件')
        if provider == 'LLM' and value('LLM_JSON_MODE', 'on') not in ('on', 'off'):
            result['errors'].append('LLM_JSON_MODE 必须为 on 或 off')
        result['jev_configured' if provider == 'JEV' else 'generator_configured'] = len(result['errors']) == errors
    return result
