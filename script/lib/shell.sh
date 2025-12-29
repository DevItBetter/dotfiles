#!/usr/bin/env bash
#
# Shell-related setup and tool installation
#

# Source common utilities
# shellcheck source=./common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
# shellcheck source=./packages.sh
source "$(dirname "${BASH_SOURCE[0]}")/packages.sh"

# Set zsh as default shell
set_default_shell_zsh() {
  info "Checking for zsh..."

  if command -v zsh &>/dev/null; then
    success "Zsh already installed: $(zsh --version)"
  else
    info "Zsh not found. Installing..."
    install_baseline_packages
    success "Zsh installed"
  fi

  # Set zsh as default shell
  local current_shell zsh_path
  current_shell=$(basename "$SHELL")
  if [ "$current_shell" != "zsh" ]; then
    info "Setting zsh as default shell..."
    zsh_path=$(command -v zsh)

    # Add to /etc/shells if not present
    if ! grep -q "$zsh_path" /etc/shells 2>/dev/null; then
      info "Adding $zsh_path to /etc/shells..."
      printf '%s\n' "$zsh_path" | sudo tee -a /etc/shells >/dev/null
    fi

    chsh -s "$zsh_path"
    success "Default shell set to zsh (will take effect on next login)"
  else
    success "Zsh is already the default shell"
  fi
}

# Install Antidote (zsh plugin manager)
install_antidote() {
  info "Setting up Antidote plugin manager..."

  if [ -d "$HOME/.antidote" ]; then
    success "Antidote already installed"
  else
    git clone --depth=1 https://github.com/mattmc3/antidote.git "$HOME/.antidote"
    success "Antidote installed"
  fi
}

# Install Starship prompt
install_starship() {
  info "Setting up Starship prompt..."

  if command -v starship &>/dev/null; then
    success "Starship already installed: $(starship --version | head -1)"
  else
    info "Installing Starship (requires sudo)..."
    curl -sS https://starship.rs/install.sh | sh -s -- -y
    success "Starship installed"
  fi
}

# Clear plugin cache (will regenerate on first shell)
clear_plugin_cache() {
  info "Clearing plugin cache (will regenerate on next shell)..."
  rm -f "$HOME/.zsh_plugins.zsh"
  success "Plugin cache cleared"
}

