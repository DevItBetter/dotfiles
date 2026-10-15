import copy
import errno
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import shutil
import struct
import subprocess
import sys
import tempfile
import termios
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mise_config import Catalog, ROOT, STATE, Selection, fragment_text, load_state, save_selection


class MiseConfigTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="mise-selection-")
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        self.directory = self.home / "custom config/mise"
        self.catalog = Catalog()

    def profile(self, name):
        selection = Selection()
        selection.change(self.catalog, "profile", name, True)
        return selection

    def run_cli(self, *arguments, script="configure-mise.sh", **extra):
        env = {key: value for key, value in os.environ.items() if not key.startswith("MISE_")}
        env.update(HOME=str(self.home), XDG_CONFIG_HOME=str(self.home / "custom config"), **extra)
        return subprocess.run(["/bin/bash", str(ROOT / "script" / script), *arguments],
                              env=env, text=True, capture_output=True, cwd=self.home)

    def test_profile_contents(self):
        expected = {
            "terumo": {"opencode", "pi", "copilot", "bun", "pnpm", "markitdown", "markitdown-mcp", "herdr"},
            "gbl": {"opencode", "pi", "copilot", "claude-code", "codex", "gemini-cli", "bun", "pnpm",
                    "jcodemunch", "jdatamunch", "jdocmunch", "herdr", "temporal"},
            "core": set(),
        }
        for name, tools in expected.items():
            with self.subTest(name=name):
                self.assertEqual(self.profile(name).resolve(self.catalog), tools | self.catalog.core)

    def test_groups_and_individual_overrides_round_trip(self):
        selection = self.profile("terumo")
        selection.change(self.catalog, "group", "jmunch", True)
        selection.change(self.catalog, "tool", "claude-code", True)
        selection.change(self.catalog, "tool", "pi", False)
        restored = Selection.load(selection.dump(), self.catalog)
        selected = restored.resolve(self.catalog)
        self.assertNotIn("pi", selected)
        self.assertIn("claude-code", selected)
        self.assertTrue(self.catalog.members("group", "jmunch") <= selected)
        self.assertEqual(restored.dump(), selection.dump())

    def test_profiles_can_be_combined_with_exclusions(self):
        selection = self.profile("gbl")
        selection.change(self.catalog, "profile", "terumo", True)
        selection.change(self.catalog, "tool", "gemini-cli", False)
        expected = self.profile("gbl").resolve(self.catalog) | self.profile("terumo").resolve(self.catalog)
        self.assertEqual(selection.resolve(self.catalog), expected - {"gemini-cli"})

    def test_core_and_dependencies_stay_selected(self):
        with self.assertRaisesRegex(ValueError, "Core"):
            self.profile("terumo").change(self.catalog, "tool", "node", False)
        catalog = copy.deepcopy(self.catalog)
        catalog.tools["pi"]["requires"] = ["bun"]
        selection = Selection(tools={"pi"}, exclude={"bun"})
        self.assertIn("bun", selection.resolve(catalog))
        catalog.tools["bun"]["requires"] = ["pi"]
        with self.assertRaisesRegex(ValueError, "cycle"):
            selection.resolve(catalog)

    def test_new_group_member_requires_configuration_before_it_is_linked(self):
        selection = self.profile("gbl")
        save_selection(self.directory, self.catalog, selection, {})
        catalog = copy.deepcopy(self.catalog)
        catalog.tools["new-mcp"] = dict(catalog.tools["jcodemunch"], label="New MCP")
        self.assertIn("new-mcp", selection.resolve(catalog))
        self.assertFalse((self.directory / "conf.d/10-dotfiles-new-mcp.toml").exists())

    def test_selection_fragments_and_local_overrides(self):
        self.directory.mkdir(parents=True)
        config = self.directory / "config.toml"
        config.write_text('# local override\n[tools]\nnode = "22"\n')
        unmanaged = self.directory / "conf.d/custom.toml"
        unmanaged.parent.mkdir()
        unmanaged.write_text('[tools]\nrust = "stable"\n')
        save_selection(self.directory, self.catalog, self.profile("gbl"), {})
        for name in self.profile("gbl").resolve(self.catalog):
            fragment = unmanaged.parent / f"10-dotfiles-{name}.toml"
            self.assertFalse(fragment.is_symlink())
            self.assertEqual(fragment.read_text(), fragment_text(str(self.catalog.tools[name]["path"])))
        self.assertFalse((unmanaged.parent / "10-dotfiles-yt-dlp.toml").exists())
        selection, previous = load_state(self.directory, self.catalog)
        save_selection(self.directory, self.catalog, selection, previous)
        self.assertEqual(config.read_text(), '# local override\n[tools]\nnode = "22"\n')
        self.assertEqual(unmanaged.read_text(), '[tools]\nrust = "stable"\n')

    def test_switching_profiles_only_removes_managed_fragments(self):
        save_selection(self.directory, self.catalog, self.profile("gbl"), {})
        _, previous = load_state(self.directory, self.catalog)
        install = self.home / "data/installs/yt-dlp/latest/yt-dlp"
        install.parent.mkdir(parents=True)
        install.write_text("existing installation")
        save_selection(self.directory, self.catalog, self.profile("terumo"), previous)
        self.assertFalse((self.directory / "conf.d/10-dotfiles-temporal.toml").exists())
        self.assertTrue((self.directory / "conf.d/10-dotfiles-markitdown.toml").exists())
        self.assertEqual(install.read_text(), "existing installation")

    def legacy_fixture(self):
        root = self.home / "dotfiles"
        shutil.copytree(ROOT / "mise", root / "mise")
        catalog = Catalog(root)
        tools = "".join(tool["path"].read_text().split("[_]")[0].removeprefix("[tools]\n")
                        for tool in catalog.tools.values())
        legacy = root / "mise/config.toml"
        legacy.write_text("[tools]\n" + tools + (root / "mise/settings.toml").read_text())
        self.directory.mkdir(parents=True)
        (self.directory / "config.toml").symlink_to(legacy)
        return catalog, legacy

    def test_legacy_migration_preserves_backup_and_detaches_shared_config(self):
        catalog, legacy = self.legacy_fixture()
        before = legacy.read_text()
        backup = self.directory / "config.toml.before-dotfiles-selection"
        backup.write_text("older backup")
        selection, previous = load_state(self.directory, catalog)
        self.assertEqual(selection.resolve(catalog), set(catalog.tools))
        save_selection(self.directory, catalog, selection, previous)
        self.assertFalse((self.directory / "config.toml").is_symlink())
        self.assertEqual(backup.read_text(), "older backup")
        self.assertEqual(backup.with_name(backup.name + ".1").read_text(), before)
        self.assertEqual(legacy.read_text(), before)

    def test_legacy_custom_changes_are_not_overwritten(self):
        catalog, legacy = self.legacy_fixture()
        legacy.write_text(legacy.read_text() + '\n[env]\nCUSTOM = "keep"\n')
        with self.assertRaisesRegex(ValueError, "custom changes"):
            save_selection(self.directory, catalog, Selection(), {})
        self.assertTrue((self.directory / "config.toml").is_symlink())
        self.assertFalse((self.directory / "conf.d").exists())

    def test_dangling_legacy_link_is_preserved_and_replaced(self):
        catalog, legacy = self.legacy_fixture()
        legacy.unlink()
        selection = Selection(profiles={"terumo"})
        save_selection(self.directory, catalog, selection, {})
        config = self.directory / "config.toml"
        self.assertTrue(config.is_file())
        self.assertFalse(config.is_symlink())
        backup = self.directory / "config.toml.before-dotfiles-selection"
        self.assertTrue(backup.is_symlink())
        self.assertEqual(backup.readlink(), legacy)
        restored, _ = load_state(self.directory, catalog)
        self.assertEqual(restored.resolve(catalog), selection.resolve(catalog))

    def test_missing_legacy_tools_cannot_be_imported_silently(self):
        self.directory.mkdir(parents=True)
        config = self.directory / "config.toml"
        config.symlink_to(ROOT / "mise/config.toml")
        result = self.run_cli("--keep-current")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("cannot be imported", result.stderr)
        self.assertTrue(config.is_symlink())
        self.assertFalse((self.directory / STATE).exists())
        result = self.run_cli("--profile", "terumo")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(config.is_symlink())
        selection, _ = load_state(self.directory, self.catalog)
        self.assertEqual(selection.profiles, {"terumo"})

    def test_collision_preflight_makes_no_changes(self):
        path = self.directory / "conf.d/10-dotfiles-pi.toml"
        path.parent.mkdir(parents=True)
        path.write_text("user-owned file")
        with self.assertRaisesRegex(ValueError, "unmanaged"):
            save_selection(self.directory, self.catalog, self.profile("terumo"), {})
        self.assertEqual(path.read_text(), "user-owned file")
        self.assertFalse((path.parent / "00-dotfiles-settings.toml").exists())
        self.assertFalse((self.directory / STATE).exists())

    def test_modified_managed_fragment_is_not_removed(self):
        save_selection(self.directory, self.catalog, self.profile("gbl"), {})
        _, previous = load_state(self.directory, self.catalog)
        path = self.directory / "conf.d/10-dotfiles-temporal.toml"
        path.unlink()
        path.write_text("user edits")
        with self.assertRaisesRegex(ValueError, "modified"):
            save_selection(self.directory, self.catalog, self.profile("terumo"), previous)
        self.assertEqual(path.read_text(), "user edits")

    def test_cli_additions_exclusions_and_saved_defaults(self):
        result = self.run_cli("--profile", "terumo", "--with", "jmunch", "--with", "claude-code", "--without", "pi")
        self.assertEqual(result.returncode, 0, result.stderr)
        selection, _ = load_state(self.directory, self.catalog)
        self.assertNotIn("pi", selection.resolve(self.catalog))
        self.assertIn("jcodemunch", selection.resolve(self.catalog))
        result = self.run_cli("--with", "yt-dlp")
        self.assertEqual(result.returncode, 0, result.stderr)
        selection, _ = load_state(self.directory, self.catalog)
        self.assertIn("yt-dlp", selection.resolve(self.catalog))
        self.assertIn("claude-code", selection.resolve(self.catalog))

    def test_bad_input_and_noninteractive_default_do_not_write(self):
        for arguments in [("--profile", "typo"), ("--profile", "gbl", "--with", "typo"), ()]:
            with self.subTest(arguments=arguments):
                result = self.run_cli(*arguments)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.directory.exists())

    def test_setup_dry_run_does_not_install_or_write(self):
        result = self.run_cli("--profile", "gbl", "--dry-run", script="setup.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("Installing", result.stdout)
        self.assertFalse(self.directory.exists())

    def test_global_config_override_is_rejected(self):
        result = self.run_cli("--profile", "gbl", MISE_GLOBAL_CONFIG_FILE=str(self.home / "override.toml"))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("disables conf.d", result.stderr)
        self.assertFalse(self.directory.exists())

    def test_mise_config_directory_overrides_xdg(self):
        alternate = self.home / "alternate mise directory"
        result = self.run_cli("--profile", "core", MISE_CONFIG_DIR=str(alternate))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((alternate / STATE).exists())
        self.assertFalse(self.directory.exists())

    def test_install_runs_from_home_and_propagates_failure(self):
        mise = self.home / "bin/mise"
        mise.parent.mkdir()
        mise.write_text('#!/bin/sh\nprintf "%s\\n" "$@" > "$HOME/install-args"\nexit 19\n')
        mise.chmod(0o755)
        result = self.run_cli("--profile", "core", "--install", PATH=f"{mise.parent}:{os.environ['PATH']}")
        self.assertEqual(result.returncode, 19, result.stderr)
        self.assertEqual((self.home / "install-args").read_text(), f"-C\n{self.home}\ninstall\n")
        self.assertTrue((self.directory / STATE).exists())

    def test_ambiguous_names_have_explicit_prefixes(self):
        self.assertEqual(self.catalog.reference("markitdown"), ("group", "markitdown"))
        self.assertEqual(self.catalog.reference("tool:markitdown"), ("tool", "markitdown"))

    def run_terminal(self, keys, *arguments):
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 32, 100, 0, 0))
        env = {key: value for key, value in os.environ.items() if not key.startswith("MISE_")}
        env.update(HOME=str(self.home), XDG_CONFIG_HOME=str(self.home / "custom config"), TERM="xterm-256color")
        process = subprocess.Popen([sys.executable, str(ROOT / "script/mise_config.py"), *arguments],
                                   env=env, cwd=self.home, stdin=slave, stdout=slave, stderr=slave)
        os.close(slave)
        output, sent = b"", False
        deadline = time.monotonic() + 10
        try:
            while time.monotonic() < deadline:
                ready, _, _ = select.select([master], [], [], 0.2)
                if not ready:
                    if process.poll() is not None:
                        break
                    continue
                try:
                    chunk = os.read(master, 65536)
                except OSError as error:
                    if error.errno == errno.EIO:
                        break
                    raise
                if not chunk:
                    break
                output += chunk
                if not sent and b"Mise tools:" in output:
                    os.write(master, keys)
                    sent = True
            self.assertTrue(sent, output.decode(errors="replace"))
            return process.wait(timeout=2), output.decode(errors="replace")
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            os.close(master)

    def test_terminal_selects_profile(self):
        status, output = self.run_terminal(b" s")
        self.assertEqual(status, 0, output)
        selection, _ = load_state(self.directory, self.catalog)
        self.assertEqual(selection.profiles, {"terumo"})
        self.assertEqual(selection.resolve(self.catalog), self.profile("terumo").resolve(self.catalog))

    def test_terminal_filter_selects_individual_tool(self):
        status, output = self.run_terminal(b"/tool pi\n s")
        self.assertEqual(status, 0, output)
        selection, _ = load_state(self.directory, self.catalog)
        self.assertEqual(selection.resolve(self.catalog), self.catalog.core | {"pi"})

    def test_terminal_cancel_does_not_save(self):
        status, output = self.run_terminal(b"q", "--profile", "gbl", "--edit")
        self.assertEqual(status, 130, output)
        self.assertFalse(self.directory.exists())

    def test_terminal_can_remove_one_tool_from_profile(self):
        status, output = self.run_terminal(b"/tool pi\n s", "--profile", "terumo", "--edit")
        self.assertEqual(status, 0, output)
        selection, _ = load_state(self.directory, self.catalog)
        self.assertEqual(selection.profiles, {"terumo"})
        self.assertEqual(selection.resolve(self.catalog), self.profile("terumo").resolve(self.catalog) - {"pi"})

    def test_terminal_core_profile_resets_optional_tools(self):
        status, output = self.run_terminal(b"jj s", "--profile", "gbl", "--edit")
        self.assertEqual(status, 0, output)
        selection, _ = load_state(self.directory, self.catalog)
        self.assertEqual(selection.resolve(self.catalog), self.catalog.core)

    @unittest.skipUnless(shutil.which("mise"), "mise is not installed")
    def test_real_mise_loads_only_selected_fragments_and_local_override(self):
        save_selection(self.directory, self.catalog, self.profile("terumo"), {})
        (self.directory / "config.toml").write_text('[tools]\nnode = "22"\n')
        env = {key: value for key, value in os.environ.items() if not key.startswith("MISE_")}
        env.update(HOME=str(self.home), MISE_CONFIG_DIR=str(self.directory),
                   MISE_SYSTEM_CONFIG_DIR=str(self.home / "system"), MISE_OFFLINE="1",
                   MISE_CACHE_DIR=str(self.home / "cache"), MISE_DATA_DIR=str(self.home / "data"))
        result = subprocess.run([shutil.which("mise"), "-C", str(self.home), "config", "ls", "--json"],
                                env=env, text=True, capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        configs = json.loads(result.stdout)
        self.assertIn("10-dotfiles-pi.toml", result.stdout)
        self.assertNotIn("10-dotfiles-yt-dlp.toml", result.stdout)
        self.assertNotIn("10-dotfiles-claude-code.toml", result.stdout)
        self.assertEqual({tool for config in configs for tool in config["tools"]},
                         {self.catalog.tools[name]["key"]
                          for name in self.profile("terumo").resolve(self.catalog)})
        result = subprocess.run([shutil.which("mise"), "-C", str(self.home), "ls", "--current", "--json"],
                                env=env, text=True, capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        tools = json.loads(result.stdout)
        self.assertEqual(tools["node"][0]["requested_version"], "22")

    @unittest.skipUnless(shutil.which("mise"), "mise is not installed")
    def test_real_global_tool_write_is_local_and_preserved(self):
        root = self.home / "dotfiles"
        shutil.copytree(ROOT / "mise", root / "mise")
        catalog = Catalog(root)
        selection = Selection(profiles={"core"})
        save_selection(self.directory, catalog, selection, {})
        _, previous = load_state(self.directory, catalog)
        source = catalog.tools["node"]["path"]
        original = source.read_text()
        # Pretend an exact version is installed, so mise use cannot download anything.
        executable = self.home / "data/installs/node/22.0.0/bin/node"
        executable.parent.mkdir(parents=True)
        executable.write_text("#!/bin/sh\nexit 0\n")
        executable.chmod(0o755)
        env = {key: value for key, value in os.environ.items() if not key.startswith("MISE_")}
        env.update(HOME=str(self.home), MISE_CONFIG_DIR=str(self.directory),
                   MISE_SYSTEM_CONFIG_DIR=str(self.home / "system"), MISE_OFFLINE="1",
                   MISE_CACHE_DIR=str(self.home / "cache"), MISE_DATA_DIR=str(self.home / "data"))
        result = subprocess.run([shutil.which("mise"), "-C", str(self.home), "use", "-g", "node@22.0.0"],
                                env=env, text=True, capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(source.read_text(), original)
        fragment = self.directory / "conf.d/10-dotfiles-node.toml"
        self.assertIn('node = "22.0.0"', fragment.read_text())
        with self.assertRaisesRegex(ValueError, "modified"):
            save_selection(self.directory, catalog, selection, previous)
        self.assertIn('node = "22.0.0"', fragment.read_text())


if __name__ == "__main__":
    unittest.main()
