#!/usr/bin/env bash
#
# Compatibility entry point. Provisioning and tool selection are separate commands.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
printf '%s\n' 'setup.sh now deploys configuration only. Use provision.sh and configure-mise.sh separately.' >&2
exec python3 "$SCRIPT_DIR/deploy.py" "$@"
