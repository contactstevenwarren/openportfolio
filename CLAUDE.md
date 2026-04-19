---
description: 
alwaysApply: true
---

# OpenPortfolio — Claude Code instructions

## Project
`docs/openportfolio-roadmap.md` is authoritative. Read it before any design question. Push back on requests that contradict it — don't silently comply.

## Stack
- Frontend: Next.js 14 (App Router) + TypeScript, SQLite via Drizzle
- Backend: Python 3.12 + FastAPI, `uv` for packaging, SQLite via SQLAlchemy
- Host: Fly.io, single `fly.toml` at repo root
- LLM: LiteLLM wrapper, default Anthropic Claude Haiku

## Hard rules
1. Math in Python, never in the LLM.
2. LLM extractions need JSON schema + confidence + source span + deterministic validation + user review. Skip none.
3. Every user-visible number shows provenance on hover.
4. v0.1 = paste / manual entry only. No broker APIs.
5. Tests for every extraction fixture and allocation calc.

## Docker only
Run everything in containers. Never install on the host (no `npm`, `pip`, `brew`, `apt`, `cargo`, `gem`, etc.). New tools go in `Dockerfile` / `docker-compose.yml`. If it can't run in a container, ask first.

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

## Skip unless asked
- UI polish in v0.1 (function over form)
- Auth beyond magic-link
- Anything out-of-scope per §4 of the roadmap
