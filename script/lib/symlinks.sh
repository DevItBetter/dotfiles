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
  link_file "$DOTFILES_DIR/zsh/zshenv" "$HOME/.zshenv"
  link_file "$DOTFILES_DIR/zsh/zshrc" "$HOME/.zshrc"
  link_file "$DOTFILES_DIR/git/gitconfig" "$HOME/.gitconfig"
  link_file "$DOTFILES_DIR/git/gitconfig.gbl" "$HOME/.gitconfig.gbl"
  link_file "$DOTFILES_DIR/tmux/tmux.conf" "$HOME/.tmux.conf"

  # Starship config
  mkdir -p "$HOME/.config"
  link_file "$DOTFILES_DIR/starship/starship.toml" "$HOME/.config/starship.toml"

  # Alacritty config
  mkdir -p "$HOME/.config/alacritty"
  link_file "$DOTFILES_DIR/alacritty/alacritty.toml" "$HOME/.config/alacritty/alacritty.toml"

   # User-local executables
   mkdir -p "$HOME/.local/bin"
   link_file "$DOTFILES_DIR/tmux/bin/tmux-pane-bg" "$HOME/.local/bin/tmux-pane-bg"

  # Cursor rules
  mkdir -p "$HOME/.cursor"
  link_file "$DOTFILES_DIR/cursor/rules" "$HOME/.cursor/rules"
}
