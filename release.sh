#!/usr/bin/env bash
# Convenience wrapper around scripts/release.mjs.
#
#   ./release.sh              # patch: 0.1.3 -> 0.1.4
#   ./release.sh minor        # minor: 0.1.3 -> 0.2.0
#   ./release.sh major
#   ./release.sh 0.4.0
#   ./release.sh minor --dry-run
#   ./release.sh minor --push -y
#
# Everything after the version argument is forwarded to the Node script.
set -euo pipefail
cd "$(dirname "$0")"
exec node scripts/release.mjs "$@"
