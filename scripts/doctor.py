"""Read-only setup checks, with explicit opt-in synthetic provider probes."""
import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'bridge'))
from engine import ModelClient, ModelServiceError, choice
from model_config import configuration_status, setting
from readiness import profile_identity, profile_status, configuration_identity


def probe_models(client=None):
    """Use fixed synthetic evidence only; never accept or load a user's profile here."""
    client = client or ModelClient()
    checks = []
    try:
        answer = client.jev({'setup_test': 'The verification word is READY.'}, {
            'setup': choice('Select the verification word explicitly present in setup_test.', {'ready': 'READY'})})
        if not isinstance(answer, dict) or answer.get('setup', {}).get('choice') != 'ready':
            raise ValueError()
        checks.append({'name': 'Jev 实际调用', 'ok': True, 'detail': '固定虚构事实匹配通过'})
    except (ModelServiceError, ValueError, TypeError, AttributeError, RuntimeError) as exc:
        detail = str(exc) if isinstance(exc, ModelServiceError) else '响应未通过固定答案校验，请核对 Jev 接口和 model'
        checks.append({'name': 'Jev 实际调用', 'ok': False, 'detail': detail})
    try:
        answer = client.generate({'label': 'Repeat the verification word READY exactly; cite setup_fact.'}, {},
                                 [{'id': 'setup_fact', 'value': 'READY'}], False)
        if answer.get('text') != 'READY' or answer.get('source_ids') != ['setup_fact'] or answer.get('missing_facts') != []:
            raise ValueError()
        checks.append({'name': 'LLM 实际调用', 'ok': True, 'detail': '生成协议、JSON 和来源引用通过'})
    except (ModelServiceError, ValueError, TypeError, AttributeError, RuntimeError) as exc:
        detail = str(exc) if isinstance(exc, ModelServiceError) else '响应未通过固定 JSON / 来源校验，请核对协议、model 和 JSON mode'
        checks.append({'name': 'LLM 实际调用', 'ok': False, 'detail': detail})
    return checks


def check_bridge(profile, port):
    result = {'name': '本机服务与配对', 'ok': False, 'detail': ''}
    try:
        token = (ROOT / '.runtime/bridge-token').read_text().strip()
        request = urllib.request.Request('http://127.0.0.1:%d/health' % port,
                                         headers={'Authorization': 'Bearer ' + token})
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        with urllib.request.build_opener(NoRedirect).open(request, timeout=3) as response:
            health = json.load(response)
        expected_version = json.loads((ROOT / 'extension/manifest.json').read_text(encoding='utf-8'))['version']
        if health.get('version') != expected_version:
            result['detail'] = 'bridge 版本与当前扩展不同；结束旧服务后从此插件目录启动'
        elif health.get('profile_id') != profile_identity(profile):
            result['detail'] = '服务读取的 profile 与本次检查不同；核对 --profile / JEV_PROFILE_PATH 并重启'
        elif health.get('configuration_id') != configuration_identity(token):
            result['detail'] = '服务生效的 API 配置与当前终端不同；检查环境变量并从正确环境重启服务'
        elif not all(health.get(key) is True for key in ('ok', 'profile', 'jev_configured', 'generator_configured')):
            result['detail'] = '服务进程的资料或 API 配置尚未就绪；检查其启动环境并重启'
        else:
            result.update(ok=True, detail='已认证，版本、profile 路径与配置完整性一致；仍需在扩展设置页检查连接')
    except urllib.error.HTTPError as exc:
        result['detail'] = '本机服务 HTTP %d；核对端口和本目录配对配置，不要混用其他插件目录' % exc.code
    except (OSError, ValueError, TypeError, AttributeError):
        result['detail'] = '无法连接或尚未生成配对配置；先启动本目录 bridge 并保持终端打开'
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', type=Path)
    parser.add_argument('--bridge', action='store_true', help='Also verify the running local service')
    parser.add_argument('--port', type=int, default=17321)
    parser.add_argument('--probe-models', action='store_true', help='Send fixed synthetic data to configured APIs; may incur small charges')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('port 必须为 1–65535')
    config = configuration_status()
    checks = [{'name': 'Python', 'ok': sys.version_info >= (3, 9), 'detail': '需要 Python 3.9+'},
              {'name': 'Jev 配置', 'ok': config['jev_configured'], 'detail': '本地配置完整性，不等于 API 认证通过'},
              {'name': 'LLM 配置', 'ok': config['generator_configured'], 'detail': '本地配置完整性，不等于 API 认证通过'}]
    try:
        profile = (args.profile or Path(setting('JEV_PROFILE_PATH', str(ROOT / 'profile/profile.json')))).expanduser().resolve()
        ready, reason = profile_status(profile)
        checks.append({'name': '个人 profile', 'ok': ready, 'detail': reason or '非空且格式有效；事实与来源仍需本人核对'})
    except (OSError, ValueError, TypeError):
        profile = None
        checks.append({'name': '个人 profile', 'ok': False, 'detail': 'profile 路径或本机配置无效'})
    if args.bridge:
        checks.append(check_bridge(profile, args.port) if profile else {'name': '本机服务与配对', 'ok': False, 'detail': '先修正 profile 路径'})
    if args.probe_models:
        if config['jev_configured'] and config['generator_configured']:
            checks.extend(probe_models())
        else:
            checks.append({'name': 'API 实际调用', 'ok': False, 'detail': '先修正 API 配置；未发送请求'})
    result = {'ok': all(c['ok'] for c in checks), 'checks': checks,
              'configuration_errors': config['errors'], 'environment_overrides': config['environment_overrides'],
              'models_probed': args.probe_models and config['jev_configured'] and config['generator_configured']}
    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        for check in checks:
            print(('[通过] ' if check['ok'] else '[待处理] ') + check['name'] + '：' + check['detail'])
        for error in config['errors']:
            print('[待处理] ' + error)
        if config['environment_overrides']:
            print('当前环境覆盖文件配置：' + ', '.join(config['environment_overrides']))
        if not args.probe_models:
            print('尚未进行 API 实际调用；使用 --probe-models 发送固定虚构内容验证（可能产生少量费用）。')
        print('最后在 Chrome / Edge 加载或重载 extension，并在设置页检查连接；本工具不会替代浏览器验收。')
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
