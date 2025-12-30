#!/usr/bin/env bash
#
# Package manager detection and baseline package installation
#

# Source common utilities
# shellcheck source=./common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

# Baseline packages to install
BASE_PACKAGES=(
  zsh
  git
  curl
  fzf
  tmux
  shellcheck
)

# Detect the system's package manager
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

# Map logical package name to package-manager-specific name
# Default: same name
map_pkg() {
  local pm="$1" pkg="$2"
  case "$pm:$pkg" in
    # Example mappings (only add when names don't match)
    # apt:fd) echo "fd-find" ;;
    # dnf:fd) echo "fd-find" ;;
    *) echo "$pkg" ;;
  esac
}

# Install baseline packages using the detected package manager
install_baseline_packages() {
  local pm pkgs=()
  pm="$(detect_package_manager)"

  for p in "${BASE_PACKAGES[@]}"; do
    pkgs+=( "$(map_pkg "$pm" "$p")" )
  done

  info "Installing baseline packages using $pm: ${BASE_PACKAGES[*]}"

  case "$pm" in
    apt)
      sudo apt-get update
      sudo apt-get install -y "${pkgs[@]}"
      ;;
    dnf)
      sudo dnf install -y "${pkgs[@]}"
      ;;
    yum)
      sudo yum install -y "${pkgs[@]}"
      ;;
    pacman)
      sudo pacman -Sy --noconfirm "${pkgs[@]}"
      ;;
    brew)
      brew install "${pkgs[@]}"
      ;;
    *)
      error "Unknown package manager. Please install: ${BASE_PACKAGES[*]}"
      exit 1
      ;;
  esac
}

