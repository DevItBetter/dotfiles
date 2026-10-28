# dotfiles

Shared shell, Git, terminal, and agent preferences for Linux desktops, SSH hosts,
WSL, containers, and macOS. Native Windows is not supported.

Chezmoi deploys configuration. Mise installs developer tools. System provisioning
is separate and optional.

## Quick start

Clone this repository anywhere and run these commands from its root.
Prerequisites are Git, Python 3.11 or newer, and
[mise](https://mise.jdx.dev/getting-started.html).

```sh
# Select developer tools and install them, including pinned chezmoi.
bash script/configure-mise.sh --profile core --install

# Preview configuration changes, then deploy.
mise exec chezmoi@2.73.3 -- python3 script/deploy.py diff
mise exec chezmoi@2.73.3 -- python3 script/deploy.py apply
```

Once chezmoi is on PATH, invoke `python3 script/deploy.py` directly.
For work tools, choose `--profile terumo` or `--profile gbl` instead of `core`.
Tool profiles do not select an OS, desktop applications, or agent settings.

## Select configuration

Defaults deploy `shell`, `git`, and `prompt`. Add capabilities explicitly:

```sh
python3 script/deploy.py diff --with tmux --with terminal --with agents
python3 script/deploy.py apply --with tmux --with terminal --with agents
python3 script/deploy.py status
```

| Capability | Managed configuration |
| --- | --- |
| `shell` | Zsh entry points referencing this checkout |
| `git` | Shared Git defaults and global ignore patterns |
| `prompt` | Starship |
| `tmux` | tmux and the pane-background helper |
| `terminal` | Alacritty |
| `agents` | OpenCode and Pi environment adapters, not personal settings |
| `cursor` | Cursor shell rules |

Use the deployment wrapper rather than bare `chezmoi apply`. It supplies
capabilities, custom directory paths, and legacy-file checks. `diff` and `status`
are read-only. `apply` saves the capability selection; `--without` stops managing
a capability but does not delete its files or uninstall tools.

## Migrate safely

Preview first. Old links into this checkout are backed up and detached.
Unknown or edited files stop deployment; `apply --adopt` backs them up before
replacement. Existing local Git settings remain machine-owned.

Read the [migration instructions](docs/reference.md#migrate-an-existing-installation)
before applying to an existing installation. They cover backup names, local
overrides, legacy Git identities, and moving the checkout.

## Provisioning and reference

System provisioning previews by default. It requires `--apply` to make changes:

```sh
bash script/provision.sh
bash script/provision.sh --apply --plugins
```

Alacritty is included on macOS and Linux desktops and skipped over SSH, in
containers, and on WSL. Use `--terminal` or `--no-terminal` to override.

Login-shell changes require `--login-shell`. Containers and managed hosts can skip
provisioning. Fonts are no longer installed automatically; install the font on
the OS running your terminal, including the Windows host for a Windows-side WSL
terminal.

The [configuration reference](docs/reference.md) covers prerequisites, supported
package managers, tool selection, local overrides, and opt-in Claude Code and
VS Code integrations. [Validation commands](docs/reference.md#validation) exercise
deployment in temporary homes; CI also runs on Linux and macOS.
