# Configuration reference

Run commands from the checkout root. Examples using `~/dotfiles` also work from
another checkout location after adjusting that path.

## Deploy configuration

Configuration deployment, system provisioning, and developer-tool installation
are separate operations. Linux desktops, headless Linux hosts, WSL, macOS, and
containers use the same source. Native Windows is not supported.

Clone this repository anywhere and run these commands from its root.
Deployment needs Python 3.11 or newer, Git, and chezmoi. Install those with your
OS package manager, or use an existing mise installation to install the pinned
chezmoi version:

```sh
mise install chezmoi@2.73.3
mise exec chezmoi@2.73.3 -- python3 script/deploy.py diff
```

With chezmoi on `PATH`:

```sh
python3 script/deploy.py diff
python3 script/deploy.py apply
# Optional desktop and agent configuration:
python3 script/deploy.py diff --with terminal --with tmux --with agents
python3 script/deploy.py apply --with terminal --with tmux --with agents
```

Defaults deploy the shell, Git, and prompt configuration only. Additional
capabilities are `tmux`, `terminal`, `agents`, and `cursor`. Repeat `--with` or
`--without` to change them. Selections persist after a successful apply.
Deselection stops managing that capability; it does not delete installed files,
remove plugins, or uninstall tools. Remove unwanted integrations explicitly.
WSL users should install fonts and terminal applications on whichever OS hosts
their terminal, usually Windows.

`diff` and `status` do not write to destination directories or persistent state.
`apply` preflights every managed file before writing. Unknown files and edited
managed files stop deployment. Review `diff`, then use `apply --adopt` only if you
want to back those files up and replace them. Directories are never replaced
with files. Old directory links into this checkout, such as Cursor's rules
directory, are backed up and detached before writing below them. Other
symlinked parent directories require manual review. Backups use `.before-dotfiles`, with numbered
suffixes when needed. No deployment command installs packages, downloads plugins,
changes the login shell, or modifies credentials.

The wrapper renders the small chezmoi source trees under `chezmoi/` into their
application-specific destinations. Application configuration remains in its
existing directory, with no duplicate copies to edit. Use `script/deploy.py`
rather than bare `chezmoi apply`, since the wrapper supplies machine paths,
capabilities, and conflict checks. Deployed files are regular files.
Rerun deployment after updating source. The shell's generated entry points
reference this checkout, so retain it and rerun deployment after moving it.
Agent settings configured by the separate VS Code and Claude Code commands
also need reconfiguration after a move.

Paths honor `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `ZDOTDIR`, and
`PI_CODING_AGENT_DIR`. Values must be absolute. Deployment records and chezmoi
databases live in `${XDG_STATE_HOME:-~/.local/state}/dotfiles`.
Shell startup honors `MISE_DATA_DIR`, `MISE_SHIMS_DIR`, and `XDG_DATA_HOME`.

### Migrate an existing installation

Preview first. Symlinks pointing into this checkout are backed up and replaced
with regular deployed files. Old directory links into this checkout, such as
Cursor's rules directory, are copied locally before their managed children are
updated. The original directory link is backed up. Other configurations require
explicit adoption.
The global Git file is preserved as a writable local file, with an include of
the deployed shared configuration. Existing local identity and relative includes
retain precedence. `git config --global` no longer writes into the repository.
Existing `~/.gitconfig.local` files are left untouched.
Foreign Git config symlinks must be detached to local files before migration;
`--adopt` does not replace them.

Old `.backup` files remain untouched. If an earlier failed setup lost your Git
identity, review those backups and restore the correct identity into
`~/.gitconfig.local` yourself; migration does not guess among old backups.
The old font-directory link is also left untouched. Fonts remain in the
repository for existing users but are no longer installed automatically.
Install only the font families needed by your terminal on each machine.

`script/setup.sh` now forwards to configuration deployment. Its old tool-profile
arguments have moved to `script/configure-mise.sh`.

### Optional system provisioning

Provisioning previews by default:

```sh
bash script/provision.sh
bash script/provision.sh --terminal --plugins --login-shell
# Explicitly authorize the previewed changes:
bash script/provision.sh --apply --terminal --plugins --login-shell
```

The baseline contains shell utilities, Git, curl, Python, fzf, tmux, ripgrep,
less, and Perl support for Git's pager.
`--terminal` adds Alacritty. `--plugins` downloads Antidote and TPM and prepares
the Zsh plugin cache. `--login-shell` explicitly requests an account shell change.
System packages require root or sudo on Linux. On macOS, install Homebrew first;
GUI applications use casks. Containers can deploy configuration without sudo or
changing accounts. Arch provisioning uses the existing package database without
silently refreshing it; perform full system upgrades separately.

Install mise through its documented OS-specific installation procedure, then
select developer tools separately as described below. Provisioning does not
guarantee Python 3.11 on old distributions; upgrade Python explicitly if needed.
Chezmoi is not assumed to be available from every distribution's repositories.
Install the pinned mise tool before deploying configuration.

## GitHub setup

The tracked Git config defaults to my personal GitHub identity and assumes a
single SSH key on `github.com`.

Machines that use multiple GitHub SSH keys should add machine-local overrides:

1. Copy `examples/git/gitconfig.local.example` to `~/.gitconfig.local`.
2. Copy `examples/git/gitconfig.work.example` to `~/.gitconfig.work` and set your
   work identity. Enable the matching `includeIf` block in `~/.gitconfig.local`
   and adjust its directory pattern to match your work checkouts.
3. Add the `github-work` host from `examples/ssh/config.github-work.example`
   to `~/.ssh/config` and set its key path. Enable the URL rewrites you need in
   `~/.gitconfig.work`.

Machines with one SSH key can use the default configuration.

Shared Git colors use `auto`, and pushing defaults to `simple` rather than
all matching branches. Branch-specific defaults no longer assume `master`.
Credential helpers are machine-local; configure the OS credential manager in
`~/.gitconfig` rather than sharing a plaintext credential-store policy.

## Shells and tools

The tool selector requires Python 3.11
or newer with the standard-library `tomllib` module. The TUI also uses Python's
`curses` module. No extra Python packages are needed.

```sh
bash script/configure-mise.sh --install
```

Use Space to check profiles, groups, or individual tools. Groups show `[-]` when
partially selected. Use `/` to filter, arrows or `j`/`k` to move, and Enter or
`s` to save. Press `q` or Escape to cancel without saving or installing.
Choosing **Core only** clears the optional selections.

Core tools are always selected: chezmoi, Node LTS, Python, uv, Starship, and
`diff-so-fancy`. The other tools are optional:

| Profile | Coding agents | Other groups and tools |
| --- | --- | --- |
| `terumo` | OpenCode, Pi, Copilot | Development, MarkItDown, Herdr |
| `gbl` | OpenCode, Pi, Copilot, Claude Code, Codex, Gemini CLI | Development, jmunch, Herdr, Temporal |
| `core` | None | Core only |

Development contains Bun and pnpm. The `jmunch` group contains jcodemunch,
jdatamunch, and jdocmunch MCP servers. The `markitdown` group contains the CLI
and MCP server. The `workflow` group contains Herdr and Temporal. The
`coding-agents` group contains all six agents. The `personal` group contains
`yt-dlp`; neither company profile selects it. Installing a tool does not copy
or configure its license, credentials, or other personal settings.

For unattended setup, choose a profile and explicit additions:

```sh
bash script/configure-mise.sh --profile terumo --with jmunch --with claude-code --install
bash script/configure-mise.sh --profile gbl --without gemini-cli --install
bash script/configure-mise.sh --profile core --with pi --with claude-code --install
```

Repeat `--profile` to combine profiles. `--with` and `--without` accept a group
or tool ID. If both have the same name, the group wins. Use `tool:markitdown`
to select only the CLI, rather than both MarkItDown tools. Exclusions override
profiles and groups, but core tools and dependencies remain selected. Adding
a profile or group again clears exclusions for its members. `--profile` starts
a new selection; additions without it extend the machine's saved selection.
Add `--edit` to review command-line choices in the TUI.

### Change a machine's tool selection

The standalone selector changes only mise configuration. Use `--install` to
install the chosen tools as well, without rerunning the rest of setup:

```sh
bash ~/dotfiles/script/configure-mise.sh --install
bash ~/dotfiles/script/configure-mise.sh --profile gbl --with markitdown --dry-run
bash ~/dotfiles/script/configure-mise.sh --list
```

`--dry-run` never saves or installs. Unattended runs must specify selection arguments
or `--keep-current`; they never guess a profile. `--keep-current` reapplies the
saved selection, or imports recognized tools from an older global config.

Tool definitions live in `mise/tools/*.toml`. The selector creates local
`include` fragments for selected definitions in `~/.config/mise/conf.d/`, and
links `mise/settings.toml` there for shared settings.
`dotfiles-selection.json` beside that directory remembers this machine's
profiles, groups, and individual overrides. `MISE_CONFIG_DIR` and
`XDG_CONFIG_HOME` are respected. `MISE_GLOBAL_CONFIG_FILE` must be unset because
it disables config fragments.

Keep device-specific tools and version overrides in `~/.config/mise/config.toml`
or `config.local.toml`. These regular files override the selected defaults and
are not managed by the selector. Tools declared there still apply even if
unchecked in the TUI. Normal `mise use -g` tool writes stay outside dotfiles.
For an override that should survive selector changes, target the local file
explicitly with `mise use --path ~/.config/mise/config.local.toml node@22`.
If mise edits a managed fragment, the selector refuses to replace or remove it.
Move its overrides to `config.local.toml`, then remove only that generated
fragment. Rerun the selector to recreate it.
Project-specific runtime versions belong in the project's mise configuration.

The old dotfiles-owned global config symlink is migrated to a regular local
file after its contents are backed up. Custom changes stop migration for manual
review. If updating dotfiles already removed the old target, setup backs up the
link itself. Choose a profile or use the TUI; `--keep-current` cannot import
tools from that missing file.

Switching profiles removes only the selector's unchanged fragments, never
unmanaged files or installed tools. Existing installations may still be
reachable through shims; deselection is not an uninstall or an access policy.
Review and uninstall unwanted tools separately.

If catalog entries are retired, saved selections warn and discard those entries.
Obsolete generated fragments are removed only if they still match their recorded
managed content; edited fragments still stop the selector for review.
Chezmoi is pinned because deployment tests depend on its behavior. Other tools
retain their existing `latest` or `lts` policy. This is a shared configuration,
not a fully version-locked operating environment.

The two MarkItDown tools use isolated Python 3.14 environments because their
ONNX Runtime dependency does not yet provide Python 3.15 wheels. This leaves
the global Python default on `latest`.

### Add a tool or group

Add one file under `mise/tools/`; its filename is the tool ID. For example:

```toml
[tools]
example = "latest"

[_]
label = "Example CLI"
groups = ["development"]
requires = ["node"] # Omit if no catalog tools are required.
```

Mise ignores the `[_]` metadata; the selector uses it for labels, groups, and
dependencies. Files are discovered automatically. A tool can belong to several
groups. Define new groups or compose profiles in `mise/catalog.toml`.
Rerun the selector to review and apply new members of saved groups or profiles.
They are not configured or installed just because dotfiles was updated. Edits to
the versions of already selected tools take effect through their existing includes.

Run the selector regression tests with Python 3.11 or newer:

```sh
python3 -m unittest discover -s script/tests -p 'test_mise_config.py'
```

### Interactive shell

Interactive terminals use Zsh with mise activation. Noninteractive Zsh commands
use the quiet environment in `zsh/zshenv`, without loading interactive plugins.
Provisioning with `--plugins` prepares the Antidote cache. Shell startup only loads the existing
cache. After editing `zsh/zsh_plugins.txt`, rebuild it explicitly:

```sh
bash ~/dotfiles/script/prepare-zsh.sh
```

The preparation command may download missing plugins. A failed rebuild leaves
the previous cache intact. Open a new terminal to load the rebuilt cache.

The tool selector installs Git's `diff-so-fancy` pager through mise so it is
available without Antidote. Agents and editors need mise's shims on `PATH`:

```sh
export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$PATH"
```

For custom mise storage, use its configured shim directory instead.
Put early environment choices, including optional Conda initialization, in
`${XDG_CONFIG_HOME:-~/.config}/dotfiles/env.zsh`. Put final interactive overrides
in `dotfiles/local.zsh` under that configuration directory. The old checkout-local
work and local files still load for compatibility, but new local files should
live outside the checkout. The default editor is `vi` unless already set.
GNU and macOS `ls` use their own color flags. The WSL SSH bridge is enabled only
when its local executable is installed.

### Agent command environments

The `agents` deployment capability copies the adapters in `agents/` to OpenCode's global plugins directory and
Pi's user extensions directory. Both use `agents/command-environment.mjs` to put
mise shims before inherited tool installation paths and disable Git paging and
color. Color is disabled per command as well as through `color.ui`, because a
setting such as `color.branch = always` overrides `color.ui`. Existing Git
environment overrides and other PATH entries remain intact. This is process
configuration, not a sandbox.

The OpenCode V2 plugin selects `/bin/bash` for shell commands, independently of
your login shell. Pi already uses noninteractive Bash by default; its extension
normalizes the Pi process environment so built-in tools, `!` / `!!` commands,
and extension subprocesses inherit the same defaults. Extensions that supply
their own environment or remote execution backend can override them.

Interactive Zsh aliases `copilot` to `script/copilot.sh` only when mise resolves
both Copilot and Node LTS to installed executables. A leftover shim does not
enable the alias. Reloading the aliases file after an uninstall removes this
alias. The launcher checks availability again each time it runs and never
installs missing tools.

The launcher uses `agents/copilot.mjs` and the shared environment helper before
starting the npm-managed Copilot with Node LTS, independent of the project's
Node version. It supports both JavaScript symlinks and mise's aube shell wrappers,
resolving the wrapper's relative target without hard-coded install paths or versions.
It replaces its own process, preserving arguments, standard I/O,
signals, and exit status. Copilot's native Bash tool and other child processes
inherit the normalized environment unless they override it. No `BASH_ENV` or
Copilot settings changes are needed.

Outside interactive Zsh, invoke the launcher explicitly:

```sh
bash ~/dotfiles/script/copilot.sh [COPILOT_ARGUMENTS...]
```

The adapters target Unix systems, including WSL. OpenCode uses
`$XDG_CONFIG_HOME/opencode/plugins`, falling back to `~/.config/opencode/plugins`.
Pi uses `$PI_CODING_AGENT_DIR/extensions`, falling back to `~/.pi/agent/extensions`.
No model, theme, authentication, or session files are linked. A custom Pi
`shellPath` or `shellCommandPrefix` remains device-local and can change its shell
behavior. Do not source interactive Zsh configuration from those settings.

Restart OpenCode or use its reload command after installation. In Pi, use
`/reload` or restart. Restart Pi after removing the extension to clear its
process-level environment changes.

Claude Code integration is opt-in because it edits Claude Code's user settings:

```sh
node ~/dotfiles/script/configure-claude-code.mjs --dry-run
node ~/dotfiles/script/configure-claude-code.mjs
```

It sets `env.CLAUDE_CODE_SHELL` to `/bin/bash`, so the Bash tool snapshots the
stock `~/.bashrc` instead of interactive Zsh configuration, and adds a
`SessionStart` hook that runs `script/claude-code-env.sh`. The hook resolves Node
LTS through mise offline and writes the shared environment as `export` lines to
`$CLAUDE_ENV_FILE`, which Claude Code sources before every Bash command. This
applies however Claude Code starts: terminal, remote control, IDE, or desktop.
Hooks and MCP servers keep Claude Code's own environment.

The configurator uses `$CLAUDE_CONFIG_DIR/settings.json`, falling back to
`~/.claude/settings.json`; `--settings` selects another file. It keeps unrelated
settings and hooks, backs the file up as `settings.json.before-dotfiles-agents`
before changing it, and refuses a different `CLAUDE_CODE_SHELL` or a symlinked
settings file. Repeated runs make no further changes. Start a new session after
configuring; running sessions keep their shell. To remove the integration,
delete `env.CLAUDE_CODE_SHELL` and the `SessionStart` hook that runs
`claude-code-env.sh`.

Run the shared environment tests with:

```sh
node --test script/tests/*.test.mjs
```

For projects that require mise environment variables as well as tool versions,
use `mise run` tasks or `mise exec -- COMMAND` from the project directory.

### VS Code agents

VS Code integration is opt-in and requires version 1.142 or newer and installed
mise Node LTS. Configure stable VS Code first; Insiders has separate settings:

```sh
node ~/dotfiles/script/configure-vscode.mjs --dry-run
node ~/dotfiles/script/configure-vscode.mjs
# Optional, for VS Code Insiders:
node ~/dotfiles/script/configure-vscode.mjs --insiders
```

To also use mise's installed Python `latest` as VS Code's default interpreter:

```sh
node ~/dotfiles/script/configure-vscode.mjs --python --dry-run
node ~/dotfiles/script/configure-vscode.mjs --python
```

The optional `--python` flag resolves the real executable offline with
`mise which --tool python@latest python`; it does not install Python or point
the Python extension at a shim. It replaces an unset or system-Python default,
but refuses to overwrite a custom default such as `${workspaceFolder}/.venv`.
The resolved path stays in local settings, not dotfiles. Rerun if an interpreter
update changes that path.

VS Code remembers interpreter selections per workspace. Changing the default
does not replace those saved selections. In an existing workspace still using
system Python, run **Python: Select Interpreter**, choose **Enter interpreter
path**, and enter the path shown by the configurator. Keep project virtual
environments selected where needed. Local settings do not configure remote
Python extensions, containers, or Jupyter kernel selections.

The configurator preserves JSONC comments and unrelated settings, backs up the
settings file before changing it, and refuses conflicting agent settings or
symlinked settings files. Repeated runs make no further changes. Settings and
generated launchers stay machine-local; no models, credentials, themes,
permissions, saved workspace interpreter selections, or MCP definitions are
copied into dotfiles. Existing sandbox settings remain unchanged.

By default, it sets three values in the selected edition's default user settings:

- `chat.tools.terminal.terminalProfile.linux` selects `agents/bash` for Local
  chat terminal commands. Your ordinary terminals still use their usual shell.
- `terminal.integrated.agentHostProfile.linux` selects the same Bash launcher
  for local Agent Host terminals, including `!` commands.
- `chat.agentHost.copilot.runtimePath` selects a generated launcher for that
  editor's **bundled Copilot SDK runtime**, not the mise-managed Copilot CLI.
  This advanced, experimental setting normalizes the SDK process environment
  before its native tools and child processes start. It leaves the SDK's terminal
  and sandbox implementations in place. The runtime-path setting does not sync.

On macOS the two profile keys use `osx` instead of `linux`. Use `--app-root` if
the configurator cannot locate the editor's `resources/app` directory; use
`--settings` for a nonstandard default user settings path. The configurator
checks that the installed editor still exposes these settings before writing.

Agent Host currently ignores profile `args` and `env`, and its SDK's default
shell does not use that terminal profile at all. Both launch paths are needed.
The Bash launcher skips personal rc/login files while preserving VS Code's
injected shell integration. Neither launcher sets global `BASH_ENV` or changes
the VS Code application's own environment.

Restart VS Code after configuring it and create fresh agent terminals/sessions.
Choose **Local** for extension-host chat, or **Copilot** for Agent Host sessions.
Rerun configuration if a VS Code update moves the bundled runtime. Remote hosts,
containers, and cloud sessions need their own environment setup; local settings
do not configure them. Extensions and MCP servers launched outside these agent
processes also retain their own environments.

An optional live regression test runs the bundled SDK's Bash tool with native
sandboxing enabled, temporary state, and no model requests. It requires the
editor's sandbox prerequisites:

```sh
VSCODE_APP_ROOT=/usr/share/code/resources/app node --test script/tests/vscode-sdk.test.mjs
```

To remove the integration, remove the three settings above. If you used
`--python`, also remove `python.defaultInterpreterPath` or choose another default.
Backups are named
`settings.json.before-dotfiles-agents`, with numbered suffixes when necessary.
Do not restore an old backup over newer personal settings without reviewing it.

## tmux plugins

Provisioning with `--plugins` installs TPM into `~/.tmux/plugins/tpm`.
Plugin declarations live in `tmux/tmux.conf`; installed plugin checkouts under
`~/.tmux/plugins` are machine-local state and are not tracked in this repo.
Use `~/.tmux.conf.local` for final machine-specific overrides.

After setup, install the declared plugins with:

```sh
bash ~/.tmux/plugins/tpm/bin/install_plugins
```

In an existing tmux server, reload the configuration with the prefix followed by
`r`, then press the prefix followed by `I` to install and load the plugins.
The prefix is Ctrl+/ or Alt+z in this configuration.

The tmux config uses `tmux-resurrect` and `tmux-continuum` to save sessions every 15 minutes and restore them when tmux starts.

## Validation

Tests use temporary homes and do not provision the host:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s script/tests -p 'test_*.py'
node --test script/tests/*.test.mjs
shellcheck -x -S warning script/*.sh script/lib/*.sh tmux/bin/tmux-pane-bg
```

Deployment tests require chezmoi; selector integration tests require mise.
CI runs the contracts on Linux and macOS. WSL and containers share the headless
deployment path, but native Windows and live package installation are not tested.
