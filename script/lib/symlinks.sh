#!/usr/bin/env bash
#
# Symlink creation for dotfiles
#

# Source common utilities
# shellcheck source=./common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

# Create all dotfile symlinks
symlink_dotfiles() {
  info "Creating symlinks..."

  link_file "$DOTFILES_DIR/fonts" "$HOME/.fonts"
  link_file "$DOTFILES_DIR/zsh/zshrc" "$HOME/.zshrc"
  link_file "$DOTFILES_DIR/git/gitconfig" "$HOME/.gitconfig"
  link_file "$DOTFILES_DIR/tmux/tmux.conf" "$HOME/.tmux.conf"

  # Starship config
  mkdir -p "$HOME/.config"
  link_file "$DOTFILES_DIR/starship/starship.toml" "$HOME/.config/starship.toml"
}

