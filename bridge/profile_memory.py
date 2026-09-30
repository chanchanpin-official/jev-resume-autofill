"""Grounded, successful form answers augment the profile without overwriting facts."""
import hashlib
import json
import os
import threading
import time
from pathlib import Path

LOCK = threading.Lock()

def evidence_digest(candidates, source_ids):
    if not source_ids or any(i not in candidates or i.startswith('learned_') for i in source_ids):
        return None
    rows = [(i, candidates[i]['source'], candidates[i]['value']) for i in sorted(set(source_ids))]
    return hashlib.sha256(json.dumps(rows, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

def memory_path(profile_path):
    return Path(profile_path).with_name('learned-answers.json')

def load_answers(profile_path, candidates):
    path = memory_path(profile_path)
    if not path.exists(): return []
    with LOCK:
        try: entries = json.loads(path.read_text()).get('answers', [])
        except (ValueError, OSError): return []
    return [a for a in entries if not a.get('invalidated') and a.get('evidence_digest') and a['evidence_digest'] == evidence_digest(candidates, a.get('source_ids', []))]

def save_answer(profile_path, decision, candidates):
    item = decision.get('_learning')
    if decision.get('status') != 'fill' or not isinstance(item, dict) or not item.get('evidence_digest'):
        return {'saved': False, 'reason': '没有可保存的经复核内容'}
    if item['evidence_digest'] != evidence_digest(candidates, item.get('source_ids', [])):
        return {'saved': False, 'reason': '原始资料已变更，不保存过期候选'}
    scope = item.get('scope', 'site')
    item = {k: item[k] for k in ('text', 'field_label', 'section', 'host', 'group', 'source_ids', 'evidence_digest')}
    item['scope'] = 'general' if scope == 'general' else 'site'
    identity = json.dumps(item, ensure_ascii=False, sort_keys=True)
    item['id'] = hashlib.sha256(identity.encode()).hexdigest()[:24]
    item['saved_at'] = time.time()
    item['provenance'] = 'Generator candidate; Jev evidence and confidence checks passed; extension confirmed field accepted'
    path = memory_path(profile_path)
    with LOCK:
        data = json.loads(path.read_text()) if path.exists() else {'schema_version': 1, 'answers': []}
        entries = data['answers']
        if any(a.get('id') == item['id'] for a in entries): return {'saved': True, 'duplicate': True}
        entries.append(item);data['answers'] = entries[-300:]
        tmp = path.with_suffix('.tmp')
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as f: json.dump(data, f, ensure_ascii=False, indent=2)
        tmp.replace(path)
    return {'saved': True, 'duplicate': False}
