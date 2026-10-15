#!/usr/bin/env bash
# Resolve real mise executables without installing tools or invoking shell aliases.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v mise >/dev/null 2>&1; then
  printf '%s\n' 'Copilot launcher: mise is not installed or is not on PATH.' >&2
  exit 127
fi

if ! copilot_bin="$(MISE_OFFLINE=1 mise which --tool npm:@github/copilot copilot 2>/dev/null)" || [[ ! -x "$copilot_bin" ]]; then
  printf '%s\n' 'Copilot launcher: Copilot is not installed in mise. Select copilot and run mise install.' >&2
  exit 127
fi

if ! node_bin="$(MISE_OFFLINE=1 mise which --tool node@lts node 2>/dev/null)" || [[ ! -x "$node_bin" ]]; then
  printf '%s\n' 'Copilot launcher: Node LTS is not installed. Run mise install node@lts.' >&2
  exit 127
fi

exec "$node_bin" "$SCRIPT_DIR/../agents/copilot.mjs" "$copilot_bin" "$@"
