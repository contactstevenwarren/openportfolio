#!/bin/bash
set -eu

cd /app/backend
./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 &
UVICORN_PID=$!

cd /app/frontend
HOSTNAME=127.0.0.1 PORT=3000 node server.js &
NODE_PID=$!

/usr/sbin/nginx -g 'daemon off;' &
NGINX_PID=$!

wait -n "$UVICORN_PID" "$NODE_PID" "$NGINX_PID"
EXIT=$?
kill "$UVICORN_PID" "$NODE_PID" "$NGINX_PID" 2>/dev/null || true
exit "$EXIT"
