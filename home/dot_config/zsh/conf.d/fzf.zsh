if [[ ! -o zle || ! -t 0 ]] || ! command -v fzf >/dev/null 2>&1; then
  return
fi

# Load the upstream shell integration so fzf owns its widgets and bindings.
if _zconf_fzf="$(fzf --zsh 2>/dev/null)"; then
  eval "$_zconf_fzf"
else
  for _zconf_fzf_file in /usr/share/fzf/shell/key-bindings.zsh \
      /usr/share/doc/fzf/examples/key-bindings.zsh \
      /opt/homebrew/opt/fzf/shell/key-bindings.zsh /usr/local/opt/fzf/shell/key-bindings.zsh; do
    if [[ -r "$_zconf_fzf_file" ]]; then
      source "$_zconf_fzf_file"
      break
    fi
  done
fi
unset _zconf_fzf _zconf_fzf_file
