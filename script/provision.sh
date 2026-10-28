#!/usr/bin/env bash
# Preview by default. System changes require explicit flags.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/packages.sh"
source "$SCRIPT_DIR/lib/shell.sh"

apply=false
terminal=auto
plugins=false
login_shell=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply) apply=true ;;
    --terminal) terminal=true ;;
    --no-terminal) terminal=false ;;
    --plugins) plugins=true ;;
    --login-shell) login_shell=true ;;
    --help|-h)
      printf '%s\n' 'Usage: bash script/provision.sh [--apply] [--terminal|--no-terminal] [--plugins] [--login-shell]'
      printf '%s\n' 'Without --apply, print the package and optional changes only.'
      printf '%s\n' 'Alacritty is included on macOS and Linux desktops; --terminal or --no-terminal overrides that.'
      exit 0 ;;
    *) error "Unknown argument: $1"; exit 2 ;;
  esac
  shift
done

if [ "$terminal" = auto ]; then
  if has_local_desktop; then terminal=true; else terminal=false; fi
fi
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
