# OpenPortfolio — Roadmap & Spec

**Repo:** `github.com/contactstevenwarren/openportfolio`
**Status:** v1.1 spec · 2026-04-18
**Maintainer:** Solo · Alpha user: Maintainer

> This is a personal design document. Decisions may change as implementation reveals reality. See git log for history.

---

## 1. What this is

An open-source **portfolio x-ray** for sophisticated US DIY investors with fragmented accounts and mixed assets (ETFs, TDFs, stocks, bonds, real estate, gold, crypto, HSA).

**Positioning:** *See what you actually own — including the parts that aren't on any brokerage.*

**Core problem:** "I have six accounts and five asset types. I can't answer 'what fraction is cash?' or 'what's my real US equity exposure through all my funds?'"

---

## 2. Why it exists (differentiation)

Morningstar X-Ray, Sharesight, ETF Insight, Portfolio Visualizer, Ghostfolio, rotki, and Kubera all decompose portfolios. ETF look-through is commoditized. Kubera is the closest incumbent on "non-brokerage first-class" but is proprietary and subscription-priced (~$15/mo). OpenPortfolio earns its place on three gaps:

1. **Non-brokerage assets as first-class** — real estate, gold, HSA sleeves, 529s, private holdings appear in the same allocation view as brokerage positions, not in an "Other" bucket
2. **Radical transparency** — every number shows provenance, freshness, and contributing holdings on hover; code is auditable
3. **Free and open** — no caps, no paywall, no forced accounts for basic use

Not differentiators: ETF decomposition, "AI-powered," multi-account tracking.

---

## 3. Principles

- **Visibility, not advice.** Shows what you own. Never recommends trades, suggests new tickers, or predicts prices.
- **Deterministic math, LLM-assisted extraction.** Percentages and aggregations are Python code. LLM extracts values from pasted text (with verification) and narrates metrics (v0.2+). LLM never computes derived values.
- **Pluggable LLM providers.** Anthropic and Ollama in v0.1; OpenAI, Azure, Google in v0.2. User-selected.
- **Minimalist UX.** One hero screen. Features earn their place or don't ship.
- **Honest about uncertainty.** Every number carries provenance. Missing data is surfaced, not imputed.

---

## 4. v0.1 scope — "Portfolio X-Ray"

**Done when:** Maintainer pastes positions from 6 accounts in <3 min, adds non-brokerage assets in <2 min, sees a correct sunburst answering "what fraction is cash?" and "what's my real US equity exposure?"

**Hero-viz acceptance test:** a user answers "what fraction is cash?" in under 5 seconds without hovering. If the sunburst fails this during implementation, evaluate a treemap fallback before shipping.

**Assumptions:** USD only. Single user (the maintainer).

### In-scope

- Single-user bootstrap auth (env-var admin token); multi-user magic-link deferred to v0.2
- User-labeled account buckets (not API-connected)
- LLM paste parser with schema, confidence, source-span citation, deterministic validation, review-and-confirm UI
- Manual entry for non-brokerage assets (real estate, gold, crypto, private, HSA cash sleeves)
- Classification via in-repo YAML (`data/classifications.yaml`, ~50 tickers at launch)
- Look-through via `yfinance` (primary) + YAML fallback for niche funds
- Hero screen: 5-number summary strip + 3-ring interactive sunburst (asset class → sub-class → sector/region) + drill-down side panel
  - 5-number summary: total net worth, cash %, US equity %, intl equity %, alts % (real estate + gold + crypto + private)
- Provenance labels everywhere (dates, sources, confidence)
- LLM provider abstraction (Anthropic default, Haiku model; Ollama for local). OpenAI/Azure/Gemini adapters deferred to v0.2
- JSON export

### Non-goals for v0.1

- No performance / returns calculation
- No benchmark comparison
- No backtesting
- No tax-cost-basis or lot tracking
- No multi-currency
- No mobile layout
- No multi-user
- No AI chat
- No PDF import
- No OCR
- No broker API integrations

---

## 5. Phases

| v | Theme | Capability |
|---|---|---|
| 0.1 | X-Ray MVP | Paste, classify, decompose, visualize |
| 0.2 | Targets + AI + multi-user | M1-style target pie, deployment calc, AI narration, PDF import, magic-link auth, OpenAI/Azure/Gemini adapters |
| 0.3 | OCR + imports | Scanned statements, more brokers |
| 0.4 | Tax lens | Lots, wash sales, TLH surfacing |
| 0.5 | Historical | Snapshots, composition drift |
| 1.0 | Harden | Docs, stability, release |
| 1.x+ | Extensions | Plaid opt-in, PWA mobile, more brokers |

Ordering is indicative, not a schedule.

---

## 6. Architecture rules

### LLM extraction — verification required

LLMs may extract structured values when paired with all of:
1. Strict JSON schema output (tool-calling / JSON mode)
2. Per-field confidence signal
3. Source-span citation for every value
4. Deterministic validation layer (types, ranges, ticker format, value plausibility)
5. Mandatory user review via diff UI before commit

**Confidence semantics:** In v0.1 every row is reviewed regardless of confidence; the confidence signal drives row sort order and color, not auto-commit. v0.2+ may introduce a threshold for auto-staged rows.

**Derived metrics are always Python code** — allocation %, look-through composition, totals, concentration. Never asked of the LLM.

**AI narration constraint (v0.2+):** Narration is rendered from deterministic metrics via templates with prose around numeric slots, never free-form number generation by the LLM.

### LLM abstraction

LiteLLM behind a thin adapter. v0.1 providers: Anthropic (default), Ollama (local). v0.2 adds OpenAI, Azure OpenAI, Google Gemini. User picks per-workspace. API keys encrypted at rest. CI evals run against real paste fixtures.

### Auth seam

v0.1: FastAPI validates a single admin token from an env var on every request. No sessions, no JWT, no cookies.
v0.2: Auth.js issues a signed session on the Next.js side; FastAPI validates via shared secret (JWT or signed cookie). Locked in before v0.2 implementation starts.

### Extraction pipeline

```
Pasted text → LLM extraction (JSON + confidence + spans)
           → Deterministic validation
           → Diff vs. current snapshot
           → Review-and-confirm UI
           → Commit to SQLite
```

Same pipeline handles paste (v0.1), text PDFs (v0.2: `pdfplumber` → text → pipeline), and scanned PDFs (v0.3: OCR → text → pipeline).

### Data model sketch

```
accounts(id, label, type, currency, created_at)
positions(id, account_id, ticker, shares, cost_basis, as_of, source)
classifications(ticker, asset_class, sub_class, sector, region, source, updated_at)
snapshots(id, taken_at, net_worth_usd, payload_json)
provenance(entity_type, entity_id, field, source, confidence, llm_span, captured_at)
```

Locked in v0.1; extended (not redesigned) in later phases.

### Classification & look-through

- **Classification:** in-repo YAML, ~50 entries. Split into sibling repo only if it grows past ~500 entries with regular community PRs.
- **Look-through:** `yfinance` primary, YAML fallback for gaps. SEC EDGAR upgrade path in v0.2.
- **`yfinance` fragility:** `yfinance` scrapes Yahoo HTML and breaks 2–4x per year. YAML fallback covers the maintainer's ~50 holdings as the safety net; EDGAR migration is moved up to v0.2 rather than left implicit.
- **User overrides always win** — real estate type, HSA cash/invested split, etc.

### Effective allocation engine

Walk each position → apply look-through if fund → sum effective weights across every dimension. Pure Python, ~200 lines, CI-tested against fixture portfolios.

---

## 7. Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) |
| Backend | Python 3.12 + FastAPI |
| Database | SQLite on Fly.io persistent volume |
| Auth (v0.1) | Env-var admin token |
| Auth (v0.2+) | Auth.js (email magic-link) |
| LLM abstraction | LiteLLM |
| Local LLM | Ollama |
| Charts | Apache ECharts (sunburst + drill-down) |
| Price data | `yfinance` + Alpha Vantage fallback |
| Fund holdings | `yfinance` + in-repo YAML fallback |
| Hosting | Fly.io (single platform, one `fly.toml`) |
| License | AGPL-3.0 |

Local DB management via Beekeeper Studio or Drizzle Studio. Deployed DB accessed via `fly ssh console`.

---

## 8. Privacy posture

- Ticker + share count data sent to user's chosen LLM provider during extraction. Provider shown in UI; local Ollama option for zero external data.
- Paste input is scrubbed client-side for long digit runs (≥6 consecutive digits that aren't plausibly share counts) before send, to catch account numbers users paste accidentally.
- Classifications, look-through, and derived metrics computed locally — never sent anywhere.
- Credentials (account numbers, SSN, routing) never entered into the app. Paste parser targets the positions view only.
- Full JSON export and account deletion at any time.

---

## 9. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | LLM extraction silent failure | §6 scaffolding + CI eval suite |
| 2 | Broker format drift | Eval suite regression detection; prompt iteration |
| 3 | LLM API outages | Multi-provider fallback (v0.2+); Ollama as v0.1 backstop |
| 4 | `yfinance` look-through staleness | "As of" stamps; YAML fallback; EDGAR in v0.2 |
| 5 | Users reading output as advice | Consistent "informational only" framing |
| 6 | Incumbent moves (Sharesight / Morningstar / Kubera free tier) | Non-brokerage + transparency are the defenses |
| 7 | Solo maintainer burnout | Ship small, release often; Path B expectations |
| 8 | API key security | Encrypted at rest, never logged |
| 9 | Fly single-region SQLite loss | Daily JSON exports to object storage (Tigris). RPO ≤ 24h, RTO manual (hours). Acceptable for alpha; revisit at v1.0 |
| 10 | `yfinance` ToS / scraper fragility | YAML fallback covers core holdings; EDGAR migration moved into v0.2 |

---

## 10. Success criteria

- **Primary:** maintainer uses it monthly for 6 months post-launch.
- **Secondary:** 5 target-persona users return at least quarterly for 6 months.
- **Realistic first-year:** 200–500 stars, 20–100 MAU, 3–5 external contributors.

Not a growth-phenomenon project. Expected niche: open, transparent, non-brokerage-aware users — not displacing incumbents.

---

## 11. Decisions resolved

- Repo: `github.com/contactstevenwarren/openportfolio`
- Hosting: Fly.io, single platform
- DB: SQLite on persistent volume
- Auth in v0.1: single-user env-var admin token. Magic-link in v0.2.
- LLM default: Anthropic Haiku (default) + Ollama (local) in v0.1; OpenAI/Azure/Gemini in v0.2
- Classification: in-repo YAML
- Look-through: `yfinance` + YAML fallback; EDGAR in v0.2
- Review UI: every change needs explicit user confirmation in v0.1
- Cost model: users bring their own LLM API key; infra costs personal during alpha
- Currency: USD only in v0.1
- License: AGPL-3.0
