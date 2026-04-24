# OpenPortfolio — Architecture

Technical constraints, data model, and operational risks. **Product direction and phased delivery** live in [openportfolio-roadmap.md](openportfolio-roadmap.md).

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) |
| Backend | Python 3.12 + FastAPI |
| Database | SQLite on Fly.io persistent volume |
| Auth (v0.1–v0.4) | Env-var admin token (single-user) |
| Auth (v0.5+) | Auth.js (email magic-link), workspaces |
| LLM abstraction | LiteLLM |
| LLM providers (current) | Azure OpenAI (default), Ollama (local) |
| Charts | Apache ECharts (sunburst + drill-down) |
| Price data | `yfinance` + Alpha Vantage fallback |
| Fund holdings | `yfinance` + in-repo YAML fallback |
| Hosting | Fly.io (single platform, one `fly.toml`) |
| License | AGPL-3.0 |

Local DB management via Beekeeper Studio or Drizzle Studio. Deployed DB accessed via `fly ssh console`.

---

## Data model

Sketch from the original spec; **extended** in v0.1+ (nullable `market_value` on positions, `fund_holdings` cache table). **Planned** v0.1.5: `asset_types` table for user-managed synthetic prefixes (replaces hardcoded prefix dict).

```
accounts(id, label, type, currency, created_at)
positions(id, account_id, ticker, shares, cost_basis, market_value, as_of, source)
classifications(ticker, asset_class, sub_class, sector, region, source, updated_at)
snapshots(id, taken_at, net_worth_usd, payload_json)
provenance(entity_type, entity_id, field, source, confidence, llm_span, captured_at)
fund_holdings(...) — v0.1 M4 look-through cache
```

Schema is **locked at the table level**; new columns and tables are **extensions**, not redesigns.

---

## LLM extraction — verification required

LLMs may extract structured values when paired with all of:

1. Strict JSON schema output (tool-calling / JSON mode)
2. Per-field confidence signal
3. Source-span citation for every value
4. Deterministic validation layer (types, ranges, ticker format, value plausibility)
5. Mandatory user review via diff UI before commit

**Confidence semantics:** In v0.1 every row is reviewed regardless of confidence; the confidence signal drives row sort order and color, not auto-commit. Later phases may introduce a threshold for auto-staged rows.

**Derived metrics are always Python code** — allocation %, look-through composition, totals, concentration. Never asked of the LLM.

**AI narration (backlog, not scheduled):** If shipped, narration would be rendered from deterministic metrics via templates with prose around numeric slots, never free-form number generation by the LLM.

---

## LLM abstraction

LiteLLM behind a thin adapter. **Shipped providers:** Azure OpenAI (default, `azure/<deployment>`), Ollama (local). **Backlog:** Anthropic, OpenAI (direct), Google Gemini — user-selected per workspace when added. API keys encrypted at rest when multi-user lands. CI evals run against real paste fixtures where applicable.

**Azure OpenAI:** `AZURE_API_KEY`, `AZURE_API_BASE` (resource endpoint), `AZURE_API_VERSION`, `AZURE_DEPLOYMENT_NAME` (GPT-5.4 deployment). LiteLLM addresses it as `azure/<deployment_name>`.

---

## Auth seam

**v0.1–v0.4:** FastAPI validates a single admin token from an env var on every request. No sessions, no JWT, no cookies.

**v0.5:** Auth.js issues a signed session on the Next.js side; FastAPI validates via shared secret (JWT or signed cookie). Locked in before v0.5 implementation starts.

---

## Extraction pipeline

```
Pasted text → LLM extraction (JSON + confidence + spans)
           → Deterministic validation
           → Diff vs. current snapshot
           → Review-and-confirm UI
           → Commit to SQLite
```

Same pipeline handles paste (v0.1), text PDFs (v0.4: `pdfplumber` → text → pipeline), and scanned PDFs (backlog: OCR → text → pipeline).

---

## Classification and look-through

- **Classification:** in-repo YAML (`data/classifications.yaml`). User overrides in the `classifications` table with `source="user"` take precedence. Split into a sibling repo only if it grows past ~500 entries with regular community PRs.
- **Look-through:** `yfinance` primary, YAML fallback for gaps. **Backlog:** SEC EDGAR migration (replace fragile Yahoo scraping).
- **`yfinance` fragility:** `yfinance` scrapes Yahoo HTML and breaks 2–4x per year. YAML fallback covers the maintainer's core holdings as the safety net.
- **User overrides always win** — real estate type, HSA cash/invested split, etc.

---

## Effective allocation engine

Walk each position → apply look-through if fund → sum effective weights across every dimension. Pure Python, CI-tested against fixture portfolios.

---

## Privacy

- Ticker + share count data sent to the user's chosen LLM provider during extraction. Provider shown in UI; local Ollama option for zero external data.
- Paste input is scrubbed client-side for long digit runs (≥6 consecutive digits that aren't plausibly share counts) before send, to catch account numbers users paste accidentally.
- Classifications, look-through, and derived metrics computed locally — never sent anywhere.
- Credentials (account numbers, SSN, routing) never entered into the app. Paste parser targets the positions view only.
- Full JSON export and account deletion at any time.

**Principle (also in roadmap):** Your data never leaves your deployment except ticker+shares sent to your chosen LLM during extraction.

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | LLM extraction silent failure | Architecture scaffolding above + CI eval suite (backlog: GitHub Actions) |
| 2 | Broker format drift | Eval suite regression detection; prompt iteration |
| 3 | LLM API outages | Ollama as v0.1 backstop; multi-provider fallback (backlog) |
| 4 | `yfinance` look-through staleness | "As of" stamps; YAML fallback; EDGAR migration (backlog) |
| 5 | Users reading output as advice | Consistent "informational only" framing |
| 6 | Incumbent moves (Sharesight / Morningstar / Kubera free tier) | Non-brokerage + transparency are the defenses |
| 7 | Solo maintainer burnout | Ship small, release often |
| 8 | API key security | Encrypted at rest, never logged |
| 9 | Fly single-region SQLite loss | `GET /api/export` in v0.1 so the maintainer can pull a JSON snapshot on demand. Automated nightly push to Tigris deferred to v1.0. RPO ≤ 24h manual, RTO manual (hours). Acceptable for alpha. |
| 10 | `yfinance` ToS / scraper fragility | YAML fallback covers core holdings; EDGAR migration (backlog) |

---

## Locked product decisions (formerly "decisions resolved")

- Repo: `github.com/contactstevenwarren/openportfolio`
- Hosting: Fly.io, single platform
- DB: SQLite on persistent volume
- Auth: env-var admin token until v0.5 magic-link
- LLM default: Azure OpenAI GPT-5.4 + Ollama local; more providers backlog
- Classification: in-repo YAML + user DB overrides
- Look-through: `yfinance` + YAML fallback; EDGAR backlog
- Review UI: every change needs explicit user confirmation in v0.1
- Cost model: users bring their own LLM API key; infra costs personal during alpha
- Currency: USD only until multi-currency is scoped
- License: AGPL-3.0
