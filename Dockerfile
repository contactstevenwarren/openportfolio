# syntax=docker/dockerfile:1.7

# ---------- Stage 1: Next.js build ----------
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
# `npm ci` is strict and skips optional native deps that aren't in the
# lockfile for the build platform (lockfile generated on darwin-arm64 omits
# the linux-x64-gnu entry for lightningcss). `npm install` re-resolves them.
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: Runtime ----------
FROM python:3.12-slim AS runtime

# Node binary (for Next.js standalone server)
COPY --from=node:20-slim /usr/local/bin/node /usr/local/bin/node

# uv (for building the Python venv)
COPY --from=ghcr.io/astral-sh/uv:0.4.27 /uv /usr/local/bin/uv

RUN apt-get update && apt-get install -y --no-install-recommends \
      nginx \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/lib/nginx /var/log/nginx /tmp

WORKDIR /app

# Backend deps (cached layer), then project
COPY backend/pyproject.toml backend/uv.lock /app/backend/
RUN cd /app/backend && uv sync --frozen --no-dev --no-install-project
COPY backend/ /app/backend/
RUN cd /app/backend && uv sync --frozen --no-dev

# Repo-root data (classifications.yaml, etc.). Separate from /data, which is
# the Fly persistent volume mounted at runtime for SQLite.
COPY data/ /app/data/

# Frontend: standalone server + static assets + public assets
COPY --from=frontend-build /frontend/.next/standalone /app/frontend
COPY --from=frontend-build /frontend/.next/static /app/frontend/.next/static
COPY --from=frontend-build /frontend/public /app/frontend/public

# Nginx + entrypoint
COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8080
CMD ["/app/entrypoint.sh"]
