#!/usr/bin/env bash
# Preview by default. System changes require explicit flags.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/packages.sh"
source "$SCRIPT_DIR/lib/shell.sh"

apply=false
terminal=false
plugins=false
login_shell=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply) apply=true ;;
    --terminal) terminal=true ;;
    --plugins) plugins=true ;;
    --login-shell) login_shell=true ;;
    --help|-h)
      printf '%s\n' 'Usage: bash script/provision.sh [--apply] [--terminal] [--plugins] [--login-shell]'
      printf '%s\n' 'Without --apply, print the package and optional changes only.'
      exit 0 ;;
    *) error "Unknown argument: $1"; exit 2 ;;
  esac
  shift
done

if "$terminal"; then BASE_PACKAGES+=(alacritty); fi
if ! "$apply"; then
  printf 'Package manager: %s\nPackages: %s\n' "$(detect_package_manager)" "${BASE_PACKAGES[*]}"
  printf 'Plugin downloads: %s\nChange login shell: %s\n' "$plugins" "$login_shell"
  exit 0
fi

install_baseline_packages
if "$plugins"; then
  install_tpm
  install_antidote
  prepare_zsh_plugins
fi
if "$login_shell"; then set_default_shell_zsh; fi
