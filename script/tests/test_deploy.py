import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(shutil.which("chezmoi"), "chezmoi is not installed")
class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="dotfiles-deploy-")
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name).resolve()
        self.home = self.directory / "home with spaces"
        self.home.mkdir()
        self.env = {key: value for key, value in os.environ.items()
                    if not key.startswith(("XDG_", "MISE_", "GIT_"))
                    and key not in ("ZDOTDIR", "PI_CODING_AGENT_DIR", "DOTFILES_DIR")}
        self.env.update(HOME=str(self.home), GIT_CONFIG_NOSYSTEM="1",
                        PATH=os.pathsep.join(dict.fromkeys([
                            str(Path(shutil.which("chezmoi")).parent),
                            str(Path(sys.executable).parent), "/usr/bin", "/bin",
                        ])))

    def run_cli(self, command="apply", *arguments, root=ROOT, success=True):
        result = subprocess.run([sys.executable, str(root / "script/deploy.py"),
                                 command, *arguments],
                                env=self.env, cwd=self.directory, text=True, capture_output=True)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def git(self, *arguments):
        result = subprocess.run(["git", *arguments], env=self.env, cwd=self.home,
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def relocated(self):
        root = self.directory / "checkout with 'quotes' and $variables"
        for name in ("chezmoi", "script", "git", "zsh", "agents", "starship",
                     "tmux", "alacritty", "cursor"):
            shutil.copytree(ROOT / name, root / name,
                            ignore=shutil.ignore_patterns("__pycache__", "work.zsh", "local.zsh"))
        return root

    def test_preview_is_read_only_and_defaults_are_headless(self):
        self.run_cli("diff")
        self.run_cli("status")
        self.assertEqual(list(self.home.iterdir()), [])
        self.run_cli()
        self.assertTrue((self.home / ".config/starship.toml").is_file())
        self.assertFalse((self.home / ".config/alacritty").exists())
        self.assertFalse((self.home / ".pi").exists())
        self.assertFalse((self.home / ".fonts").exists())
        self.assertFalse((self.home / ".tmux.conf").exists())
        before = (self.home / ".zshrc").stat().st_mtime_ns
        self.run_cli()
        self.assertEqual((self.home / ".zshrc").stat().st_mtime_ns, before)
        self.assertEqual(self.run_cli("diff").stdout.strip(), "Capabilities: git, prompt, shell")

    def test_capabilities_honor_custom_directories_and_leave_personal_settings(self):
        config = self.directory / "custom config"
        pi = self.directory / "custom pi"
        zsh = self.directory / "custom zsh"
        self.env.update(XDG_CONFIG_HOME=str(config), XDG_STATE_HOME=str(self.directory / "state"),
                        PI_CODING_AGENT_DIR=str(pi), ZDOTDIR=str(zsh))
        pi.mkdir()
        (pi / "settings.json").write_text('{"theme":"local"}\n')
        (config / "opencode").mkdir(parents=True)
        (config / "opencode/opencode.jsonc").write_text("// local\n{}\n")
        self.run_cli("apply", "--with", "agents", "--with", "tmux", "--with", "terminal")
        self.assertTrue((config / "alacritty/alacritty.toml").is_file())
        self.assertTrue((zsh / ".zshrc").is_file())
        self.assertTrue((self.home / ".zshenv").is_file())
        self.assertFalse((self.home / ".config").exists())
        self.assertFalse((self.home / ".zshrc").exists())
        self.assertEqual((pi / "settings.json").read_text(), '{"theme":"local"}\n')
        self.assertEqual((config / "opencode/opencode.jsonc").read_text(), "// local\n{}\n")
        for path in (pi / "extensions", config / "opencode/plugins"):
            self.assertTrue((path / "command-environment.js").is_file())
            self.assertTrue((path / "command-environment.mjs").is_file())
            self.assertFalse((path / "command-environment.js").is_symlink())
        self.assertTrue(os.access(self.home / ".local/bin/tmux-pane-bg", os.X_OK))
        self.run_cli()
        self.assertTrue((config / "alacritty/alacritty.toml").is_file())

    def test_conflicts_are_preflighted_and_adoption_preserves_numbered_backups(self):
        rc = self.home / ".zshrc"
        rc.write_text("personal shell\n")
        (self.home / ".zshrc.before-dotfiles").write_text("older backup\n")
        self.run_cli("diff")
        result = self.run_cli(success=False)
        self.assertIn("Unmanaged", result.stderr)
        self.assertFalse((self.home / ".zshenv").exists())
        self.run_cli("apply", "--adopt")
        self.assertEqual((self.home / ".zshrc.before-dotfiles").read_text(), "older backup\n")
        self.assertEqual((self.home / ".zshrc.before-dotfiles.1").read_text(), "personal shell\n")
        rc.write_text("new personal edits\n")
        self.run_cli(success=False)
        self.assertEqual(rc.read_text(), "new personal edits\n")

    def test_legacy_links_migrate_without_writing_through_to_source(self):
        for target, source in ((".zshrc", "zsh/zshrc"), (".zshenv", "zsh/zshenv"),
                               (".gitconfig", "git/gitconfig")):
            (self.home / target).symlink_to(ROOT / source)
        source = (ROOT / "git/gitconfig").read_bytes()
        (self.home / ".gitconfig.local").write_text("[user]\nemail = local@example.invalid\n")
        self.run_cli()
        self.assertFalse((self.home / ".gitconfig").is_symlink())
        self.assertTrue((self.home / ".gitconfig.before-dotfiles").is_symlink())
        self.git("config", "--global", "init.defaultBranch", "main")
        self.assertEqual((ROOT / "git/gitconfig").read_bytes(), source)
        self.assertEqual(self.git("config", "--get", "user.email"), "local@example.invalid")

    def test_existing_git_config_and_relative_includes_keep_precedence(self):
        before = '[user]\nemail = existing@example.invalid\n[include]\npath = identity.local\n'
        (self.home / ".gitconfig").write_text(before)
        (self.home / "identity.local").write_text("[user]\nname = Local Name\n")
        self.run_cli()
        self.assertTrue((self.home / ".gitconfig").read_text().endswith(before))
        self.assertEqual(self.git("config", "--get", "user.email"), "existing@example.invalid")
        self.assertEqual(self.git("config", "--get", "user.name"), "Local Name")
        self.assertEqual((self.home / ".gitconfig.before-dotfiles").read_text(), before)

    @unittest.skipUnless(shutil.which("zsh"), "zsh is not installed")
    def test_relocated_checkout_custom_zdotdir_and_final_local_override(self):
        root = self.relocated()
        config = self.directory / "config"
        zsh = self.directory / "zsh"
        local = config / "dotfiles"
        local.mkdir(parents=True)
        (local / "local.zsh").write_text("export EDITOR=local-editor\nalias gs='local-status'\n")
        self.env.update(XDG_CONFIG_HOME=str(config), ZDOTDIR=str(zsh),
                        MISE_DATA_DIR=str(self.directory / "mise data"))
        self.run_cli(root=root)
        # Plugins register completions before compinit; they must be replayed afterwards.
        (zsh / ".zsh_plugins.zsh").write_text("compdef _git 'fake git'\n")
        env = dict(self.env)
        env.pop("ZDOTDIR")  # ~/.zshenv must select the custom startup directory.
        result = subprocess.run([shutil.which("zsh"), "-d", "-ic",
                                 'print -rl -- "$DOTFILES_DIR" "$EDITOR" "$aliases[gs]" "$path[2]" '
                                 '"$_comps[fake git]"'],
                                env=env, cwd=self.directory, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        self.assertEqual(result.stdout.splitlines(),
                         [str(root), "local-editor", "local-status",
                          str(self.directory / "mise data/shims"), "_git"])

    @unittest.skipUnless(shutil.which("zsh"), "zsh is not installed")
    def test_insecure_completion_directory_warns_without_aborting_compinit(self):
        self.run_cli()
        plugin = self.directory / "insecure plugin"
        plugin.mkdir()
        plugin.chmod(0o777)
        (plugin / "_insecurefake").write_text("#compdef insecurefake\n")
        (self.home / ".zsh_plugins.zsh").write_text(
            f"fpath+=({shlex.quote(str(plugin))})\ncompdef _git 'fake git'\n")
        result = subprocess.run([shutil.which("zsh"), "-d", "-ic",
                                 'print -rl -- "$_comps[fake git]" "${_comps[insecurefake]-none}"'],
                                env=self.env, cwd=self.directory, text=True, capture_output=True,
                                stdin=subprocess.DEVNULL)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ["_git", "none"])
        self.assertIn("insecure completion directories", result.stderr)
        self.assertIn(str(plugin), result.stderr)

    def test_shared_changes_update_owned_files_but_deselection_does_not_remove_them(self):
        root = self.relocated()
        self.run_cli(root=root)
        (root / "starship/starship.toml").write_text("scan_timeout = 100\n")
        self.run_cli(root=root)
        self.assertEqual((self.home / ".config/starship.toml").read_text().strip(),
                         "scan_timeout = 100")
        self.run_cli("apply", "--without", "prompt", root=root)
        self.assertTrue((self.home / ".config/starship.toml").exists())
        state = json.loads((self.home / ".local/state/dotfiles/deployment.json").read_text())
        self.assertNotIn("prompt", state["capabilities"])

    def test_directory_conflict_never_gets_replaced_even_with_adopt(self):
        rc = self.home / ".zshrc"
        rc.mkdir()
        (rc / "local").write_text("keep")
        self.run_cli("apply", "--adopt", success=False)
        self.assertEqual((rc / "local").read_text(), "keep")
        self.assertFalse((self.home / ".zshenv").exists())

    def test_foreign_git_link_is_refused_before_any_write(self):
        source = self.directory / "foreign-gitconfig"
        source.write_text("[user]\nname = Local\n")
        (self.home / ".gitconfig").symlink_to(source)
        result = self.run_cli("apply", "--adopt", success=False)
        self.assertIn("Unmanaged Git config symlink", result.stderr)
        self.assertEqual(list(self.home.iterdir()), [self.home / ".gitconfig"])

    def test_relative_paths_and_malformed_state_fail_explicitly(self):
        self.env["XDG_CONFIG_HOME"] = "relative-config"
        result = self.run_cli(success=False)
        self.assertIn("Directory must be absolute", result.stderr)
        self.assertEqual(list(self.home.iterdir()), [])
        self.env.pop("XDG_CONFIG_HOME")
        state = self.home / ".local/state/dotfiles/deployment.json"
        state.parent.mkdir(parents=True)
        for data in ([], {"version": 1, "capabilities": 42}, {"version": 1, "targets": []}):
            with self.subTest(data=data):
                state.write_text(json.dumps(data))
                result = self.run_cli(success=False)
                self.assertIn("deployment state", result.stderr)
                self.assertNotIn("Traceback", result.stderr)

    def test_legacy_cursor_directory_link_is_detached_before_writing(self):
        cursor = self.home / ".cursor"
        cursor.mkdir()
        (cursor / "rules").symlink_to(ROOT / "cursor/rules")
        source = (ROOT / "cursor/rules/shell-commands.mdc").read_bytes()
        self.run_cli("apply", "--with", "cursor")
        self.assertFalse((cursor / "rules").is_symlink())
        self.assertTrue((cursor / "rules.before-dotfiles").is_symlink())
        self.assertEqual((ROOT / "cursor/rules/shell-commands.mdc").read_bytes(), source)
        self.assertFalse((ROOT / "cursor/rules/shell-commands.mdc.before-dotfiles").exists())


class ProvisionTests(unittest.TestCase):
    def test_package_commands_are_platform_specific_without_partial_upgrades(self):
        for manager in ("apt", "dnf", "yum", "pacman", "brew"):
            with self.subTest(manager=manager):
                result = subprocess.run(["/bin/bash", "-euc", '''
                    source "$1/script/lib/packages.sh"
                    detect_package_manager() { printf '%s\\n' "$MANAGER"; }
                    id() { printf '0\\n'; }
                    apt-get() { printf 'APT %s\\n' "$*"; }
                    dnf() { printf 'DNF %s\\n' "$*"; }
                    yum() { printf 'YUM %s\\n' "$*"; }
                    pacman() { printf 'PACMAN %s\\n' "$*"; }
                    brew() { printf 'BREW %s\\n' "$*"; }
                    BASE_PACKAGES+=(alacritty)
                    install_baseline_packages
                ''', "--", str(ROOT)], env=dict(os.environ, MANAGER=manager),
                                        text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                if manager == "pacman":
                    self.assertIn("PACMAN -S --needed", result.stdout)
                    self.assertNotIn("-Sy", result.stdout)
                elif manager == "brew":
                    self.assertIn("BREW install --cask alacritty", result.stdout)
                    line = next(line for line in result.stdout.splitlines()
                                if line.startswith("BREW install zsh"))
                    self.assertNotIn("alacritty", line)
                    self.assertIn("python", line)
                else:
                    self.assertIn(f"{manager.upper()} " if manager != "apt" else "APT ",
                                  result.stdout)

    def test_provision_is_preview_only_by_default(self):
        result = subprocess.run(["/bin/bash", str(ROOT / "script/provision.sh"),
                                 "--terminal", "--plugins", "--login-shell"],
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("alacritty", result.stdout)
        self.assertIn("shellcheck", result.stdout)
        self.assertIn("Plugin downloads: true", result.stdout)
        self.assertIn("Change login shell: true", result.stdout)
        self.assertNotIn("Installing", result.stdout)
        result = subprocess.run(["/bin/bash", str(ROOT / "script/provision.sh"), "--no-terminal"],
                                text=True, capture_output=True)
        self.assertNotIn("alacritty", result.stdout)

    def test_alacritty_defaults_to_local_desktops_only(self):
        cases = {
            "macos": ("Darwin", "", {"SSH_CONNECTION": "1 2 3 4"}, True),
            "wayland": ("Linux", "", {"WAYLAND_DISPLAY": "wayland-0"}, True),
            "x11 session": ("Linux", "", {"XDG_SESSION_TYPE": "x11"}, True),
            "headless": ("Linux", "", {}, False),
            "ssh with forwarded X": ("Linux", "", {"DISPLAY": "localhost:10", "SSH_TTY": "/dev/pts/1"}, False),
            "wsl with WSLg": ("Linux", "is_wsl() { :; }", {"DISPLAY": ":0"}, False),
            "container": ("Linux", "is_container() { :; }", {"DISPLAY": ":0"}, False),
        }
        clean = {k: v for k, v in os.environ.items() if k not in
                 ("DISPLAY", "WAYLAND_DISPLAY", "XDG_SESSION_TYPE", "SSH_CONNECTION", "SSH_TTY",
                  "WSL_DISTRO_NAME")}
        for name, (system, override, extra, desktop) in cases.items():
            with self.subTest(name):
                result = subprocess.run(["/bin/bash", "-euc", f'''
                    source "$1/script/lib/packages.sh"
                    uname() {{ printf '%s\\n' {system}; }}
                    is_wsl() {{ return 1; }}
                    is_container() {{ return 1; }}
                    {override}
                    has_local_desktop
                ''', "--", str(ROOT)], env={**clean, **extra}, text=True, capture_output=True)
                self.assertEqual(result.returncode == 0, desktop, result.stderr)

    def test_shellcheck_uses_distribution_package_names(self):
        result = subprocess.run(["/bin/bash", "-euc", '''
            source "$1/script/lib/packages.sh"
            for pm in apt dnf yum pacman brew; do map_pkg "$pm" shellcheck; done
        ''', "--", str(ROOT)], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.split(),
                         ["shellcheck", "ShellCheck", "ShellCheck", "shellcheck", "shellcheck"])

    def test_macos_prefers_brew_even_if_another_manager_is_on_path(self):
        result = subprocess.run(["/bin/bash", "-euc", '''
            source "$1/script/lib/packages.sh"
            uname() { printf 'Darwin\\n'; }
            brew() { :; }
            apt-get() { :; }
            detect_package_manager
            map_pkg brew python3
        ''', "--", str(ROOT)], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "brew\npython\n")

    def test_arch_install_does_not_refresh_database_or_require_sudo_as_root(self):
        result = subprocess.run(["/bin/bash", "-euc", '''
            source "$1/script/lib/packages.sh"
            BASE_PACKAGES=(zsh)
            detect_package_manager() { printf 'pacman\\n'; }
            id() { printf '0\\n'; }
            sudo() { return 97; }
            pacman() { printf 'PACMAN %s\\n' "$*"; }
            install_baseline_packages
        ''', "--", str(ROOT)], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("PACMAN -S --needed --noconfirm zsh\n", result.stdout)
        self.assertNotIn("-Sy", result.stdout)

    def test_homebrew_separates_terminal_cask_from_formulae(self):
        result = subprocess.run(["/bin/bash", "-euc", '''
            source "$1/script/lib/packages.sh"
            BASE_PACKAGES=(python3 alacritty)
            detect_package_manager() { printf 'brew\\n'; }
            brew() { printf 'BREW %s\\n' "$*"; }
            install_baseline_packages
        ''', "--", str(ROOT)], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("BREW install --cask alacritty\n", result.stdout)
        self.assertIn("BREW install python\n", result.stdout)


if __name__ == "__main__":
    unittest.main()
