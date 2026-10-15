#!/usr/bin/env python3
"""Select machine-local mise tools without modifying personal configuration."""

import argparse
from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib


ROOT = Path(__file__).resolve().parent.parent
ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
STATE = "dotfiles-selection.json"


def read_toml(path):
    return tomllib.loads(path.read_text())


class Catalog:
    def __init__(self, root=ROOT):
        self.root = root
        data = read_toml(root / "mise/catalog.toml")
        self.groups = data["groups"]
        self.profiles = data["profiles"]
        self.tools = {}
        keys = set()
        for path in sorted((root / "mise/tools").glob("*.toml")):
            data = read_toml(path)
            name = path.stem
            if not ID.fullmatch(name) or set(data) != {"tools", "_"} or len(data["tools"]) != 1:
                raise ValueError(f"{path}: expected one tool and an [_] metadata table")
            key = next(iter(data["tools"]))
            if key in keys:
                raise ValueError(f"{path}: duplicate mise tool {key}")
            keys.add(key)
            meta = data["_"]
            self.tools[name] = dict(meta, path=path, key=key, config=data["tools"][key])
        for kind, entries in [("group", self.groups), ("profile", self.profiles)]:
            for name, entry in entries.items():
                if not ID.fullmatch(name) or not isinstance(entry.get("label"), str):
                    raise ValueError(f"Invalid {kind}: {name}")
        if "core" not in self.groups:
            raise ValueError("Missing core group")
        for name, tool in self.tools.items():
            if not isinstance(tool.get("label"), str) or not tool.get("groups"):
                raise ValueError(f"{name}: label and groups are required")
            self.validate_names(tool["groups"], self.groups, "group")
            self.validate_names(tool.get("requires", []), self.tools, "dependency")
        for profile in self.profiles.values():
            self.validate_names(profile.get("groups", []), self.groups, "group")
            self.validate_names(profile.get("tools", []), self.tools, "tool")
        self.closure(set(self.tools))  # Also reject dependency cycles.

    @staticmethod
    def validate_names(names, entries, kind):
        if not isinstance(names, list) or any(not isinstance(name, str) for name in names):
            raise ValueError(f"Expected a list of {kind} names")
        for name in names:
            if name not in entries:
                raise ValueError(f"Unknown {kind}: {name}")

    def members(self, kind, name):
        entries = {"profile": self.profiles, "group": self.groups, "tool": self.tools}
        if kind not in entries or name not in entries[kind]:
            raise ValueError(f"Unknown selection: {kind}:{name}")
        if kind == "tool":
            return {name}
        if kind == "group":
            return {key for key, tool in self.tools.items() if name in tool["groups"]}
        profile = self.profiles[name]
        members = set(profile.get("tools", []))
        for group in profile.get("groups", []):
            members |= self.members("group", group)
        return members | self.core

    @property
    def core(self):
        return self.members("group", "core")

    def closure(self, tools):
        resolved, visiting = set(), set()

        def visit(name):
            if name in visiting:
                raise ValueError(f"Dependency cycle at {name}")
            if name in resolved:
                return
            visiting.add(name)
            for dependency in self.tools[name].get("requires", []):
                visit(dependency)
            visiting.remove(name)
            resolved.add(name)

        for name in tools:
            visit(name)
        return resolved

    def reference(self, value):
        if ":" in value:
            kind, name = value.split(":", 1)
        else:
            kind, name = ("group" if value in self.groups else "tool"), value
        self.members(kind, name)
        return kind, name


@dataclass
class Selection:
    profiles: set = field(default_factory=set)
    groups: set = field(default_factory=set)
    tools: set = field(default_factory=set)
    exclude: set = field(default_factory=set)

    @classmethod
    def load(cls, data, catalog):
        selection = cls()
        for key, entries in [("profiles", catalog.profiles), ("groups", catalog.groups),
                             ("tools", catalog.tools), ("exclude", catalog.tools)]:
            names = data.get(key, [])
            catalog.validate_names(names, entries, key)
            setattr(selection, key, set(names))
        if selection.exclude & catalog.core:
            raise ValueError("Core tools cannot be excluded")
        return selection

    def requested(self, catalog):
        tools = self.tools | catalog.core
        for name in self.profiles:
            tools |= catalog.members("profile", name)
        for name in self.groups:
            tools |= catalog.members("group", name)
        return tools - self.exclude

    def resolve(self, catalog):
        return catalog.closure(self.requested(catalog))

    def change(self, catalog, kind, name, enabled):
        members = catalog.members(kind, name)
        bucket = getattr(self, {"profile": "profiles", "group": "groups", "tool": "tools"}[kind])
        if enabled:
            bucket.add(name)
            self.exclude -= members
        else:
            if members <= catalog.core:
                raise ValueError("Core tools are always selected")
            # Exclusions take priority over overlapping profiles and groups.
            bucket.discard(name)
            self.tools -= members
            self.exclude |= members - catalog.core

    def dump(self):
        return {key: sorted(getattr(self, key)) for key in ("profiles", "groups", "tools", "exclude")}


def config_directory():
    if os.environ.get("MISE_GLOBAL_CONFIG_FILE"):
        raise ValueError("MISE_GLOBAL_CONFIG_FILE disables conf.d loading. Unset it before configuring tools.")
    base = Path(os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config"))
    return Path(os.environ.get("MISE_CONFIG_DIR") or str(base / "mise")).expanduser().absolute()


def load_state(directory, catalog):
    path = directory / STATE
    if path.exists():
        data = json.loads(path.read_text())
        sources = data.get("sources") if data.get("version") == 2 else data.get("links")
        if data.get("version") not in {1, 2} or not isinstance(sources, dict):
            raise ValueError(f"Unsupported selection state: {path}")
        return Selection.load(data, catalog), sources
    selection = Selection()
    config = directory / "config.toml"
    if config.is_file():
        existing = read_toml(config).get("tools", {})
        selection.tools = {name for name, tool in catalog.tools.items() if tool["key"] in existing}
    return selection, {}


def atomic_text(path, text):
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            stream.write(text)
        os.replace(temporary, path)
    finally:
        if os.path.lexists(temporary):
            os.unlink(temporary)


def legacy_config(directory, catalog):
    path = directory / "config.toml"
    if not path.is_symlink():
        return None
    target = Path(os.readlink(path))
    if not target.is_absolute():
        target = path.parent / target
    if target.resolve() != (catalog.root / "mise/config.toml").resolve():
        return None
    # Updating dotfiles can remove the old target before setup migrates its link.
    if not path.exists():
        return path
    data = read_toml(path)
    expected = read_toml(catalog.root / "mise/settings.toml")
    expected["tools"] = {tool["key"]: tool["config"] for tool in catalog.tools.values()}
    if data != expected:
        raise ValueError(f"{path}: shared config has custom changes. Convert it to a local file first; nothing was changed.")
    return path


def fragment_text(source):
    return ("# Managed by dotfiles. Put local overrides in ../config.local.toml.\n"
            f"include = [{json.dumps(source, ensure_ascii=False)}]\n")


def save_selection(directory, catalog, selection, previous):
    selected = selection.resolve(catalog)
    wanted = {"00-dotfiles-settings.toml": str(catalog.root / "mise/settings.toml")}
    wanted.update({f"10-dotfiles-{name}.toml": str(catalog.tools[name]["path"]) for name in sorted(selected)})
    # Preflight every path before replacing or removing anything.
    for name, target in previous.items():
        if not re.fullmatch(r"(?:00-dotfiles-settings|10-dotfiles-[a-z0-9-]+)\.toml", name) or not isinstance(target, str):
            raise ValueError("Invalid managed fragment in selection state")
    fragments = directory / "conf.d"
    for name in previous.keys() | wanted.keys():
        path = fragments / name
        if os.path.lexists(path):
            sources = {source for source in (previous.get(name), wanted.get(name)) if source}
            matches = (path.is_symlink() and os.readlink(path) in sources)
            if name != "00-dotfiles-settings.toml" and path.is_file() and not path.is_symlink():
                matches = path.read_text() in {fragment_text(source) for source in sources}
            if not matches:
                raise ValueError(f"Refusing to overwrite modified or unmanaged file: {path}. "
                                 "Preserve its contents in a local config or backup and move this file before retrying.")
    legacy = legacy_config(directory, catalog)
    fragments.mkdir(parents=True, exist_ok=True)
    if legacy:
        backup = legacy.with_name("config.toml.before-dotfiles-selection")
        suffix = 0
        while os.path.lexists(backup):
            suffix += 1
            backup = legacy.with_name(f"config.toml.before-dotfiles-selection.{suffix}")
        dangling = not legacy.exists()
        shutil.copy2(legacy, backup, follow_symlinks=not dangling)
        atomic_text(legacy, "# Machine-local mise overrides. Shared tools are selected in conf.d/.\n")
        description = "config link" if dangling else "config"
        print(f"Preserved the previous shared {description} at {backup}")
    for name, target in wanted.items():
        path = fragments / name
        if name != "00-dotfiles-settings.toml":
            content = fragment_text(target)
            if path.is_symlink() or not path.is_file() or path.read_text() != content:
                atomic_text(path, content)
            continue
        if path.is_symlink() and os.readlink(path) == target:
            continue
        temporary = fragments / f".{name}-{os.getpid()}"
        try:
            temporary.symlink_to(target)
            os.replace(temporary, path)
        finally:
            if temporary.is_symlink():
                temporary.unlink()
    for name in previous.keys() - wanted.keys():
        (fragments / name).unlink(missing_ok=True)
    data = dict(selection.dump(), version=2, sources=wanted, resolved=sorted(selected))
    atomic_text(directory / STATE, json.dumps(data, indent=2) + "\n")
    print(f"Saved {len(selected)} tools in {fragments}")
    print("Existing tool installations and unmanaged configuration were left alone.")
    config = directory / "config.toml"
    if config.is_file() and read_toml(config).get("tools"):
        print(f"Note: tools in {config} still apply and override the selected defaults.")


def print_selection(catalog, selection):
    print("Selected tools:")
    requested = selection.requested(catalog)
    for name in sorted(selection.resolve(catalog)):
        tool = catalog.tools[name]
        reason = " [core]" if name in catalog.core else " [dependency]" if name not in requested else ""
        print(f"  {name:18} {tool['label']}{reason}")


def select_interactively(catalog, selection):
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise ValueError("The selector needs a terminal. Use --profile, --with, or --keep-current for unattended setup.")
    try:
        import curses
    except ImportError as error:
        raise ValueError("Python curses is unavailable. Install it or select tools with --profile and --with.") from error

    def run(screen):
        try:
            curses.curs_set(0)
        except curses.error:
            pass
        cursor, top, query, message = 0, 0, "", ""
        rows = [("profile", name, profile["label"]) for name, profile in catalog.profiles.items()]
        for name, group in catalog.groups.items():
            rows.append(("group", name, group["label"]))
            rows.extend(("tool", tool, catalog.tools[tool]["label"])
                        for tool in sorted(catalog.members("group", name)))

        def text(y, value, style=0):
            height, width = screen.getmaxyx()
            if 0 <= y < height and width > 1:
                try:
                    screen.addnstr(y, 0, value, width - 1, style)
                except curses.error:
                    pass

        while True:
            height, width = screen.getmaxyx()
            screen.erase()
            if height < 10 or width < 44:
                text(0, "Resize to at least 44 columns and 10 rows. q: cancel")
                if screen.getch() in (ord("q"), 27):
                    return False
                continue
            selected = selection.resolve(catalog)
            visible = [row for row in rows if query.lower() in f"{row[0]} {row[1]} {row[2]}".lower()]
            cursor = min(cursor, max(0, len(visible) - 1))
            page = height - 8
            top = max(0, min(top, cursor))
            if cursor >= top + page:
                top = cursor - page + 1
            text(0, f"Mise tools: {len(selected)} selected", curses.A_BOLD)
            text(1, "Space: toggle  arrows/j/k: move  /: filter  s/Enter: save  q/Esc: cancel")
            text(2, "[x] all  [-] partial  [ ] none. Core and required dependencies stay selected.")
            text(3, "Profiles and groups expand to tools. Saving does not uninstall anything.")
            for y, (kind, name, label) in enumerate(visible[top:top + page], 5):
                members = catalog.members(kind, name)
                count = len(members & selected)
                mark = "x" if count == len(members) else "-" if count else " "
                if kind == "profile" and name == "core":
                    mark = "x" if selected == catalog.closure(catalog.core) else "-"
                prefix = "    " if kind == "tool" else f"{kind:7} "
                detail = " [core]" if kind == "tool" and name in catalog.core else ""
                if kind == "tool" and name in selected and name not in selection.requested(catalog):
                    detail = " [dependency]"
                line = f"{prefix}[{mark}] {name}: {label}{detail}"
                text(y, line, curses.A_REVERSE if top + y - 5 == cursor else 0)
            text(height - 2, f"Filter: {query}" if query else message)
            text(height - 1, "Selection is machine-local. Licenses and credentials are not copied.")
            screen.refresh()
            key = screen.getch()
            message = ""
            if key in (ord("q"), 27):
                return False
            if key in (ord("s"), 10, 13):
                return True
            if key in (curses.KEY_DOWN, ord("j")):
                cursor = min(len(visible) - 1, cursor + 1)
            elif key in (curses.KEY_UP, ord("k")):
                cursor = max(0, cursor - 1)
            elif key == curses.KEY_NPAGE:
                cursor = min(len(visible) - 1, cursor + page)
            elif key == curses.KEY_PPAGE:
                cursor = max(0, cursor - page)
            elif key == ord("/"):
                query = ""
                while True:
                    screen.move(height - 2, 0)
                    screen.clrtoeol()
                    text(height - 2, f"Filter: {query}  [Enter to finish]")
                    screen.refresh()
                    char = screen.getch()
                    if char in (10, 13, 27):
                        break
                    if char in (curses.KEY_BACKSPACE, 127, 8):
                        query = query[:-1]
                    elif 32 <= char < 127:
                        query += chr(char)
                cursor, top = 0, 0
            elif key == ord(" ") and visible:
                kind, name, _ = visible[cursor]
                if kind == "profile" and name == "core":
                    selection.profiles, selection.groups = {"core"}, set()
                    selection.tools, selection.exclude = set(), set()
                    continue
                members = catalog.members(kind, name)
                if kind == "tool" and name in selected and name not in selection.requested(catalog):
                    message = "Required by another selected tool. Deselect that tool first."
                    continue
                try:
                    selection.change(catalog, kind, name, not members <= selected)
                except ValueError as error:
                    message = str(error)

    try:
        return curses.wrapper(run)
    except curses.error as error:
        raise ValueError("Could not use this terminal. Check TERM or choose tools with --profile and --with.") from error


def parser():
    result = argparse.ArgumentParser(description="Select machine-local mise tools. With no selection arguments, open the TUI.")
    result.add_argument("--profile", action="append", default=[], help="start with this profile; repeat to combine profiles")
    result.add_argument("--with", dest="add", action="append", default=[], metavar="GROUP_OR_TOOL", help="add a group or individual tool")
    result.add_argument("--without", action="append", default=[], metavar="GROUP_OR_TOOL", help="exclude a group or tool; core/dependencies remain")
    result.add_argument("--edit", action="store_true", help="open the TUI after applying command-line choices")
    result.add_argument("--keep-current", action="store_true", help="reuse saved selection, or import tools from the old global config")
    result.add_argument("--dry-run", action="store_true", help="show selected tools without saving or installing")
    result.add_argument("--install", action="store_true", help="run mise install after saving; otherwise only configure")
    result.add_argument("--list", action="store_true", help="list profiles, groups, and tool IDs")
    return result


def main(argv=None):
    args = parser().parse_args(argv)
    catalog = Catalog()
    for name in args.profile:
        catalog.members("profile", name)
    for value in args.add + args.without:
        catalog.reference(value)
    if args.list:
        for kind, entries in [("profile", catalog.profiles), ("group", catalog.groups), ("tool", catalog.tools)]:
            for name, entry in entries.items():
                print(f"{kind:7} {name:18} {entry['label']}")
        return 0
    directory = config_directory()
    selection, previous = load_state(directory, catalog)
    if args.keep_current and not args.profile and not (directory / STATE).exists():
        legacy = legacy_config(directory, catalog)
        if legacy and not legacy.exists():
            raise ValueError("The old shared config is missing, so its tools cannot be imported. "
                             "Choose a profile with --profile or review tools in the TUI instead.")
    if args.profile:
        selection = Selection()
    for name in args.profile:
        selection.change(catalog, "profile", name, True)
    for value in args.add:
        selection.change(catalog, *catalog.reference(value), True)
    for value in args.without:
        selection.change(catalog, *catalog.reference(value), False)
    explicit = args.profile or args.add or args.without or args.keep_current
    if args.edit or not explicit:
        if not select_interactively(catalog, selection):
            print("Cancelled. Nothing was changed or installed.")
            return 130
    print_selection(catalog, selection)
    if args.dry_run:
        print("Dry run. Nothing was changed or installed.")
        return 0
    save_selection(directory, catalog, selection, previous)
    if args.install:
        mise = shutil.which("mise") or str(Path.home() / ".local/bin/mise")
        return subprocess.run([mise, "-C", str(Path.home()), "install"], check=False).returncode
    print("Run mise install to install the selection, or rerun this command with --install.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        sys.exit(130)
