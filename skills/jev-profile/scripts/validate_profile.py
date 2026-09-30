"""Validate a local profile's shape and sensitive-value exclusions, without printing values."""
import argparse
import json
import re
from datetime import date
from pathlib import Path

OBJECTS = ('person', 'honors', 'skills', 'narratives', 'research_focus', 'publications', 'gaming_profile', 'job_preferences', 'source_metadata', 'form_record_policy', 'date_conventions', 'employment_summary')
RECORDS = ('education', 'experience', 'projects', 'leadership', 'atomic_fields', 'unknown_fields')
FACTS = ('person', 'education', 'experience', 'projects', 'leadership', 'honors', 'skills', 'narratives', 'research_focus', 'publications', 'gaming_profile', 'atomic_fields', 'employment_summary', 'job_preferences')
FORBIDDEN = re.compile(r'password|api[_-]?key|id[_-]?number|passport[_-]?number|bank[_-]?account', re.I)


def validate(profile, require_facts=False):
    errors = []
    if not isinstance(profile, dict):
        return ['根节点必须是 JSON 对象']
    for key in OBJECTS:
        if key in profile and not isinstance(profile[key], dict):
            errors.append(key + ' 必须是对象')
    for key in RECORDS:
        records = profile.get(key, [])
        if not isinstance(records, list) or any(not isinstance(row, dict) for row in records):
            errors.append(key + ' 必须是对象数组')
            continue
        ids = [row.get('id') for row in records if row.get('id')]
        if len(ids) != len(set(map(str, ids))):
            errors.append(key + ' 存在重复 ID')
        for index, row in enumerate(records):
            label = key + '[' + str(index) + ']'
            if key in ('atomic_fields', 'unknown_fields') and not isinstance(row.get('id'), str):
                errors.append(label + ' 缺少字符串 ID')
            if key == 'atomic_fields' and not isinstance(row.get('value'), (str, int, float, list)):
                errors.append(label + ' 缺少可匹配 value')
            for date_key in ('start', 'end', 'start_exact', 'end_exact', 'date'):
                value = row.get(date_key)
                if value is not None and not (isinstance(value, str) and re.fullmatch(r'\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?', value)):
                    errors.append(label + '.' + date_key + ' 日期格式无效')
            for date_key in ('start', 'end', 'start_exact', 'end_exact', 'date'):
                value = row.get(date_key)
                if isinstance(value, str) and len(value) == 10:
                    try:
                        date.fromisoformat(value)
                    except ValueError:
                        errors.append(label + '.' + date_key + ' 日期不存在')
            if row.get('is_present') is True and row.get('end'):
                errors.append(label + ' 同时标注至今和结束日期')
    def walk(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if FORBIDDEN.search(key):
                    errors.append('检测到禁止进入 profile 的敏感字段')
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)
        elif isinstance(value, str) and re.search(r'(?<!\d)\d{17}[\dXx](?!\d)|(?:sk-|ghp_|gho_)[A-Za-z0-9_-]{20,}', value):
            errors.append('检测到证件号码或密钥形态的值')
    walk(profile)
    def has_value(value):
        if isinstance(value, dict):
            return any(has_value(v) for k, v in value.items() if k not in ('id', 'source_metadata', 'source_refs'))
        if isinstance(value, list):
            return any(has_value(v) for v in value)
        return isinstance(value, (str, int, float)) and bool(str(value).strip())
    if require_facts and not any(has_value(profile.get(key)) for key in FACTS):
        errors.append('profile 中没有履历事实')
    return sorted(set(errors))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('profile', type=Path)
    parser.add_argument('--require-facts', action='store_true')
    args = parser.parse_args()
    try:
        data = json.loads(args.profile.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        raise SystemExit('profile 不可读取或不是有效 JSON') from None
    errors = validate(data, args.require_facts)
    if errors:
        raise SystemExit('\n'.join(errors))
    print('Profile 格式检查通过；来源真实性仍需人工核对。')


if __name__ == '__main__':
    main()
