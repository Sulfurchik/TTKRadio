#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

printf '[INFO] deploy.sh is now a compatibility wrapper.\n'
printf '[INFO] Forwarding to install.sh with the same arguments.\n'

exec "$SCRIPT_DIR/install.sh" "$@"
