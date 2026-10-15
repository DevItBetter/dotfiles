#!/usr/bin/env bash
#
# Dotfiles Setup Script
# Run: bash script/setup.sh [--profile terumo|gbl] [--with GROUP_OR_TOOL]
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
  # Choose tools before package installation. Cancellation leaves setup untouched.
  local argument
  for argument in "$@"; do
    case "$argument" in
      --help|-h|--list|--dry-run)
        bash "$SCRIPT_DIR/configure-mise.sh" "$@"
        return
        ;;
      --install)
        error "Setup already installs selected tools; omit --install."
        return 1
        ;;
    esac
  done
  bash "$SCRIPT_DIR/configure-mise.sh" "$@"

  printf '\n==> Setting up dotfiles from: %s\n\n' "$DOTFILES_DIR"

  install_baseline_packages
  symlink_dotfiles
  configure_git
  install_tpm
  install_mise
  install_mise_tools
  install_antidote
  prepare_zsh_plugins
  set_default_shell_zsh

  printf '\n==> Setup complete!\n\n'
}

main "$@"
