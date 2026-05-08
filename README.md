# OpenPortfolio

An open-source portfolio x-ray for US DIY investors with fragmented accounts and mixed assets (ETFs, TDFs, stocks, bonds, real estate, gold, crypto, HSA sleeves).

**See what you actually own — including the parts that aren't on any brokerage.**

- Live: https://openportfolio.fly.dev
- Roadmap: [docs/openportfolio-roadmap.md](docs/openportfolio-roadmap.md)
- Architecture (stack, LLM rules, risks): [docs/architecture.md](docs/architecture.md)
- License: AGPL-3.0

---

## What this is

Paste broker statement text → the LLM extracts positions with per-row confidence and source spans → you review and commit → a deterministic Python engine produces allocation by asset class (L1) with sub-class drill-down. Non-brokerage assets (real estate, gold, crypto, private, HSA cash) enter through a manual form where you pick the asset class yourself. Every number on screen shows provenance on hover.

Not a returns tracker, not a benchmark comparison, not a trading tool. Visibility, not advice.

### Routes

| Route | What it does |
|---|---|
| `/` | Allocation donut (L1 + sub-class drill). Click a wedge to drill or open details. |
| `/paste` | Paste a broker statement; LLM extracts rows; review and commit. |
| `/manual` | Enter a non-brokerage asset (real estate, gold, checking, crypto, …) with its own classification. |
| `/accounts` | Create, edit, delete accounts (brokerage / HSA / crypto / real-estate buckets). |
| `/liabilities` | Track debts (mortgage, credit card, student loan, …) so the hero "Net worth" = assets − liabilities. |
| `/positions` | Every committed row, filterable by account / source / date, inline edit and batch delete. |
| `/classifications` | Edit how any ticker is classified. YAML baseline + your overrides in one table. |

---

## Quickstart

### Prereqs

- Docker Desktop (or any Docker 24+)
- A Fly.io account if you want to deploy; otherwise local is fine

### Run locally

```bash
git clone https://github.com/contactstevenwarren/openportfolio.git
cd openportfolio

# required secrets -- see "Configuration" below for the full list
cp .env.example .env  # then edit with your Azure/Ollama creds

docker compose up -d --build
# first time only: builds Dockerfile.dev and installs deps into named volumes (~2 min)
open http://localhost:8080
```

API docs (keep this URL and the docs themselves up to date): `http://localhost:8080/api/docs#/`

First time you open the UI you'll be prompted for the admin token. It's stored in `localStorage`; clear the browser storage or send a 401 to re-prompt.

Day-to-day, skip `--build` — code changes hot-reload automatically:

```bash
docker compose up -d
# edit backend .py files  → uvicorn reloads in ~1s
# edit frontend .tsx/.ts  → Next.js Fast Refresh in-browser
```

To smoke-test the prod image without bind mounts (what Fly actually runs):

```bash
docker compose -f docker-compose.yml up -d
```

#### When to rebuild (`--build`)

| Situation | Command |
|---|---|
| Code change (`.py`, `.tsx`, `.ts`, `.css`, `data/*.yaml`) | no rebuild needed — hot-reload handles it |
| `frontend/package.json` or `backend/pyproject.toml` changed | add `--build` to `docker compose up -d` |
| `Dockerfile.dev`, `nginx.conf`, or `entrypoint.dev.sh` changed | add `--build` to `docker compose up -d` |
| Reset everything (drops named dep volumes) | `docker compose down -v && docker compose up -d --build` |

### Run tests

```bash
./scripts/docker-test.sh -q
```

This spins up a clean Linux container (`ghcr.io/astral-sh/uv:python3.12-bookworm-slim`), syncs deps, and runs pytest. Never installs anything on your host — the project is docker-only per [CLAUDE.md](CLAUDE.md).

### Deploy

Pushes to `main` auto-deploy via `.github/workflows/fly-deploy.yml`. If you need to trigger one by hand:

```bash
# with flyctl installed natively
fly deploy -a openportfolio

# or via the flyctl container (docker-only setups)
docker run --rm -it \
  -v "$HOME/.fly:/root/.fly" -v "$PWD:/workdir" -w /workdir \
  --platform linux/arm64 \
  flyio/flyctl:latest deploy -a openportfolio
```

Health check: `GET /health` → `{"ok": true}`.

---

## Database migrations

The SQLite file is evolved with **[Alembic](https://alembic.sqlalchemy.org/)** (`backend/alembic/`). Production and dev entrypoints run `alembic upgrade head` **before** uvicorn starts.

**Minimum supported schema:** bucket-model classifications (`classification_buckets` + `classifications` without legacy flat columns), integer `targets.pct`, and the columns declared in [`backend/app/models.py`](backend/app/models.py). Older on-disk databases are not migrated by imperative startup code anymore.

**If you have an unsupported legacy file:** call `GET /api/export`, replace the DB file (or delete it for a fresh start), run migrations (`alembic upgrade head` with `DATABASE_URL` pointing at that file), then re-import if you saved an export.

Useful commands (from repo root, app container):

```bash
docker compose exec app sh -c 'cd /app/backend && uv run alembic current'
docker compose exec app sh -c 'cd /app/backend && uv run alembic upgrade head'
```

---

## Configuration

All env vars (set via `fly secrets set ...` in prod, `.env` locally):

| Var | Required | Default | Purpose |
|---|---|---|---|
| `ADMIN_TOKEN` | ✅ | — | Single-user bootstrap auth. 32-byte random string. Sent via `X-Admin-Token` header. |
| `DATABASE_URL` | — | `sqlite:////data/openportfolio.db` | Mount point on Fly is `/data` (persistent volume `op_data`). |
| `LLM_PROVIDER` | ✅ | `azure` | `azure` or `ollama`. See below. |

### Azure OpenAI (default)

```bash
LLM_PROVIDER=azure
AZURE_API_KEY=...
AZURE_API_BASE=https://<resource>.openai.azure.com
AZURE_API_VERSION=2025-03-01-preview
AZURE_DEPLOYMENT_NAME=<your GPT-5.4 deployment name>
```

LiteLLM addresses it as `azure/<AZURE_DEPLOYMENT_NAME>`.

### Ollama (local alternative)

```bash
LLM_PROVIDER=ollama
LLM_MODEL=llama3.1               # any local model tag
OLLAMA_API_BASE=http://host.docker.internal:11434  # default
```

If you're running the backend containerized but Ollama on the Mac host, the default `host.docker.internal` URL works out of the box. For fully-container setups, compose in an Ollama service and point this at the service name.

---

## Architecture

```
Pasted text → client-side scrub (6+ digit runs → [REDACTED])
           → LLM extraction (JSON schema + confidence + source span)
           → deterministic validation (ticker regex, plausibility, PII)
           → review & commit UI
           → SQLite
                ↓
       allocation engine (Python; math never touches the LLM)
           + classifications (data/classifications.yaml)
                ↓
       3-ring sunburst + 5-number summary + drill-down panel
```

Stack: Next.js 14 (App Router, TypeScript) + FastAPI (Python 3.12) + SQLite on Fly volume + LiteLLM (Azure OpenAI / Ollama) + ECharts.

Key invariants:
- Math is always in Python. The LLM never computes percentages, totals, or look-through weights.
- Every number the user sees carries a provenance tooltip (source, confidence, captured_at).
- Every LLM extraction passes through a JSON schema + deterministic validator + mandatory review UI before it hits the DB.

---

## Editing the data file

One source-controlled YAML drives bundled ticker routing:

### `data/classifications.yaml`

Per-ticker `asset_class` / `sub_class` (flat) or a weighted `buckets` list for funds that split across L2 slices. Add or edit rows for any held ticker the UI flags as unclassified. Restart the backend after editing.

Synthetic tickers (manual entries) use prefixes resolved in `backend/app/classifications.py`:
- `REALESTATE:123Main` → real_estate
- `GOLD:*`, `SILVER:*` → commodity
- `CRYPTO:*` → crypto
- `PRIVATE:*` → private
- `HSA_CASH:*` → cash

---

## Backup

v0.1 has a manual backup path. From any authenticated client:

```bash
curl -H "X-Admin-Token: $ADMIN_TOKEN" \
  https://openportfolio.fly.dev/api/export > openportfolio-$(date +%F).json
```

The dump includes accounts, positions, provenance rows, and snapshots. The source-controlled YAMLs and the fund_holdings cache are intentionally excluded — the YAMLs live in git and the cache rebuilds on demand.

Automated nightly push to a Tigris bucket is deferred to v1.0 ("Harden"). The risk is called out in [architecture risk #9](docs/architecture.md#risks). RPO is "whenever you last ran the curl above."

---

## Privacy

- Ticker + share counts are sent to your chosen LLM provider during paste extraction. Use Ollama for zero external data.
- Paste text is scrubbed client-side (≥6-digit runs → `[REDACTED]`) before the POST. This catches account numbers, SSNs, and routing numbers users paste accidentally.
- Classifications, look-through, and derived metrics compute locally and never leave the machine.
- Full JSON export is always available (see above).

---

## Contributing

v0.1 is maintained solo. If you've found a bug or want to discuss scope, open an issue. Please read [CLAUDE.md](CLAUDE.md) before sending a PR — it captures the hard rules (math in Python, minimum code, surgical edits, docker-only).
