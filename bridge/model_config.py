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
    parsed = urlsplit(url)
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("API base URL 不得包含凭据、查询参数或片段")
    if not parsed.hostname or (parsed.scheme != "https" and not (
            parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost", "::1"))):
        raise ValueError("API base URL 必须使用 HTTPS；本机模型可使用 loopback HTTP")
    return url
