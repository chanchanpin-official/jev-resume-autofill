"""Install the bundled skill; keep personal configuration in the plugin directory."""
import argparse
import shutil
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL_FILES = ('SKILL.md', 'references/onboarding.md', 'references/profile-format.md',
               'scripts/inventory.py', 'scripts/validate_profile.py')


def install(skills_dir):
    source = ROOT / 'skills/jev-profile'
    target = Path(skills_dir).expanduser().resolve() / 'jev-profile'
    if target.is_symlink() or (target.exists() and not target.is_dir()):
        raise ValueError('同名安装位置是链接或普通文件；请指定实际 skills 目录，避免覆盖其他安装')
    files = [source / name for name in SKILL_FILES]
    if not all(p.is_file() for p in files):
        raise ValueError('skill 源文件不完整，请重新取得完整公开源码')
    if any(p.is_symlink() for p in files):
        raise ValueError('skill 源文件含链接，请使用完整的公开源码副本')
    changes = [p for p in files if not (target / p.relative_to(source)).is_file()
               or (target / p.relative_to(source)).is_symlink()
               or p.read_bytes() != (target / p.relative_to(source)).read_bytes()]
    if not changes:
        return target, False
    for src in changes:
        dest = target / src.relative_to(source)
        if any(parent.is_symlink() for parent in [dest, *dest.parents]):
            raise ValueError('安装路径包含链接，未继续写入；请检查实际 skills 目录')
    # Back up existing versions outside Codex discovery before an explicit update.
    if target.exists():
        backups = ROOT / '.runtime/skill-backups'
        backups.mkdir(parents=True, exist_ok=True)
        backup = Path(tempfile.mkdtemp(prefix='jev-profile-', dir=backups))
        shutil.copytree(target, backup / 'jev-profile', symlinks=True)
    for src in changes:
        dest = target / src.relative_to(source)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
    return target, True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skills-dir', type=Path,
                        help='Parent skills directory; default is ~/.agents/skills')
    args = parser.parse_args()
    if args.skills_dir is None and (Path.home() / '.codex/skills/jev-profile').exists():
        raise SystemExit('发现旧 ~/.codex/skills/jev-profile，未创建第二份同名 skill。'
                         '若 agent 仍识别该副本，用 --skills-dir "~/.codex/skills" 更新；'
                         '或先整理旧副本，再安装到默认 ~/.agents/skills。')
    try:
        target, changed = install(args.skills_dir or Path.home() / '.agents/skills')
    except (OSError, ValueError):
        raise SystemExit('skill 安装未完成；检查目录权限、同名文件或链接。已有版本的更新备份位于插件 .runtime/skill-backups。') from None
    print(('已安装 / 更新：' if changed else '已是当前版本：') + str(target))
    print('在 agent 的 skill 列表中确认 jev-profile；未出现时重新打开会话。避免在多个 skills 目录重复安装同名副本。')
    print('然后说：使用 $jev-profile 初始化 Jev 简历插件，插件目录为 <此插件目录>，资料目录为 <我的求职材料目录>。')
    print('skill 不内置 API key 或个人资料；后续密钥在你自己的终端配置。')


if __name__ == '__main__':
    main()
