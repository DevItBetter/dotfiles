# Optional AI CLI integration
# Set AI_CLI_DIR to the repository path to enable
if [[ -n "${AI_CLI_DIR:-}" && -r "$AI_CLI_DIR/shell/init.sh" ]]; then
  source "$AI_CLI_DIR/shell/init.sh"
fi
