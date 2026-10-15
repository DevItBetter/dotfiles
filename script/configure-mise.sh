#!/usr/bin/env bash
# Use a system Python first so this also works before mise tools are installed.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

for python in /usr/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 python3; do
  if "$python" -c 'import tomllib' 2>/dev/null; then
    exec "$python" "$SCRIPT_DIR/mise_config.py" "$@"
  fi
done
printf '%s\n' 'Tool selection requires Python 3.11 or newer. Install it and retry.' >&2
exit 1
