"""Inventory candidate documents without copying contents or following symlinks."""
import argparse
import hashlib
import json
import os
from pathlib import Path

EXTENSIONS = {'.md', '.markdown', '.txt', '.pdf', '.docx', '.doc', '.rtf', '.odt', '.xlsx', '.xls', '.csv', '.tsv', '.pptx', '.html', '.htm', '.json', '.yaml', '.yml', '.png', '.jpg', '.jpeg', '.webp'}
SKIP_DIRS = {'.git', '.runtime', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', 'test-results', '.cache'}


def inventory(workspace, output=None):
    root = Path(workspace).resolve()
    if not root.is_dir():
        raise ValueError('资料工作区不存在或不是目录')
    excluded = Path(output).resolve().parent if output else None
    entries = []
    for directory, dirs, files in os.walk(root, followlinks=False):
        current = Path(directory)
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith('.edge-')
                         and not (current / d).is_symlink() and (current / d).resolve() != excluded
                         and not ((current / d) / 'extension/manifest.json').is_file())
        for name in sorted(files):
            path = current / name
            if path.is_symlink() or name.startswith('.env') or name in {'config.json', 'local-config.js', 'profile.json', 'profile.private.json', 'learned-answers.json', 'source-inventory.json'}:
                continue
            if path.suffix.lower() not in EXTENSIONS:
                continue
            try:
                hasher = hashlib.sha256()
                with path.open('rb') as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                        hasher.update(chunk)
                entries.append({'path': path.relative_to(root).as_posix(), 'bytes': path.stat().st_size,
                                'sha256': hasher.hexdigest(), 'status': 'pending_read'})
            except OSError:
                entries.append({'path': path.relative_to(root).as_posix(), 'status': 'unreadable'})
    return {'documents': sorted(entries, key=lambda item: item['path'])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('workspace', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    data = inventory(args.workspace, args.output)
    text = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        os.chmod(args.output, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(text)
        print('文档清单已保存，共 %d 项；尚未读取正文。' % len(data['documents']))
    else:
        print(text, end='')


if __name__ == '__main__':
    main()
