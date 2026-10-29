# Reference

## Layout

`.chezmoiroot` tells chezmoi that the source state is [home/](../home/). The rest
of the repository (docs, examples, fonts, tests) is not deployed.

| Source | Becomes |
| --- | --- |
| `home/.chezmoi.toml.tmpl` | `~/.config/chezmoi/chezmoi.toml`: the `chezmoi init` questions and detected facts |
| `home/.chezmoidata/` | Template data: system packages and mise profiles |
| `home/.chezmoitemplates/mise-tools` | Resolves a profile to its tool names, shared by the templates below |
| `home/.chezmoiexternal.toml` | Antidote and TPM, cloned and refreshed weekly |
| `home/.chezmoiignore` | Skips files the machine doesn't need |
| `home/.chezmoiscripts/` | Install and setup scripts |
| `home/dot_zshenv` | `~/.zshenv`, which only sets `ZDOTDIR` and `PATH` |
| `home/dot_config/zsh/` | `~/.config/zsh`: `.zshrc`, plugin list, `conf.d/*.zsh` |
| `home/dot_config/git/` | `~/.config/git/config` and `ignore` |
| `home/create_dot_gitconfig` | `~/.gitconfig`, created once for machine-local settings |
| `home/dot_config/mise/config.toml.tmpl` | `~/.config/mise/config.toml` for the chosen profile |
| `home/dot_local/share/agent-env/` | The agent command environment (see below) |

File names follow chezmoi's
[source state attributes](https://www.chezmoi.io/reference/source-state-attributes/):
`dot_` becomes `.`, `executable_` sets the mode, `.tmpl` files are templates,
`create_` files are written only if missing, and `modify_` files edit an
existing file.

### Template data

`chezmoi init` stores `name`, `email`, `profile`, and `desktop` from its prompts,
and detects `wsl` and `container`. `desktop` defaults to true on macOS and on
Linux with a display, and false over SSH, in containers, and on WSL. To see the
values, run `chezmoi data`.

`.chezmoiignore` uses them:

- Alacritty is deployed only when `desktop` is true.
- `conf.d/wsl2-ssh-agent.zsh` is deployed only on WSL.
- OpenCode, Pi, Claude Code, and Copilot integration files are deployed only when
  the profile installs that agent.
- Cursor rules are deployed only if `~/.cursor` exists.

### Scripts

chezmoi runs these in name order. `before` scripts run before files are written,
`after` scripts after. A `run_once_` script runs once per machine. A
`run_onchange_` script runs again when its rendered content changes, and most of
them embed a hash of the file they depend on for that reason.

| Script | Does |
| --- | --- |
| `run_once_before_00-migrate-legacy-links` | Backs up and migrates local shell settings and extra tools before removing legacy links and generated files (see [Migrating](#migrating-from-the-symlink-setup)) |
| `run_onchange_before_10-install-packages` | Installs `packages.yaml` with brew, apt, dnf, pacman, or zypper |
| `run_once_before_20-install-mise` | Installs mise to `~/.local/bin` (Homebrew on macOS) |
| `run_onchange_after_30-mise-install` | `mise install` whenever the mise config changes |
| `run_onchange_after_40-zsh-plugins` | Builds and syntax-checks the Antidote bundle when the plugin list changes, preserving the previous bundle on failure |
| `run_onchange_after_45-tmux-plugins` | Runs TPM's `install_plugins` when `~/.tmux.conf` changes |
| `run_after_50-configure-vscode` | Checks VS Code and VS Code Insiders on every apply, if installed; configuration failures fail the apply |
| `run_once_after_90-login-shell` | Runs `chsh` to zsh when there is a terminal to ask for a password |

To apply files without running scripts, use `chezmoi apply --exclude scripts`.
Without sudo, the package script prints the missing packages and carries on.

## Packages and tools

System packages are for things mise can't or shouldn't install: zsh, Git, curl,
Python 3, fzf, tmux, ripgrep, less, ShellCheck, Perl's Time::HiRes, and
Alacritty on desktops. `packages.names` maps a logical name to each package
manager's spelling, and `packages.casks` lists Homebrew casks.

Everything else comes from mise. To add a tool, add its TOML line under
`mise.tools` in [mise.yaml](../home/.chezmoidata/mise.yaml), then add its name to
a group or a profile's `tools` list. `chezmoi apply` rewrites
`~/.config/mise/config.toml` and runs `mise install`. For a tool that only one
machine needs, use `~/.config/mise/config.local.toml` instead. mise reads that
file after `config.toml`, and chezmoi leaves it alone.

## Shell

zsh reads `~/.zshenv` first. It sets `ZDOTDIR=~/.config/zsh` and puts
`~/.local/bin` and mise's shims at the front of `PATH`. Non-interactive shells
stop there.

Interactive shells then read `~/.config/zsh/.zshrc`, which runs in this order:

1. `conf.d/exports.zsh`, then `mise activate zsh`.
2. Antidote follows `.zsh_plugins.txt`: add the `zsh-completions` and pip
   completion directories to `fpath`, source the local
   `conf.d/completions.zsh` to run `compinit`, then load plugins.
   Plugins can call `compdef` directly. The completion dump lives in
   `~/.cache/zsh`. Without Antidote, the shell initializes system completions
   directly and starts without plugins.
3. History and options from `conf.d/`.
4. Key bindings, fzf, aliases, and functions from `conf.d/`.
5. `conf.d/wsl2-ssh-agent.zsh` on WSL.
6. starship, then `~/.config/zsh/local.zsh` if it exists.

Put machine-specific settings, work aliases, and things like Conda
initialization in `local.zsh`.

## Git

`~/.config/git/config` holds the shared settings and the identity from
`chezmoi init`. Git reads `~/.gitconfig` after it, so settings there win.
chezmoi creates `~/.gitconfig` once with only comments and never touches it
again. Credential helpers belong there too. If the legacy `~/.gitconfig.local`
exists, the shared config includes it to preserve that machine's overrides.
Settings in `~/.gitconfig` still take precedence.

For a second GitHub account on one machine:

1. Copy [gitconfig.work.example](../examples/git/gitconfig.work.example) to
   `~/.gitconfig.work` and set the work identity.
2. Add the `includeIf` block from [gitconfig.example](../examples/git/gitconfig.example)
   to `~/.gitconfig`, pointing at your work directory.
3. Add the `github-work` host from
   [config.github-work.example](../examples/ssh/config.github-work.example) to
   `~/.ssh/config`, and enable the URL rewrites in `~/.gitconfig.work`.

## Agent command environment

Coding agents run shell commands with whatever environment the agent inherited.
That causes two problems:

- mise shims prepend every tool's install directory to the `PATH` of each child
  process. An agent started through a shim hands that long `PATH` to every
  command, so project `.mise.toml` versions stop applying.
- Git pagers and colors turn command output into escape codes and blocked
  `less` sessions.

[command-environment.mjs](../home/dot_local/share/agent-env/command-environment.mjs)
fixes both. It puts mise's shim directory first, removes mise install
directories from `PATH`, and sets `GIT_PAGER=cat` and per-command
`GIT_CONFIG_*` color overrides. Color is turned off per command because a setting
such as `color.branch = always` beats `color.ui`. Other `PATH` entries and Git
overrides you set yourself stay put. This is process configuration, not a
sandbox.

Each agent gets it differently:

| Agent | How |
| --- | --- |
| OpenCode | Plugin at `~/.config/opencode/plugins/command-environment.js` that runs shell commands in `/bin/bash` with the environment |
| Pi | Extension at `~/.pi/agent/extensions/command-environment.js` that sets the environment on the Pi process, so its Bash tool and `!` commands inherit it |
| Claude Code | `~/.claude/settings.json` gets `env.CLAUDE_CODE_SHELL=/bin/bash` and a `SessionStart` hook that writes the environment to `$CLAUDE_ENV_FILE` |
| Copilot CLI | zsh aliases `copilot` to `~/.local/share/agent-env/copilot`, which execs Copilot under Node LTS with the environment |
| Codex CLI | zsh aliases `codex` to `~/.local/share/agent-env/codex`, which runs the npm CLI under Node LTS and supplies native command environment overrides |
| VS Code | See [VS Code](#vs-code) |

All of them run Node LTS through `agent-env/node-lts`, which asks
`mise which --tool node@lts` for the real binary rather than using a shim. A
project's Node version does not affect them. If Node LTS is missing, it fails
with a message instead of installing it.

The Claude Code settings file is a
[modify template](https://www.chezmoi.io/user-guide/manage-different-types-of-file/#manage-part-but-not-all-of-a-file):
chezmoi merges the two settings into your existing file and keeps everything else.
Re-applying adds nothing.

The Copilot alias exists only when the launcher is deployed, which happens only
when the profile includes Copilot. Outside zsh, run
`~/.local/share/agent-env/copilot` directly. The launcher preserves arguments,
stdin, signals, and exit status, and it handles mise's npm shell wrappers.

The Codex alias is also deployed only when the selected profile includes Codex.
Outside zsh, run `~/.local/share/agent-env/codex` directly. The launcher resolves
the installed `npm:@openai/codex` executable through mise without installing
anything. Its invocation adds individual `shell_environment_policy.set` keys
for the normalized PATH, Git pager, and Git color overrides, plus
`allow_login_shell=false` and `features.shell_snapshot=false`. This prevents
login startup and shell snapshots from restoring stale tool paths for agent
commands. Codex does not expose a global default-shell override. A managed
block in `~/.codex/AGENTS.md` instructs it to explicitly select `/bin/bash` and
`login=false` on every `exec_command` call. Existing personal guidance is kept.
This is an instruction-based default, not launcher enforcement: the startup
context can still report the account shell as zsh. Verify the shell used for
commands with `printf '%s\\n' "$BASH_VERSION" "$0"`. Codex's
[global instruction discovery](https://developers.openai.com/codex/guides/agents-md/)
also applies this guidance to local Codex clients using the same home directory.
An existing `AGENTS.override.md` takes precedence over `AGENTS.md`.

These are per-invocation options using Codex's [native configuration](https://developers.openai.com/codex/config-advanced/#shell-environment-policy).
They do not rewrite `~/.codex/config.toml`, select a model, or change sandbox,
approval, authentication, or MCP settings. Unrelated environment policy keys
and inherited Git overrides are retained. Filters that explicitly exclude the
environment variables still apply. Explicit `-c` options passed after the
launcher defaults can override them. The integration applies to locally
executed CLI commands, not a separately launched desktop app or a remote host.
User-entered `!` commands follow Codex's separate user-shell behavior and are
not evidence that agent sandboxing is active.

After applying, start a fresh zsh or run
`source ~/.config/zsh/conf.d/aliases.zsh`, then launch `codex` normally. To bypass
the alias for one invocation, use `command codex`.

After changing these files, restart the agent. In OpenCode use its reload
command; in Pi use `/reload`. Claude Code picks up settings in new sessions.

## VS Code

`run_after_50-configure-vscode` runs
[configure-vscode.mjs](../home/dot_local/share/agent-env/configure-vscode.mjs)
with `--python` for each installed edition. It needs VS Code 1.144 or newer and
Node LTS from mise. It checks each installed edition on every apply, writing
only when changes are needed. If it can't configure an edition, it prints the
error and the command to rerun, tries the other edition, and fails the apply.
The next apply tries again. An absent editor is skipped.

It configures the following user settings (on macOS the profile keys end in `.osx`):

- `chat.tools.terminal.terminalProfile.linux` and
  `terminal.integrated.agentHostProfile.linux` point at
  the absolute path to `~/.local/share/agent-env/bin/bash`. The Agent Host does
  not reliably expand `${env:HOME}` in this setting. That launcher starts Bash with the agent
  environment, skips your rc and login files, and keeps VS Code's shell
  integration. Your own terminals keep their usual shell.
- `chat.agentHost.customTerminalTool.enabled` enables the experimental terminal
  tool for Copilot Agent Host sessions. This sends shell commands through the
  configured Bash profile. VS Code manages its bundled runtime; the configurator
  no longer searches SDK directories or scans compiled editor code.
- `chat.agent.sandbox.fileSystem.linux.allowRead` grants sandboxed commands read
  access to mise, its data, configuration, state, and cache directories. On macOS
  the setting uses `.mac`. Paths follow the machine's mise and XDG overrides,
  including custom shims and symlinked installations. Existing sandbox rules
  are preserved, and write permissions are unchanged. These platform-specific
  settings apply to the custom terminal tool, not the default Copilot SDK tool.
  Sandboxing itself remains your choice; the configurator does not enable it.
- `python.defaultInterpreterPath` becomes mise's Python `latest`, resolved to the
  real binary. A custom value such as `${workspaceFolder}/.venv` is left alone,
  and saved per-workspace interpreter choices are unchanged.

The configurator keeps JSONC comments and other settings, backs up
`settings.json` as `settings.json.before-dotfiles-agents` before its first
change, and refuses symlinked settings files and conflicting custom profiles or
runtime overrides. It removes the previous dotfiles runtime override and its
generated launcher when migrating. To run it
by hand:

```sh
~/.local/share/agent-env/node-lts ~/.local/share/agent-env/configure-vscode.mjs --dry-run
~/.local/share/agent-env/node-lts ~/.local/share/agent-env/configure-vscode.mjs --insiders
```

Restart VS Code afterward and open new agent sessions. Run `chezmoi apply`
after installing VS Code or changing mise's directory overrides. Remote
hosts, containers, and cloud sessions are not configured.

The custom terminal tool is experimental. To temporarily return to VS Code's
default Copilot shell, set `chat.agentHost.customTerminalTool.enabled` to `false`
and start a new session. That default tool does not use this Bash profile, so
the dotfiles environment guarantees no longer apply. The next `chezmoi apply`
enables the custom tool again. See the [upstream tool comparison](https://github.com/microsoft/vscode/issues/323399)
and [sandbox compatibility notes](https://code.visualstudio.com/docs/agents/run/agent-sandboxing#local-harness-sessions-and-custom-terminal-tools).

## tmux

`~/.tmux.conf` declares the plugins. TPM is cloned to `~/.tmux/plugins/tpm` as
an external, and the plugins are installed when the config changes. Inside
tmux, the prefix (Ctrl+/ or Alt+z) followed by `r` reloads the config, and the
prefix followed by `I` installs plugins. tmux-resurrect and tmux-continuum save
sessions every 15 minutes and restore them when tmux starts. Overrides go in
`~/.tmux.conf.local`.

## Migrating from the symlink setup

Before chezmoi, `~/dotfiles` was symlinked into `$HOME`, and a Python wrapper
generated the mise config. To switch a machine over:

```sh
cd ~/dotfiles && git pull
chezmoi init --source ~/dotfiles   # answer the questions
chezmoi diff                       # review
chezmoi apply
```

Keep the current terminal open until the new shell works. Legacy cleanup needs
Python 3.11 or newer, which the old tool selector also required. Fresh machines
with no legacy files skip the cleanup without needing Python first.

The first apply runs `run_once_before_00-migrate-legacy-links`, which:

- Checks the old selection and generated fragments before removing anything.
  Unknown tools, edited fragments and conflicting migration files stop cleanup
  for manual review, leaving the originals intact.
- Backs up the affected existing files under
  `${XDG_STATE_HOME:-~/.local/state}/dotfiles/migration/legacy-*/configuration.tar.gz`.
  The backup directory is private, and the script prints its location.
- Removes links in `$HOME` that point into the old checkout layout, such as
  `~/.zshrc -> ~/dotfiles/zsh/zshrc`. Unrecognized symlink targets are kept.
- Preserves tools outside the chosen profile from `dotfiles-selection.json`
  or remaining generated fragment names in
  `~/.config/mise/conf.d/90-migrated-dotfiles.toml`. The versions and tool options
  come from the current catalog. Tools already in `config.local.toml` are left
  there with their existing overrides. Neither installed tools nor unrelated
  mise fragments are removed.
- Moves a legacy, machine-local `mise/config.toml` into `config.local.toml`
  when the latter is missing or empty, before deploying the managed config.
  Two different existing local configs require a manual merge first.
- Removes the old generated `10-dotfiles-*.toml` files, selection JSON, and
  `~/.zsh_plugins.zsh` only after preservation succeeds.
- Appends `zsh/config/work.zsh` and `zsh/config/local.zsh` from the old checkout,
  and `~/.config/dotfiles/{env,local}.zsh`, to `~/.config/zsh/local.zsh`. Each
  file is copied once, with private permissions. It checks `~/dotfiles` and the
  source checkout even when the old shell link has already been removed.

Git overrides in `~/.gitconfig.local` continue to work through a normal Git
include; no copy into `~/.gitconfig` is needed. The Claude settings modify
template replaces the old `script/claude-code-env.sh` hook with the new agent
environment hook, keeping unrelated hooks and settings. VS Code settings that
point at the old `agents/bash` path are updated in place.

On a machine that already migrated but has cleanup left, run `chezmoi update`.
The changed migration script runs again without resetting chezmoi's state.
Repeated applies do not duplicate preserved settings. If an earlier migration
already deleted both the tool-selection JSON and generated fragments, the old
selection cannot be reconstructed automatically; add any missing tools to
`config.local.toml` from your backup. The old `~/.antidote` checkout can be
deleted once the new shell works.

## Testing

```sh
node --test tests/*.test.mjs
```

The tests need `chezmoi` on `PATH` (or `CHEZMOI=/path/to/chezmoi`), Python 3.11
or newer for migration, and zsh for the shell tests. Each test runs `chezmoi init` and `chezmoi apply` into a
temporary `HOME`, skipping scripts and externals, and checks the result:

- the mise config for each profile, and which agent files each profile gets;
- the Git identity, and that `~/.gitconfig` survives later applies;
- the Claude Code settings merge;
- that a second apply changes nothing;
- the legacy migration;
- that interactive zsh starts with nothing on stderr, including with
  `TERM=dumb`;
- the agent launchers, plugins, and VS Code configurator, run from the
  deployed copies.

The automated VS Code tests cover configuration migration, idempotence, JSONC
preservation, sandbox path merging, and the deployed Bash launcher. They do not
launch a live Copilot session. After an editor upgrade, verify in a fresh
Copilot Agent Host session that Node follows project mise configs and separate
`(exit 7)` and `sh -c 'exit 7'` tool calls both report exit code 7.

For sandbox verification on Linux, write uniquely named markers inside and
outside the workspace, then check from the host which files persisted. A
hidden home directory can be replaced by a writable temporary filesystem:
a successful write there does not mean the host file was changed. A sandboxed
process must not be able to change the real outside-workspace marker. Remove
the test markers afterward. Public terminal API exit events can omit an exit
code for a bare subshell with clean Bash startup; check actual agent tool
results rather than treating a missing event code as success.

CI runs the tests on Ubuntu and macOS, then bootstraps a fresh runner with
`chezmoi init --apply` and checks that the tools are installed and that zsh
starts cleanly.
