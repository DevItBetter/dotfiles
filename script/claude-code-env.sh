#!/usr/bin/env bash
# Run the Claude Code SessionStart hook with Node LTS, not the project's runtime.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

mise_bin="$(command -v mise || true)"
if [[ -z "$mise_bin" && -x "$HOME/.local/bin/mise" ]]; then
  mise_bin="$HOME/.local/bin/mise"
fi
if [[ -z "$mise_bin" ]]; then
  printf '%s\n' 'Claude Code environment: mise is not installed or is not on PATH.' >&2
  exit 127
fi
if ! node_bin="$(MISE_OFFLINE=1 "$mise_bin" which --tool node@lts node 2>/dev/null)" || [[ ! -x "$node_bin" ]]; then
  printf '%s\n' 'Claude Code environment: Node LTS is not installed. Run mise install node@lts.' >&2
  exit 127
fi

exec "$node_bin" "$SCRIPT_DIR/../agents/claude-code.mjs"
