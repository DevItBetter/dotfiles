#!/usr/bin/env bash
# Bootstrap the shared launcher without relying on an activated project runtime.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

mise_bin="$(command -v mise || true)"
if [[ -z "$mise_bin" && -x "$HOME/.local/bin/mise" ]]; then
  mise_bin="$HOME/.local/bin/mise"
fi
if [[ -z "$mise_bin" ]]; then
  printf '%s\n' 'Agent launcher: mise is not installed or is not on PATH.' >&2
  exit 127
fi
if ! node_bin="$(MISE_OFFLINE=1 "$mise_bin" which --tool node@lts node 2>/dev/null)" || [[ ! -x "$node_bin" ]]; then
  printf '%s\n' 'Agent launcher: Node LTS is not installed. Run mise install node@lts.' >&2
  exit 127
fi

exec "$node_bin" "$SCRIPT_DIR/../agents/command-launcher.mjs" "$@"
