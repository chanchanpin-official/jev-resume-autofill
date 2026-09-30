"""Interactive local-only configuration; secrets never echo or enter extension storage."""
import getpass
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "bridge"))
from model_config import CONFIG_PATH, DEFAULT_BASES, PROTOCOLS, local_config, safe_base


def ask(label, previous=""):
    return input(label + (" [" + str(previous) + "]" if previous else "") + ": ").strip() or previous


def main():
    config = local_config()
    print("配置 Jev 与生成模型。密钥只写入本机 .runtime/config.json；回车保留原值。")
    old_jev_base = config.get("JEV_BASE_URL", "https://api.typesafe.ai/v1")
    old_llm_base = config.get("LLM_BASE_URL", DEFAULT_BASES[config.get("LLM_PROTOCOL", "openai-chat")])
    config["JEV_BASE_URL"] = safe_base(ask("Jev base URL", config.get("JEV_BASE_URL", "https://api.typesafe.ai/v1")))
    config["JEV_MODEL"] = ask("Jev model", config.get("JEV_MODEL", "jev-latest"))
    key = getpass.getpass("Jev API key（输入不显示）: ").strip()
    if key:
        config["TYPESAFE_API_KEY"] = key
    elif config["JEV_BASE_URL"] != old_jev_base:
        config.pop("TYPESAFE_API_KEY", None)
        config.pop("TYPESAFE_API_KEY_FILE", None)
    print("生成协议: " + ", ".join(PROTOCOLS))
    protocol = ask("LLM_PROTOCOL", config.get("LLM_PROTOCOL", "openai-chat"))
    if protocol not in PROTOCOLS:
        raise ValueError("请选择列出的生成协议")
    same = config.get("LLM_PROTOCOL", "openai-chat") == protocol
    config["LLM_PROTOCOL"] = protocol
    config["LLM_BASE_URL"] = safe_base(ask("LLM base URL（含版本路径）", config.get("LLM_BASE_URL", DEFAULT_BASES[protocol]) if same else DEFAULT_BASES[protocol]))
    config["LLM_MODEL"] = ask("LLM model（供应商提供的完整 ID）", config.get("LLM_MODEL", ""))
    if not config["LLM_MODEL"]:
        raise ValueError("LLM model 不能为空")
    key = getpass.getpass("LLM API key（输入不显示；本机无鉴权模型可留空）: ").strip()
    if key:
        config["LLM_API_KEY"] = key
    elif not same or config["LLM_BASE_URL"] != old_llm_base:
        config.pop("LLM_API_KEY", None)
        config.pop("LLM_API_KEY_FILE", None)
    config["LLM_JSON_MODE"] = ask("JSON mode: on/off（兼容接口不支持时选 off）", config.get("LLM_JSON_MODE", "on"))
    if config["LLM_JSON_MODE"] not in ("on", "off"):
        raise ValueError("JSON mode 必须是 on 或 off")
    CONFIG_PATH.parent.mkdir(exist_ok=True, mode=0o700)
    temporary = CONFIG_PATH.with_suffix(".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.chmod(temporary, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(config, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    temporary.replace(CONFIG_PATH)
    print("已保存本机配置。启动或重启 bridge，然后加载 extension 目录。")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, EOFError, KeyboardInterrupt) as exc:
        raise SystemExit(str(exc) or "配置已取消")
