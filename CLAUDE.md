---
description: 
alwaysApply: true
---

# OpenPortfolio — Claude Code instructions

## Project
`docs/openportfolio-roadmap.md` is authoritative for phase direction and product scope. `docs/architecture.md` is authoritative for technical constraints (stack, LLM rules, data model, risks). Read both before any design question. Push back on requests that contradict them — don't silently comply.

## Stack
- Frontend: Next.js 14 (App Router) + TypeScript, SQLite via Drizzle
- Backend: Python 3.12 + FastAPI, `uv` for packaging, SQLite via SQLAlchemy
- Host: Fly.io, single `fly.toml` at repo root
- LLM: LiteLLM wrapper, default Azure OpenAI GPT-5.4 (`azure/<deployment>`); Ollama as local alternative

## Hard rules
1. Math in Python, never in the LLM.
2. LLM extractions need JSON schema + confidence + source span + deterministic validation + user review. Skip none.
3. Every user-visible number shows provenance on hover.
4. v0.1 = paste / manual entry only. No broker APIs.
5. Tests for every extraction fixture and allocation calc.

## Deployment
- Prod: https://openportfolio.fly.dev (Fly.io app `openportfolio`, region `sjc`)
- Auto-deploys on push to `main` via `.github/workflows/fly-deploy.yml`
- Health check: `GET /health` → `{"ok": true}`

## Docker only
Run everything in containers. Never install on the host (no `npm`, `pip`, `brew`, `apt`, `cargo`, `gem`, etc.). New tools go in `Dockerfile` / `docker-compose.yml`. If it can't run in a container, ask first.

### Local dev (hot reload)
Two Dockerfiles exist intentionally — do not merge them:
- `Dockerfile` — **production only**. Multi-stage, `COPY`s source, used by Fly. Do not touch for dev-only needs.
- `Dockerfile.dev` — **local only**. Toolchain only (node + npm + uv + nginx); source bind-mounted from the host via `docker-compose.override.yml`. Runs `uvicorn --reload` + `next dev`.

**Commands (always include both `-f` flags for dev):**
- First run or after dep changes: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`
- Day-to-day: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` — code changes hot-reload, do not add `--build`
- Add npm dep: `docker compose exec app sh -c 'cd /app/frontend && npm install <pkg>'`
- Add Python dep: `docker compose exec app sh -c 'cd /app/backend && uv add <pkg>'`
- Reset dep volumes: `docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v`

**Verify hot reload works:**
```bash
curl -s http://localhost:8080/health   # expect {"ok":true}
echo '# touched' >> backend/app/main.py
sleep 3
docker compose logs app --tail=20 | grep -i "reload"   # expect uvicorn reload line
git checkout backend/app/main.py
```

**Do not:**
- Pass `--build` for code-only changes — it's slow and defeats the purpose
- Edit `Dockerfile`, `entrypoint.sh`, `nginx.conf`, or `fly.toml` for dev-only fixes — edit `Dockerfile.dev` / `entrypoint.dev.sh` / `docker-compose.dev.yml` instead
- Install deps on the host — use `docker compose exec` as shown above

## Mindset
- **Think first.** State assumptions; ask when unclear. Present options rather than picking silently.
- **Minimum code.** Nothing speculative — no abstractions, config, or error handling for impossible cases. If 200 lines could be 50, rewrite.
- **Surgical edits.** Touch only what the request requires. Don't reformat or refactor adjacent code. Match existing style. Flag unrelated dead code; don't delete it.
- **Verifiable goals.** Turn tasks into checks ("add validation" → "tests for invalid inputs pass"). Only clean up orphans your own changes created.

## Workflow
- Plan before coding a feature.
- One feature per branch, small PRs.
- Run tests before saying "done."
- Touches >5 files → stop, ask to split.
- **Always use subagents when possible, but not more than 4 same time.** Delegate exploration, research, and independent slices of work to subagents (Explore for codebase searches, general-purpose for multi-step tasks, Plan for design). Dispatch independent slices in parallel. Reserve the main thread for synthesis and decisions.

## Skip unless asked
- UI polish in v0.1 (function over form)
- Auth beyond magic-link
- Anything in the roadmap [Backlog](docs/openportfolio-roadmap.md#41-backlog-unphased) unless the current phase explicitly pulls it in
