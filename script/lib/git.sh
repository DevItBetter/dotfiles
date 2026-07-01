#!/usr/bin/env bash
#
# Git configuration setup
#

# Source common utilities
# shellcheck source=./common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

# Configure machine-local git overrides when needed
configure_git() {
  info "Setting up git configuration..."

  local local_config="$HOME/.gitconfig.local"
  local backup_config="$HOME/.gitconfig.backup"
  local default_name default_email backup_name backup_email

  if [ -f "$local_config" ]; then
    success "Machine-local git overrides already present"
    return
  fi

  default_name="$(git config --file "$DOTFILES_DIR/git/gitconfig" --get user.name 2>/dev/null || true)"
  default_email="$(git config --file "$DOTFILES_DIR/git/gitconfig" --get user.email 2>/dev/null || true)"

  if [ -f "$backup_config" ]; then
    backup_name="$(git config --file "$backup_config" --get user.name 2>/dev/null || true)"
    backup_email="$(git config --file "$backup_config" --get user.email 2>/dev/null || true)"

    if [ -n "$backup_name" ] || [ -n "$backup_email" ]; then
      if [ "$backup_name" != "$default_name" ] || [ "$backup_email" != "$default_email" ]; then
        cp "$DOTFILES_DIR/shared/git/gitconfig.local.example" "$local_config"
        {
          printf '\n[user]\n'
          [ -n "$backup_name" ] && printf '    name = %s\n' "$backup_name"
          [ -n "$backup_email" ] && printf '    email = %s\n' "$backup_email"
        } >> "$local_config"
        success "Preserved existing git identity in $local_config"
        return
      fi
    fi
  else
    success "Using default personal git identity from dotfiles"
    return
  fi

  success "Using default personal git identity from dotfiles"
}
