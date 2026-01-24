# Optional AI CLI hook (machine-local opt-in)
_ai_cli_selector="$HOME/.config/dotfiles/enable_ai_cli_side"
_ai_cli_env="$HOME/.config/dotfiles/ai_cli_side.env"

if [[ -f "$_ai_cli_selector" ]]; then
  if [[ -r "$_ai_cli_env" ]]; then
    source "$_ai_cli_env"
  fi

  if [[ -n "${AI_CLI_SIDE_DIR:-}" ]]; then
    _ai_cli_bin="$AI_CLI_SIDE_DIR/bin"
    if [[ -d "$_ai_cli_bin" ]]; then
      export PATH="$_ai_cli_bin:$PATH"
    elif [[ -x "$AI_CLI_SIDE_DIR/scripts/install.sh" ]]; then
      "$AI_CLI_SIDE_DIR/scripts/install.sh" --no-symlink
      if [[ -d "$_ai_cli_bin" ]]; then
        export PATH="$_ai_cli_bin:$PATH"
      fi
    fi
  fi
fi

unset _ai_cli_selector _ai_cli_env _ai_cli_bin
