#!/usr/bin/env bash
# Rebuild the plugin cache explicitly, outside interactive shell startup.
set -euo pipefail

DOTFILES_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
zsh_dir="${ZDOTDIR:-$HOME}"
antidote="$zsh_dir/.antidote/antidote.zsh"
cache="$zsh_dir/.zsh_plugins.zsh"

if [[ ! -r "$antidote" ]]; then
  printf 'Antidote is missing. Run bash %s/script/setup.sh first.\n' "$DOTFILES_DIR" >&2
  exit 1
fi

temporary="$(mktemp "$cache.XXXXXX")"
trap 'rm -f -- "$temporary"' EXIT
zsh -f -c 'source "$1" && antidote bundle < "$2"' -- \
  "$antidote" "$DOTFILES_DIR/zsh/zsh_plugins.txt" > "$temporary"
zsh -n "$temporary"
mv -f -- "$temporary" "$cache"
printf 'Prepared Zsh plugins: %s\n' "$cache"
