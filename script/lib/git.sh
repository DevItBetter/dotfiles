#!/usr/bin/env bash
#
# Git configuration setup
#

# Source common utilities
# shellcheck source=./common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

# Configure git with credentials and dotfiles management
configure_git() {
  info "Setting up git configuration..."

  # If no user.email configured, prompt for git credentials
  if [ -z "$(git config --global --get user.email)" ]; then
    printf '\n'
    read -rp "  What is your git author name? " user_name
    read -rp "  What is your git author email? " user_email
    printf '\n'

    git config --global user.name "$user_name"
    git config --global user.email "$user_email"
    success "Git credentials configured"
  elif [ "$(git config --global --get dotfiles.managed)" != "true" ]; then
    # Existing gitconfig not managed by dotfiles - preserve credentials
    user_name="$(git config --global --get user.name)"
    user_email="$(git config --global --get user.email)"

    # Backup handled by link_file, restore credentials after linking
    git config --global user.name "$user_name"
    git config --global user.email "$user_email"
    success "Git credentials preserved from existing config"
  else
    success "Git already configured by dotfiles"
  fi

  # Include local overrides file for machine-specific settings
  git config --global include.path '~/.gitconfig.local'

  # Mark as managed by dotfiles to prevent re-prompting
  git config --global dotfiles.managed true
}

