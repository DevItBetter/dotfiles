if [[ ! -o zle || ! -t 0 ]] || ! command -v fzf >/dev/null 2>&1; then
  return
fi

# Load the upstream shell integration so fzf owns its widgets and bindings.
if _dotfiles_fzf="$(fzf --zsh 2>/dev/null)"; then
  eval "$_dotfiles_fzf"
else
  for _dotfiles_fzf_file in /usr/share/fzf/shell/key-bindings.zsh \
      /usr/share/doc/fzf/examples/key-bindings.zsh \
      /opt/homebrew/opt/fzf/shell/key-bindings.zsh /usr/local/opt/fzf/shell/key-bindings.zsh; do
    if [[ -r "$_dotfiles_fzf_file" ]]; then
      source "$_dotfiles_fzf_file"
      break
    fi
  done
fi
unset _dotfiles_fzf _dotfiles_fzf_file
