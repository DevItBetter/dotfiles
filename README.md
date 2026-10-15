# dotfiles

My personal shell, terminal, Git, and editor configuration.

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

## Shells and tools

### Interactive shell

Interactive terminals use Zsh with mise activation. Noninteractive Zsh commands
use the quiet environment in `zsh/zshenv`, without loading interactive plugins.
Setup prepares the Antidote plugin cache. Shell startup only loads the existing
cache. After editing `zsh/zsh_plugins.txt`, rebuild it explicitly:

```sh
bash ~/dotfiles/script/prepare-zsh.sh
```

The preparation command may download missing plugins. A failed rebuild leaves
the previous cache intact. Open a new terminal to load the rebuilt cache.

Agents and editors need mise's shims on `PATH`:

```sh
export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$PATH"
```

### Agent command environments

Setup links the adapters in `agents/` to OpenCode's global plugins directory and
Pi's user extensions directory. Both use `agents/command-environment.mjs` to put
mise shims before inherited tool installation paths and disable Git paging and
color. Existing Git environment overrides and other PATH entries remain intact.
This is process configuration, not a sandbox.

The OpenCode V2 plugin selects `/bin/bash` for shell commands, independently of
your login shell. Pi already uses noninteractive Bash by default; its extension
normalizes the Pi process environment so built-in tools, `!` / `!!` commands,
and extension subprocesses inherit the same defaults. Extensions that supply
their own environment or remote execution backend can override them.

The adapters target Unix systems, including WSL. OpenCode uses
`$XDG_CONFIG_HOME/opencode/plugins`, falling back to `~/.config/opencode/plugins`.
Pi uses `$PI_CODING_AGENT_DIR/extensions`, falling back to `~/.pi/agent/extensions`.
No model, theme, authentication, or session files are linked. A custom Pi
`shellPath` or `shellCommandPrefix` remains device-local and can change its shell
behavior. Do not source interactive Zsh configuration from those settings.

Restart OpenCode or use its reload command after installation. In Pi, use
`/reload` or restart. Restart Pi after removing the extension to clear its
process-level environment changes.

Run the shared environment tests with:

```sh
node --test script/tests/agent-environment.test.mjs
```

For projects that require mise environment variables as well as tool versions,
use `mise run` tasks or `mise exec -- COMMAND` from the project directory.

## tmux plugins

The setup script installs TPM into `~/.tmux/plugins/tpm`. Plugin declarations live in `tmux/tmux.conf`; installed plugin checkouts under `~/.tmux/plugins` are generated machine-local state and are not tracked in this repo.

The tmux config uses `tmux-resurrect` and `tmux-continuum` to save sessions every 15 minutes and restore them when tmux starts.
