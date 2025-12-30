#!/usr/bin/env bash
#
# Dotfiles Setup Script
# Run: ./script/setup.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Source library modules
# shellcheck source=./lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=./lib/packages.sh
source "$SCRIPT_DIR/lib/packages.sh"
# shellcheck source=./lib/symlinks.sh
source "$SCRIPT_DIR/lib/symlinks.sh"
# shellcheck source=./lib/git.sh
source "$SCRIPT_DIR/lib/git.sh"
# shellcheck source=./lib/shell.sh
source "$SCRIPT_DIR/lib/shell.sh"

main() {
  printf '\n==> Setting up dotfiles from: %s\n\n' "$DOTFILES_DIR"

  install_baseline_packages
  symlink_dotfiles
  configure_git
  install_mise
  install_antidote
  install_starship
  clear_plugin_cache
  set_default_shell_zsh

  printf '\n==> Setup complete!\n\n'
}

main "$@"
