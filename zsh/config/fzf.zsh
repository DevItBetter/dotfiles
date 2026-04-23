if ! command -v fzf >/dev/null 2>&1; then
  return
fi

# Load the upstream shell integration so fzf owns its widgets and bindings.
source <(fzf --zsh)
