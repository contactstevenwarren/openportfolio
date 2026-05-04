#!/bin/bash
set -eu

# Install deps into named volumes on first start (no-op on subsequent starts).
# Venv lives outside the bind-mounted source tree (/venv) to avoid the Linux
# restriction that prevents rm-ing a named-volume mountpoint directory.
# uv refuses to use an empty dir; create the venv explicitly first.
export UV_PROJECT_ENVIRONMENT=/venv
cd /app/backend
if [ ! -f /venv/pyvenv.cfg ]; then
  uv venv /venv
  uv sync --frozen
fi

cd /app/frontend
[ -f node_modules/.package-lock.json ] || npm ci --no-audit --no-fund

# Start backend with auto-reload on Python file changes.
cd /app/backend
/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app &
UVICORN_PID=$!

# Start frontend with Next.js Fast Refresh.
cd /app/frontend
HOSTNAME=127.0.0.1 PORT=3000 npm run dev &
NODE_PID=$!

/usr/sbin/nginx -g 'daemon off;' &
NGINX_PID=$!

wait -n "$UVICORN_PID" "$NODE_PID" "$NGINX_PID"
EXIT=$?
kill "$UVICORN_PID" "$NODE_PID" "$NGINX_PID" 2>/dev/null || true
exit "$EXIT"
