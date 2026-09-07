#!/usr/bin/env bash
# Convenience wrapper around scripts/release.mjs.
#
#   ./release.sh              # next patch after npm latest
#   ./release.sh minor        # next minor after npm latest
#   ./release.sh major
#   ./release.sh 3.4.0        # must be a valid next semantic release
#   ./release.sh --resume     # finish a partially published tagged release
#   ./release.sh minor --dry-run
#   ./release.sh minor --push -y
#
# Everything after the version argument is forwarded to the Node script.
set -euo pipefail
cd "$(dirname "$0")"
exec node scripts/release.mjs "$@"
