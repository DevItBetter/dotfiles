# dotfiles

My shell, Git, tmux, terminal, and coding-agent setup for Linux, WSL, macOS,
SSH hosts, and containers. Native Windows is not supported.

It is a plain [chezmoi](https://www.chezmoi.io/) source directory. chezmoi
renders the files in [home/](home/) into `$HOME`, installs system packages and
[mise](https://mise.jdx.dev/), and mise installs the developer tools.

## New machine

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b ~/.local/bin init --apply DevItBetter/dotfiles
```

That clones this repository to `~/.local/share/chezmoi` and asks four questions:
your Git name, your Git email, a mise tool profile, and whether this machine has
a desktop. A desktop gets Alacritty. Answers are saved in
`~/.config/chezmoi/chezmoi.toml` and are not asked again.

To use a checkout somewhere else, such as `~/dotfiles`:

```sh
git clone git@github.com:DevItBetter/dotfiles.git ~/dotfiles
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b ~/.local/bin
~/.local/bin/chezmoi init --apply --source ~/dotfiles
```

The first apply installs packages with the system package manager (it uses sudo
when it is not root), installs mise and its tools, clones the zsh and tmux
plugins, and offers to make zsh your login shell.

## Day to day

```sh
chezmoi update       # git pull, then apply
chezmoi diff         # what apply would change
chezmoi apply        # write the changes
chezmoi edit ~/.config/zsh/.zshrc   # edit the source file, not the copy
chezmoi init         # answer the questions again
```

Files in `$HOME` are copies, not links. Edit the source with `chezmoi edit` or in
the checkout (`chezmoi cd`), then apply. If you change a deployed file directly,
`chezmoi diff` shows it, and `chezmoi re-add` copies it back into the source.

## Profiles

A profile picks the mise tools in `~/.config/mise/config.toml`. Every profile
includes `core`.

| Profile | Adds |
| --- | --- |
| `core` | Node LTS, Python, uv, starship, diff-so-fancy, chezmoi |
| `terumo` | Bun, pnpm, markitdown, OpenCode, Pi, Copilot CLI, herdr |
| `gbl` | Bun, pnpm, every coding agent, the jmunch MCP servers, herdr, Temporal |

Profiles and tool versions live in
[home/.chezmoidata/mise.yaml](home/.chezmoidata/mise.yaml). Change a machine's
profile with `chezmoi init`, then `chezmoi apply`.

## Machine-local settings

These files belong to the machine. chezmoi never overwrites them.

| File | For |
| --- | --- |
| `~/.config/zsh/local.zsh` | Shell settings, loaded last |
| `~/.gitconfig` | Git settings, read after `~/.config/git/config` |
| `~/.config/mise/config.local.toml` | Extra tools for this machine |
| `~/.tmux.conf.local` | tmux overrides |

[docs/reference.md](docs/reference.md) covers the repository layout, the agent
command environment, VS Code, migration from the old symlink setup, and testing.
