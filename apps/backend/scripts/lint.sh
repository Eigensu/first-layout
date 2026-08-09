#!/bin/sh
# Backend lint (black + isort).
#
# Prefers the repo's venv so `pnpm lint` from the root works without the venv
# being activated in the calling shell — turbo spawns its own shell, which
# never inherits an activation. Fails loudly rather than skipping: a silent
# pass would let unformatted Python through a green `pnpm lint`.
set -e

DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$DIR"

if [ -x "venv/bin/black" ]; then
  BLACK="venv/bin/black"
  ISORT="venv/bin/isort"
elif command -v black >/dev/null 2>&1 && command -v isort >/dev/null 2>&1; then
  BLACK="black"
  ISORT="isort"
else
  echo "backend lint: black/isort not found." >&2
  echo "  Set up the Python environment first:" >&2
  echo "    cd apps/backend" >&2
  echo "    python3 -m venv venv && ./venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

if [ "$1" = "--fix" ]; then
  "$BLACK" .
  "$ISORT" .
else
  "$BLACK" . --check
  "$ISORT" . --check-only
fi
