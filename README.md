# dotfiles
My dotfiles

## Optional AI CLI hook (machine-local opt-in)
This repo includes a generic opt-in hook that does nothing by default. To enable it on a single machine:

1) Create the selector file:
   - `~/.config/dotfiles/enable_ai_cli_side`
2) Create a local env file pointing at the AI CLI repo:
   - `~/.config/dotfiles/ai_cli_side.env`
   - Contents:
     - `AI_CLI_SIDE_DIR=/path/to/ai-cli-repo`

When enabled, the hook adds `$AI_CLI_SIDE_DIR/bin` to PATH. If the bin dir is missing but an install script exists, it runs the install script with `--no-symlink`.
