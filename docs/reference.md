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
| `run_once_before_00-migrate-legacy-links` | Removes links from the pre-chezmoi setup (see [Migrating](#migrating-from-the-symlink-setup)) |
| `run_onchange_before_10-install-packages` | Installs `packages.yaml` with brew, apt, dnf, pacman, or zypper |
| `run_once_before_20-install-mise` | Installs mise to `~/.local/bin` (Homebrew on macOS) |
| `run_onchange_after_30-mise-install` | `mise install` whenever the mise config changes |
| `run_onchange_after_40-zsh-plugins` | Builds the Antidote bundle when the plugin list changes |
| `run_onchange_after_45-tmux-plugins` | Runs TPM's `install_plugins` when `~/.tmux.conf` changes |
| `run_onchange_after_50-configure-vscode` | Configures VS Code and VS Code Insiders, if installed |
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
2. Antidote loads the plugins in `.zsh_plugins.txt`. If Antidote is missing, the
   shell starts without plugins.
3. History and options, then `conf.d/completions.zsh`, which runs `compinit`
   once with its dump in `~/.cache/zsh`. Plugins that call `compdef` before then
   are queued and replayed afterward.
4. Key bindings, fzf, aliases, and functions from `conf.d/`.
5. `conf.d/wsl2-ssh-agent.zsh` on WSL.
6. starship, then `~/.config/zsh/local.zsh` if it exists.

Put machine-specific settings, work aliases, and things like Conda
initialization in `local.zsh`.

## Git

`~/.config/git/config` holds the shared settings and the identity from
`chezmoi init`. Git reads `~/.gitconfig` after it, so settings there win.
chezmoi creates `~/.gitconfig` once with only comments and never touches it
again. Credential helpers belong there too.

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

After changing these files, restart the agent. In OpenCode use its reload
command; in Pi use `/reload`. Claude Code picks up settings in new sessions.

## VS Code

`run_onchange_after_50-configure-vscode` runs
[configure-vscode.mjs](../home/dot_local/share/agent-env/configure-vscode.mjs)
with `--python` for each installed edition. It needs VS Code 1.142 or newer and
Node LTS from mise. If it can't configure an edition, it prints the error and
the command to rerun, and the apply continues.

It sets four user settings (on macOS the profile keys end in `.osx`):

- `chat.tools.terminal.terminalProfile.linux` and
  `terminal.integrated.agentHostProfile.linux` point at
  `~/.local/share/agent-env/bin/bash`. That launcher starts Bash with the agent
  environment, skips your rc and login files, and keeps VS Code's shell
  integration. Your own terminals keep their usual shell.
- `chat.agentHost.copilot.runtimePath` points at a launcher in
  `~/.local/share/dotfiles/vscode/` that starts the editor's bundled Copilot
  SDK runtime with the agent environment.
- `python.defaultInterpreterPath` becomes mise's Python `latest`, resolved to the
  real binary. A custom value such as `${workspaceFolder}/.venv` is left alone,
  and saved per-workspace interpreter choices are unchanged.

The configurator keeps JSONC comments and other settings, backs up
`settings.json` as `settings.json.before-dotfiles-agents` before its first
change, and refuses symlinked settings files and conflicting values. To run it
by hand:

```sh
~/.local/share/agent-env/node-lts ~/.local/share/agent-env/configure-vscode.mjs --dry-run
~/.local/share/agent-env/node-lts ~/.local/share/agent-env/configure-vscode.mjs --insiders
```

Restart VS Code afterward and open new agent sessions. Rerun after a VS Code
update moves the bundled runtime: `chezmoi apply` won't notice, because the
script reruns only when the configurator changes. Remote hosts, containers, and
cloud sessions are not configured.

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

The first apply runs `run_once_before_00-migrate-legacy-links`, which:

- Removes links in `$HOME` that point into the old checkout layout, such as
  `~/.zshrc -> ~/dotfiles/zsh/zshrc`. Links pointing anywhere else are kept.
- Removes the generated `~/.config/mise/conf.d/10-dotfiles-*.toml` files,
  `dotfiles-selection.json`, and `~/.zsh_plugins.zsh`. Your other `conf.d` files
  are kept.
- Appends `zsh/config/work.zsh` and `zsh/config/local.zsh` from the old checkout,
  and `~/.config/dotfiles/{env,local}.zsh`, to `~/.config/zsh/local.zsh`. Each
  file is copied once.

The old `~/.gitconfig.local` is no longer included. Move its contents into
`~/.gitconfig`. VS Code settings that point at the old `agents/bash` path are
updated in place. The old `~/.antidote` checkout can be deleted once the new
shell works.

## Testing

```sh
node --test tests/*.test.mjs
```

The tests need `chezmoi` on `PATH` (or `CHEZMOI=/path/to/chezmoi`), and zsh for
the shell tests. Each test runs `chezmoi init` and `chezmoi apply` into a
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

An opt-in test drives VS Code's bundled Copilot SDK Bash tool inside its
native sandbox, without model requests:

```sh
VSCODE_APP_ROOT=/usr/share/code/resources/app node --test tests/vscode-sdk.test.mjs
```

CI runs the tests on Ubuntu and macOS, then bootstraps a fresh runner with
`chezmoi init --apply` and checks that the tools are installed and that zsh
starts cleanly.
