#!/bin/bash
#
# Dotfiles Setup Script
# Run: ./script/setup.sh
#
set -e

DOTFILES_DIR="$(cd "$(dirname "$0")/.." && pwd)"

printf '\n==> Setting up dotfiles from: %s\n\n' "$DOTFILES_DIR"

# -------------------------------------------------------------------
# Helper functions
# -------------------------------------------------------------------
if [ -t 1 ]; then
  BLUE='\033[0;34m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  RESET='\033[0m'
else
  BLUE=''
  GREEN=''
  YELLOW=''
  RESET=''
fi

if [ -t 2 ]; then
  RED='\033[0;31m'
else
  RED=''
fi
info()    { printf '%s[INFO]%s %s\n'  "$BLUE"  "$RESET" "$*"; }
success() { printf '%s[OK]%s %s\n'    "$GREEN" "$RESET" "$*"; }
warn()    { printf '%s[WARN]%s %s\n'  "$YELLOW" "$RESET" "$*"; }
error()   { printf '%s[ERROR]%s %s\n' "$RED"   "$RESET" "$*" >&2; }

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

# -------------------------------------------------------------------
# Detect package manager
# -------------------------------------------------------------------
detect_package_manager() {
  if command -v apt-get &>/dev/null; then
    printf '%s\n' "apt"
  elif command -v dnf &>/dev/null; then
    printf '%s\n' "dnf"
  elif command -v yum &>/dev/null; then
    printf '%s\n' "yum"
  elif command -v pacman &>/dev/null; then
    printf '%s\n' "pacman"
  elif command -v brew &>/dev/null; then
    printf '%s\n' "brew"
  else
    printf '%s\n' "unknown"
  fi
}

install_package() {
  local pkg="$1"
  local pm
  pm=$(detect_package_manager)
  
  info "Installing $pkg using $pm..."
  
  case "$pm" in
    apt)
      sudo apt-get update && sudo apt-get install -y "$pkg"
      ;;
    dnf)
      sudo dnf install -y "$pkg"
      ;;
    yum)
      sudo yum install -y "$pkg"
      ;;
    pacman)
      sudo pacman -S --noconfirm "$pkg"
      ;;
    brew)
      brew install "$pkg"
      ;;
    *)
      error "Unknown package manager. Please install $pkg manually."
      exit 1
      ;;
  esac
}

# -------------------------------------------------------------------
# Install and configure Zsh
# -------------------------------------------------------------------
info "Checking for zsh..."

if command -v zsh &>/dev/null; then
  success "Zsh already installed: $(zsh --version)"
else
  info "Zsh not found. Installing..."
  install_package zsh
  success "Zsh installed"
fi

# Set zsh as default shell
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

# -------------------------------------------------------------------
# Create symlinks
# -------------------------------------------------------------------
info "Creating symlinks..."

link_file "$DOTFILES_DIR/fonts" "$HOME/.fonts"
link_file "$DOTFILES_DIR/zsh/zshrc" "$HOME/.zshrc"
link_file "$DOTFILES_DIR/git/gitconfig" "$HOME/.gitconfig"
link_file "$DOTFILES_DIR/tmux/tmux.conf" "$HOME/.tmux.conf"

# Starship config
mkdir -p "$HOME/.config"
link_file "$DOTFILES_DIR/starship/starship.toml" "$HOME/.config/starship.toml"

# -------------------------------------------------------------------
# Setup Git configuration
# -------------------------------------------------------------------
setup_gitconfig() {
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
  git config --global include.path "$HOME/.gitconfig.local"
  
  # Mark as managed by dotfiles to prevent re-prompting
  git config --global dotfiles.managed true
}

setup_gitconfig

# -------------------------------------------------------------------
# Install Antidote (zsh plugin manager)
# -------------------------------------------------------------------
info "Setting up Antidote plugin manager..."

if [ -d "$HOME/.antidote" ]; then
  success "Antidote already installed"
else
  git clone --depth=1 https://github.com/mattmc3/antidote.git "$HOME/.antidote"
  success "Antidote installed"
fi

# -------------------------------------------------------------------
# Install Starship prompt
# -------------------------------------------------------------------
info "Setting up Starship prompt..."

if command -v starship &>/dev/null; then
  success "Starship already installed: $(starship --version | head -1)"
else
  info "Installing Starship (requires sudo)..."
  curl -sS https://starship.rs/install.sh | sh -s -- -y
  success "Starship installed"
fi

# -------------------------------------------------------------------
# Clean up generated plugin cache (will regenerate on first shell)
# -------------------------------------------------------------------
info "Clearing plugin cache (will regenerate on next shell)..."
rm -f "$HOME/.zsh_plugins.zsh"
success "Plugin cache cleared"

# -------------------------------------------------------------------
# Summary
# -------------------------------------------------------------------
printf '\n==> Setup complete!\n\n'
