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

## Optional AI CLI hook

Set `AI_CLI_DIR` in `~/dotfiles/zsh/config/local.zsh` to enable the hook on a
machine. That file is ignored by Git and loaded before the hook.

```zsh
export AI_CLI_DIR=/path/to/ai-cli-repo
```

The hook sources `$AI_CLI_DIR/shell/init.sh` if it is readable. That script
controls the integration. With `AI_CLI_DIR` unset or the script missing, the
hook does nothing.

## tmux plugins

The setup script installs TPM into `~/.tmux/plugins/tpm`. Plugin declarations live in `tmux/tmux.conf`; installed plugin checkouts under `~/.tmux/plugins` are generated machine-local state and are not tracked in this repo.

The tmux config uses `tmux-resurrect` and `tmux-continuum` to save sessions every 15 minutes and restore them when tmux starts.
