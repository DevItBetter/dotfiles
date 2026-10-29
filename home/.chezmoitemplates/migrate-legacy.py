import json
import os
from pathlib import Path
import tarfile
import tempfile
import tomllib


def migrate(home, config, source, catalog, selected):
    """Plan preservation first; remove legacy files only after it succeeds."""
    suffixes = {
        home / '.zshrc': '/zsh/zshrc',
        home / '.zshenv': '/zsh/zshenv',
        home / '.gitconfig': '/git/gitconfig',
        home / '.tmux.conf': '/tmux/tmux.conf',
        home / '.local/bin/tmux-pane-bg': '/tmux/bin/tmux-pane-bg',
        config / 'starship.toml': '/starship/starship.toml',
        config / 'alacritty/alacritty.toml': '/alacritty/alacritty.toml',
        home / '.cursor/rules': '/cursor/rules',
        config / 'opencode/plugins/command-environment.js': '/agents/opencode.js',
        config / 'opencode/plugins/command-environment.mjs': '/agents/command-environment.mjs',
        home / '.pi/agent/extensions/command-environment.js': '/agents/pi.js',
        home / '.pi/agent/extensions/command-environment.mjs': '/agents/command-environment.mjs',
        config / 'mise/conf.d/00-dotfiles-settings.toml': '/mise/settings.toml',
        config / 'mise/config.toml': '/mise/config.toml',
    }
    links = [p for p, suffix in suffixes.items() if p.is_symlink() and os.readlink(p).endswith(suffix)]
    roots = {source, home / 'dotfiles'}
    for path in links:
        target = Path(os.path.abspath(path.parent / os.readlink(path)))
        roots.add(Path(str(target)[:-len(suffixes[path])]))
    writes = {}
    removed = set(links)
    preserved = set()
    gitlocal = home / '.gitconfig.local'
    if gitlocal.is_file():
        preserved.add(gitlocal)

    mise = config / 'mise'
    selection = mise / 'dotfiles-selection.json'
    fragments = sorted((mise / 'conf.d').glob('10-dotfiles-*.toml'))
    names = set()
    if selection.exists():
        data = json.loads(selection.read_text())
        if not isinstance(data, dict) or not isinstance(data.get('resolved'), list):
            raise ValueError(f'{selection}: expected the legacy tool selection; nothing removed')
        names.update(data['resolved'])
        removed.add(selection)
    for path in fragments:
        name = path.name.removeprefix('10-dotfiles-').removesuffix('.toml')
        names.add(name)
        if path.exists():
            fragment = tomllib.loads(path.read_text())
            targets = fragment.get('include', [])
            if set(fragment) - {'include'} or (fragment and (
                not isinstance(targets, list) or len(targets) != 1
                or not isinstance(targets[0], str) or not targets[0].endswith(f'/mise/tools/{name}.toml')
            )):
                raise ValueError(f'{path}: contains custom settings; move them to config.local.toml first')
        removed.add(path)
    unknown = names - catalog.keys()
    if unknown:
        raise ValueError(f'Unknown legacy tools {sorted(unknown)}; preserve them before retrying')
    local = mise / 'config.local.toml'
    local_text = local.read_text() if local.exists() else ''
    global_config = mise / 'config.toml'
    if global_config.is_file() and not global_config.is_symlink():
        previous = global_config.read_text()
        if not previous.startswith('# Managed by chezmoi (profile:') and tomllib.loads(previous):
            existing = tomllib.loads(local_text)
            if existing and existing != tomllib.loads(previous):
                raise ValueError(f'{global_config}: merge its local settings into {local} before retrying')
            if not existing:
                local_text += '\n' + previous
                writes[local] = local_text
                preserved.add(global_config)
    local_tools = tomllib.loads(local_text).get('tools', {})
    extra_lines = []
    for name in sorted(names - set(selected)):
        declaration = catalog[name]
        keys = tomllib.loads('[tools]\n' + declaration)['tools']
        if not keys.keys() <= local_tools.keys():
            extra_lines.append(declaration)
    if extra_lines:
        extras = mise / 'conf.d/90-migrated-dotfiles.toml'
        content = '# Tools preserved from the legacy dotfiles selection.\n[tools]\n' + '\n'.join(extra_lines) + '\n'
        if extras.exists() and extras.read_text() != content:
            raise ValueError(f'{extras}: already contains different settings; nothing removed')
        writes[extras] = content
    if local.exists():
        preserved.add(local)

    zdotlocal = config / 'zsh/local.zsh'
    zsh = zdotlocal.read_text() if zdotlocal.exists() else ''
    old_locals = {root / 'zsh/config' / name for root in roots for name in ['work.zsh', 'local.zsh']}
    old_locals |= {config / 'dotfiles/env.zsh', config / 'dotfiles/local.zsh'}
    for path in sorted(old_locals):
        if path.is_file() and f'# from {path}\n' not in zsh:
            zsh += f'\n# from {path}\n' + path.read_text() + '\n'
            preserved.add(path)
    if zsh != (zdotlocal.read_text() if zdotlocal.exists() else ''):
        writes[zdotlocal] = zsh
    old_bundle = home / '.zsh_plugins.zsh'
    if old_bundle.exists() or old_bundle.is_symlink():
        removed.add(old_bundle)
    for path in writes:
        if path.is_symlink() and path not in links:
            raise ValueError(f'{path}: an unrelated symlink; refusing to replace it')
    writes = {p: text for p, text in writes.items() if p.is_symlink() or not p.exists() or p.read_text() != text}
    if not writes and not removed:
        return

    state = Path(os.environ.get('XDG_STATE_HOME', str(home / '.local/state')))
    backups = state / 'dotfiles/migration'
    backups.mkdir(parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix='legacy-', dir=backups))
    archive = backup / 'configuration.tar.gz'
    with tarfile.open(archive, 'w:gz', dereference=False) as tar:
        for index, path in enumerate(sorted(removed | writes.keys() | preserved)):
            if path.exists() or path.is_symlink():
                name = str(path.relative_to(home)) if path.is_relative_to(home) else f'external/{index}-{path.name}'
                tar.add(path, arcname=name)
    archive.chmod(0o600)
    print(f'Legacy dotfiles backup: {archive}')
    for path, text in writes.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=f'.{path.name}.', dir=path.parent)
        try:
            with os.fdopen(fd, 'w') as output:
                output.write(text)
            os.replace(temporary, path)
        finally:
            Path(temporary).unlink(missing_ok=True)
    for path in removed:
        path.unlink()
