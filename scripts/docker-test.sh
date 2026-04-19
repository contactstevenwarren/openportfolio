#!/usr/bin/env bash
# Run backend pytest in a clean Linux container (uv image) so the repo's
# host .venv (which may be darwin/arm64) doesn't interfere. See CLAUDE.md
# "Docker only" rule -- we never touch the host Python.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec docker run --rm \
  -v "$REPO_ROOT":/src:ro \
  ghcr.io/astral-sh/uv:python3.12-bookworm-slim \
  bash -c 'mkdir -p /tmp/proj && cp -r /src/backend /src/data /tmp/proj/ && cd /tmp/proj/backend && rm -rf .venv && uv sync --frozen --all-groups --quiet && exec uv run pytest "$@"' -- "$@"
