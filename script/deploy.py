#!/usr/bin/env python3
"""Deploy dotfiles with chezmoi without installing packages or changing accounts."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parent.parent
CAPABILITIES = ("shell", "git", "prompt", "tmux", "terminal", "agents", "cursor")
DEFAULTS = {"shell", "git", "prompt"}


def directory(value):
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise ValueError(f"Directory must be absolute: {path}")
    return path.resolve()


def locations(env=os.environ):
    home = directory(env["HOME"])
    return {
        "home": home,
        "config": directory(env.get("XDG_CONFIG_HOME") or home / ".config"),
        "zsh": directory(env.get("ZDOTDIR") or home),
        "pi": directory(env.get("PI_CODING_AGENT_DIR") or home / ".pi/agent"),
        "state": directory(env.get("XDG_STATE_HOME") or home / ".local/state") / "dotfiles",
    }


def fingerprint(path):
    if path.is_symlink():
        return "link:" + os.readlink(path)
    if path.is_file():
        return "file:" + hashlib.sha256(path.read_bytes()).hexdigest()
    if path.exists():
        return "directory"
    return None


def backup(path):
    target = path.with_name(path.name + ".before-dotfiles")
    suffix = 0
    while os.path.lexists(target):
        suffix += 1
        target = path.with_name(path.name + f".before-dotfiles.{suffix}")
    if path.is_symlink():
        target.symlink_to(os.readlink(path))
    else:
        shutil.copy2(path, target)
    print(f"Backup: {target}", flush=True)


def atomic_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".dotfiles-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            stream.write(text)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def git_config(path, config):
    # Keep the global file machine-owned so git config --global never edits source.
    shared = str(config / "git/config")
    include = f'[include]\n\tpath = {json.dumps(shared, ensure_ascii=False)}\n'
    include += f'[core]\n\texcludesFile = {json.dumps(str(config / "git/ignore"), ensure_ascii=False)}\n'
    if path.is_symlink():
        if path.resolve() != ROOT / "git/gitconfig":
            raise ValueError(f"Unmanaged Git config symlink: {path}. Detach it to a local file first.")
        return include
    if path.exists() and not path.is_file():
        raise ValueError(f"Not a regular Git config: {path}")
    before = path.read_text() if path.exists() else ""
    result = subprocess.run(["git", "config", "--file", str(path), "--get-all", "include.path"],
                            text=True, capture_output=True)
    if result.returncode not in (0, 1):
        raise ValueError(f"Cannot read Git config {path}: {result.stderr.strip()}")
    if shared in result.stdout.splitlines():
        return before
    return include + before


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("diff", "apply", "status"))
    parser.add_argument("--with", dest="add", action="append", choices=CAPABILITIES, default=[])
    parser.add_argument("--without", action="append", choices=CAPABILITIES, default=[])
    parser.add_argument("--adopt", action="store_true",
                        help="back up conflicting regular files or symlinks before replacing them")
    args = parser.parse_args(argv)
    if sys.platform not in ("linux", "darwin"):
        raise ValueError("Deployment supports Linux, WSL, containers, and macOS, not native Windows.")
    paths = locations()
    state_file = paths["state"] / "deployment.json"
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    if not isinstance(state, dict) or state and state.get("version") != 1:
        raise ValueError(f"Unsupported deployment state: {state_file}")
    capabilities = state.get("capabilities", sorted(DEFAULTS))
    previous = state.get("targets", {})
    if (not isinstance(capabilities, list) or any(not isinstance(name, str) for name in capabilities)
            or not isinstance(previous, dict)
            or any(not isinstance(name, str) or not isinstance(value, str)
                   for name, value in previous.items())):
        raise ValueError(f"Invalid deployment state: {state_file}")
    selected = (set(capabilities) | set(args.add)) - set(args.without)
    if selected - set(CAPABILITIES):
        raise ValueError("Unknown saved capabilities. Review deployment.json before retrying.")
    chezmoi = shutil.which("chezmoi")
    if not chezmoi:
        raise ValueError("chezmoi is required. Install it with your package manager, then retry.")
    print("Capabilities: " + ", ".join(sorted(selected)), flush=True)
    targets = {}
    migrations = []
    with tempfile.TemporaryDirectory(prefix="dotfiles-chezmoi-") as temporary:
        temporary = Path(temporary)
        config = temporary / "config.json"
        config.write_text(json.dumps({
            "data": {"root": str(ROOT), "home": str(paths["home"]), "zsh": str(paths["zsh"]),
                     "capabilities": {name: name in selected for name in CAPABILITIES}},
        }))

        def command(scope, *arguments, capture=False, preview=False):
            # Preview commands must not create persistent state in the user's home.
            database = (temporary if preview else paths["state"]) / f"{scope}.boltdb"
            return subprocess.run([
                chezmoi, "--config", str(config), "--source", str(ROOT / "chezmoi" / scope),
                "--destination", str(paths[scope]), "--persistent-state", str(database),
                "--cache", str(temporary / "cache"), "--color=false", "--no-tty",
                *arguments,
            ], check=True, text=True, capture_output=capture)

        active = set()
        observed = {}
        for scope in ("home", "config", "zsh", "pi"):
            result = command(scope, "managed", "--include=files,symlinks",
                             capture=True, preview=True)
            for relative in result.stdout.splitlines():
                path = paths[scope] / relative
                content = command(scope, "cat", str(path), capture=True, preview=True).stdout
                targets[str(path)] = (scope, content)
                active.add(scope)

        # Inspect every destination before making the first change.
        legacy_directories = {}
        for name, (_, content) in targets.items():
            path = Path(name)
            current = fingerprint(path)
            observed[name] = current
            wanted = "file:" + hashlib.sha256(content.encode()).hexdigest()
            for parent in path.parents:
                if parent.is_symlink():
                    if parent.is_dir() and parent.resolve().is_relative_to(ROOT):
                        legacy_directories[parent] = os.readlink(parent)
                    else:
                        raise ValueError(f"Destination parent is symlinked: {parent}. Review it before deployment.")
                if parent.exists() and not parent.is_dir():
                    raise ValueError(f"Destination parent is not a directory: {parent}")
            legacy = ((path.is_symlink() and path.resolve().is_relative_to(ROOT))
                      or any(parent in legacy_directories for parent in path.parents))
            if current == "directory":
                raise ValueError(f"Refusing to replace a directory: {path}")
            if current is not None and current != wanted:
                if (args.command == "apply" and current != previous.get(name)
                        and not legacy and not args.adopt):
                    raise ValueError(f"Unmanaged or edited file: {path}. Review it, then use --adopt to back it up.")
                if legacy or current != previous.get(name):
                    migrations.append(path)
        git_path = paths["home"] / ".gitconfig"
        git_after = git_config(git_path, paths["config"]) if "git" in selected else None
        if args.command != "apply":
            for scope in ("home", "config", "zsh", "pi"):
                if scope in active:
                    command(scope, args.command, preview=True)
            if git_after is not None and (git_path.is_symlink() or
                                          not git_path.exists() or git_path.read_text() != git_after):
                print(f"Would preserve {git_path} and add the shared Git include.")
            return 0
        paths["state"].mkdir(parents=True, exist_ok=True)
        for path, target in legacy_directories.items():
            if not path.is_symlink() or os.readlink(path) != target:
                raise ValueError(f"Directory changed during deployment: {path}. Retry.")
            # Detach old directory links before writing backups or files below them.
            with tempfile.TemporaryDirectory(prefix=".dotfiles-", dir=path.parent) as staging:
                copy = Path(staging) / "contents"
                shutil.copytree(path, copy, symlinks=True)
                backup(path)
                path.unlink()
                copy.rename(path)
        for path in migrations:
            backup(path)
        for scope in ("home", "config", "zsh", "pi"):
            if scope not in active:
                continue
            for name, (owner, _) in targets.items():
                if owner == scope and fingerprint(Path(name)) != observed[name]:
                    raise ValueError(f"File changed during deployment: {name}. Retry.")
            paths[scope].mkdir(parents=True, exist_ok=True)
            command(scope, "apply", "--force")
        if git_after is not None and (git_path.is_symlink() or
                                      not git_path.exists() or git_path.read_text() != git_after):
            if os.path.lexists(git_path):
                backup(git_path)
            atomic_text(git_path, git_after)
        # Retain ownership records for deselected capabilities; never delete their files.
        previous.update({name: fingerprint(Path(name)) for name in targets})
        atomic_text(state_file, json.dumps({
            "version": 1, "capabilities": sorted(selected), "targets": previous,
        }, indent=2) + "\n")
    print("Configuration deployed. No packages installed or login shell changed.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"Deployment: {error}", file=sys.stderr)
        sys.exit(1)
