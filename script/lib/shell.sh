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
  local antidote_dir="${ZDOTDIR:-$HOME}/.antidote"
  info "Setting up Antidote plugin manager..."

  if [ -r "$antidote_dir/antidote.zsh" ]; then
    success "Antidote already installed"
  else
    git clone --depth=1 https://github.com/mattmc3/antidote.git "$antidote_dir"
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

# Install mise (runtime version manager)
install_mise() {
  info "Setting up mise..."

  if command -v mise &>/dev/null; then
    success "mise already installed: $(mise --version | head -1)"
  else
    info "Installing mise..."
    curl https://mise.run | sh
    success "mise installed"
  fi
}

# Install TPM (tmux plugin manager)
install_tpm() {
  local tpm_dir="$HOME/.tmux/plugins/tpm"

  info "Setting up TPM..."

  if [ -d "$tpm_dir/.git" ]; then
    success "TPM already installed"
  elif [ -e "$tpm_dir" ]; then
    warn "TPM path exists but is not a git checkout: $tpm_dir"
  else
    mkdir -p "$(dirname "$tpm_dir")"
    git clone --depth=1 https://github.com/tmux-plugins/tpm "$tpm_dir"
    success "TPM installed"
  fi
}

# Prepare plugins before opening an interactive shell.
prepare_zsh_plugins() {
  bash "$DOTFILES_DIR/script/prepare-zsh.sh"
}
