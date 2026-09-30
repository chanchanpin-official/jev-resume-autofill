"""Local attachment identity and narrowly authorized date corrections."""
import json
import re
from pathlib import Path

def get_support(profile_path):
    path = Path(profile_path)
    profile = json.loads(path.read_text())
    corrections = []
    for item in profile.get('authorized_form_corrections', []):
        match = re.fullmatch(r'education\[(\d+)\]\.(start|end)', item.get('source', ''))
        if item.get('status') != 'pending' or not item.get('authorization') or not match:
            continue
        index, endpoint = int(match[1]), match[2]
        records = profile.get('education', [])
        if index >= len(records) or records[index].get('id') != item.get('record_id'):
            continue
        record = records[index]
        canonical = record.get(endpoint, '')
        if re.fullmatch(r'\d{4}-\d{2}', canonical) and profile.get('date_conventions', {}).get('month_only_default_day') == 1:
            canonical += '-01'
        if canonical != item.get('to') or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', item.get('from', '')) or not record.get('school_zh'):
            continue
        corrections.append({k: item[k] for k in ('id', 'host', 'from', 'to', 'source', 'field')} | {'section': '教育经历', 'identity': record['school_zh'], 'endpoint': endpoint})
    return {'attachments': [], 'upload_mode': 'manual', 'corrections': corrections}

def complete_correction(profile_path, correction_id):
    path = Path(profile_path)
    if not any(x['id'] == correction_id for x in get_support(path)['corrections']):
        return {'saved': False}
    profile = json.loads(path.read_text())
    for item in profile['authorized_form_corrections']:
        if item['id'] == correction_id:
            item['status'] = 'saved_verified'
    temporary = path.with_suffix('.correction.tmp')
    temporary.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)
    return {'saved': True}
