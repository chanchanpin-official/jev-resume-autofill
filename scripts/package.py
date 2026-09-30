"""Package an explicit public-source allowlist; private local files never enter archives."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
FOLDERS = ('extension', 'bridge', 'tests', 'scripts', 'docs', 'skills', '.github')
FILES = ('README.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'start.command', 'package.json', 'package-lock.json', '.gitignore', 'profile/profile.example.json')


def public_files(root=ROOT):
    paths = []
    for folder in FOLDERS:
        for path in (root / folder).rglob('*'):
            if path.is_file() and not path.is_symlink() and '__pycache__' not in path.parts and path.name not in ('local-config.js', '.DS_Store') and path.suffix not in ('.pyc', '.log', '.key', '.pem'):
                paths.append(path)
    paths.extend(root / name for name in FILES if (root / name).is_file())
    return sorted(paths)


def main():
    from audit_public import audit
    failures = audit(public_files())
    if failures:
        raise SystemExit('\n'.join(failures))
    version = json.loads((ROOT / 'extension/manifest.json').read_text())['version']
    destination = ROOT / 'dist' / ('jev-resume-autofill-%s.zip' % version)
    destination.parent.mkdir(exist_ok=True)
    with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
        for path in public_files():
            archive.write(path, 'jev-resume-autofill/' + path.relative_to(ROOT).as_posix())
    print(destination)


if __name__ == '__main__':
    main()
