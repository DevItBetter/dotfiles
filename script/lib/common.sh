#!/usr/bin/env bash
#
# Common utilities for dotfiles setup scripts
# Provides logging functions, link_file(), and DOTFILES_DIR initialization
#

# Initialize DOTFILES_DIR
# This assumes the script is sourced from script/setup.sh or script/lib/*.sh
# DOTFILES_DIR is the parent of the script directory
if [ -z "${DOTFILES_DIR:-}" ]; then
  DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

# Colors (only when output is a TTY)
if [ -t 1 ]; then
  BLUE=$'\033[0;34m'
  GREEN=$'\033[0;32m'
  YELLOW=$'\033[0;33m'
  RESET=$'\033[0m'
else
  BLUE='' GREEN='' YELLOW='' RESET=''
fi

if [ -t 2 ]; then
  RED=$'\033[0;31m'
else
  RED=''
fi

# Logging functions
info()    { printf '%s[INFO]%s %s\n'  "$BLUE"  "$RESET" "$*"; }
success() { printf '%s[OK]%s %s\n'    "$GREEN" "$RESET" "$*"; }
warn()    { printf '%s[WARN]%s %s\n'  "$YELLOW" "$RESET" "$*"; }
error()   { printf '%s[ERROR]%s %s\n' "$RED"   "$RESET" "$*" >&2; }

# Create symlink with backup handling
link_file() {
  local src="$1" dst="$2"
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    success "Already linked: $dst"
  elif [ -e "$dst" ]; then
    warn "Backing up existing: $dst -> $dst.backup"
    mv "$dst" "$dst.backup"
    ln -sf "$src" "$dst"
    success "Linked: $dst"
  else
    ln -sf "$src" "$dst"
    success "Linked: $dst"
  fi
}

