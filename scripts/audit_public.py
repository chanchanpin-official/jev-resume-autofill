"""Check the exact distributable or Git-tracked paths; never echo matched sensitive values."""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    'secret-shaped token': re.compile(r'(?:sk-(?:proj-|ant-)?|gh[pousr]_|AIza)[A-Za-z0-9_-]{20,}'),
    'personal machine path': re.compile(r'/' + r'Users/[^/\s]+|[A-Z]:\\Users\\[^\\\s]+|' + r'One' + r'Drive-'),
    'private email': re.compile(r'[\w.+-]+@(?!(?:example\.(?:invalid|test|com)|[^\s@]+\.invalid)\b)[\w.-]+\.[A-Za-z]{2,}'),
}
PRIVATE_PARTS = {'.runtime', 'node_modules', 'test-results', 'dist', '__pycache__', '.git'}


def audit(paths, deny_terms=()):
    errors = []
    for path in paths:
        relative = path.relative_to(ROOT).as_posix()
        if any(part in PRIVATE_PARTS for part in path.relative_to(ROOT).parts) or path.name == 'local-config.js' or (relative.startswith('profile/') and relative != 'profile/profile.example.json'):
            errors.append(relative + ': private path included')
            continue
        if path.is_symlink():
            errors.append(relative + ': symbolic link included')
            continue
        try:
            content = path.read_text(encoding='utf-8')
        except (OSError, UnicodeError):
            errors.append(relative + ': non-text or unreadable public file')
            continue
        for name, pattern in PATTERNS.items():
            if pattern.search(content):
                errors.append(relative + ': ' + name)
        def contains_private(term):
            term = str(term)
            if not term:
                return False
            if re.fullmatch(r'[A-Za-z .-]+', term):
                return re.search(r'(?<![A-Za-z])' + re.escape(term) + r'(?![A-Za-z])', content, re.I) is not None
            return term.casefold() in content.casefold()
        if any(contains_private(term) for term in deny_terms):
            errors.append(relative + ': private deny-list match')
    template = ROOT / 'profile/profile.example.json'
    if template.is_file() and json.loads(template.read_text()) != {}:
        errors.append('profile/profile.example.json: template must be empty')
    return errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tracked', action='store_true')
    parser.add_argument('--deny-file', type=Path, help='Local private JSON array of forbidden strings')
    args = parser.parse_args()
    if args.tracked:
        output = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode()
        paths = [ROOT / name for name in output.split('\0') if name]
        if not paths:
            raise SystemExit('No tracked files to audit')
    else:
        from package import public_files
        paths = public_files()
    denied = json.loads(args.deny_file.read_text()) if args.deny_file else []
    failures = audit(paths, denied)
    if failures:
        raise SystemExit('\n'.join(failures))
    print('Public audit passed: %d files; empty profile template; no private paths or detected credentials.' % len(paths))


if __name__ == '__main__':
    main()
