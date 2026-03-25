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
  perl-time-hires
)

DISTRO_ID_CACHE=""
DISTRO_LIKE_CACHE=""

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

load_distro_info() {
  if [ -n "$DISTRO_ID_CACHE" ]; then
    return
  fi

  local os_release_file id id_like
  os_release_file="${OS_RELEASE_FILE:-/etc/os-release}"
  DISTRO_ID_CACHE="unknown"
  DISTRO_LIKE_CACHE=""

  if [ ! -r "$os_release_file" ]; then
    return
  fi

  id="$(
    # shellcheck disable=SC1090
    . "$os_release_file"
    printf '%s' "${ID:-unknown}"
  )"
  id_like="$(
    # shellcheck disable=SC1090
    . "$os_release_file"
    printf '%s' "${ID_LIKE:-}"
  )"

  DISTRO_ID_CACHE="$(printf '%s' "$id" | tr '[:upper:]' '[:lower:]')"
  DISTRO_LIKE_CACHE="$(printf '%s' "$id_like" | tr '[:upper:]' '[:lower:]')"
}

detect_distro() {
  load_distro_info
  printf '%s\n' "$DISTRO_ID_CACHE"
}

detect_distro_like_ids() {
  load_distro_info

  local like
  for like in $DISTRO_LIKE_CACHE; do
    printf '%s\n' "$like"
  done
}

lookup_pkg_override() {
  local key="$1"

  case "$key" in
    # Add distro-specific overrides above package-manager-only mappings, for example:
    # dnf:centos:foo) echo "foo-centos" ;;
    apt:perl-time-hires) echo "libtime-hires-perl" ;;
    dnf:perl-time-hires) echo "perl-Time-HiRes" ;;
    yum:perl-time-hires) echo "perl-Time-HiRes" ;;
    pacman:perl-time-hires) echo "perl" ;;
    brew:perl-time-hires) echo "perl" ;;
    *) return 1 ;;
  esac
}

# Map logical package name to package-manager-specific name
# Fallback order:
# 1. exact distro ID from /etc/os-release
# 2. distro family IDs from ID_LIKE
# 3. package manager only
# 4. raw logical package name
map_pkg() {
  local pm="$1" pkg="$2" distro like mapped

  distro="$(detect_distro)"
  if mapped="$(lookup_pkg_override "$pm:$distro:$pkg")"; then
    echo "$mapped"
    return
  fi

  while IFS= read -r like; do
    if [ -n "$like" ] && mapped="$(lookup_pkg_override "$pm:$like:$pkg")"; then
      echo "$mapped"
      return
    fi
  done < <(detect_distro_like_ids)

  if mapped="$(lookup_pkg_override "$pm:$pkg")"; then
    echo "$mapped"
    return
  fi

  echo "$pkg"
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
