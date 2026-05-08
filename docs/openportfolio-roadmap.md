# OpenPortfolio — Roadmap

**Repo:** `github.com/contactstevenwarren/openportfolio`  
**Status:** Roadmap v5 · 2026-05-07  
**Maintainer:** Solo · Alpha user: Maintainer

Product scope and phased delivery. **Technical rules** (stack, LLM constraints, data model): [architecture.md](architecture.md).

---

## What & why

Open-source **portfolio x-ray** for US DIY investors with fragmented accounts and mixed assets (ETFs, funds, stocks, bonds, real estate, gold, crypto, HSA).

**Positioning:** *See what you actually own — including assets that are not on any brokerage.*

**Differentiation:** non-brokerage positions in the same allocation view as brokerage; provenance on numbers; free/open. ETF look-through and multi-account tracking are table stakes, not differentiators.

---

## Principles

- **Visibility, not advice.** No trade recommendations, ticker picks, or price predictions.
- **Deterministic math, LLM-assisted extraction.** Aggregations in Python; LLM extracts from pasted text/PDF with verification.
- **Pluggable LLMs.** Azure OpenAI and Ollama; others backlog until needed.
- **Minimal UX.** One hero screen per phase until a feature earns more surface.
- **Honest uncertainty.** Provenance on numbers; missing data surfaced, not imputed.
- **Privacy.** See [architecture.md](architecture.md#privacy).

---

## Phases

Versions are **ordered by number**. **Shipped** matches current repo behavior (API + UI where applicable).

| v | Theme | Status | User value |
|---|--------|--------|------------|
| 0.1 | Foundation | **Shipped** | True asset allocation from pasted portfolio data. |
| 0.1.5 | Entity management | **Shipped** | Non-brokerage assets and manual snapshots. |
| 0.1.6 | Portfolio donut | **Shipped** | Donut chart with one-level drill-down (replaces sunburst-heavy layout). |
| 0.1.7 | Liabilities & net worth | **Shipped** | Debts tracked; hero net worth = assets − liabilities. |
| 0.2 | Targets & drift | **Shipped** | Target weights, drift vs targets, CTAs into rebalance flow. |
| 0.3 | Design & polish | **Shipped** | Responsive UI pass; design system + voice in [`brand.md`](brand.md); live showcase at `/brand`. |
| 0.4 | PDF import | **Shipped** | Drag/drop brokerage PDFs → extract positions → review → commit. |
| 0.5 | Rebalance suggestions | **Shipped** | Trade-style moves to close drift (deploy cash + full rebalance modes). |
| 0.6 | Auth & workspaces | Planned | Persisted multi-user-style workspaces (see architecture auth notes). |
| 0.7 | Historical timeline | Planned | Allocation and wealth over time (beyond earliest-snapshot delta on hero). |
| 1.0 | Public release | Planned | Production hardening, backups, documentation baseline. |

Ordering is not a schedule. **Next focus** for new work: **v0.6** (auth & workspaces), **v0.7** (timeline), **v1.0** (release hardening) — order as needed.

---

## Backlog (after v1.0 unless pulled in)

- Tax lens (lots, wash sales, TLH surfacing)
- OCR for scanned statements
- Plaid / broker APIs
- PWA beyond responsive web
- Narration around deterministic numbers (still non-advisory)
- More broker PDF formats
- `yfinance` → SEC EDGAR migration
- CI beyond Fly deploy (tests/lint in GitHub Actions)
- Extra LLM providers (Anthropic, OpenAI direct, Gemini)

---

## Success (informal)

 Maintainer-use-first; niche open-source tool — not a growth chase. Stars and MAU are secondary signals.
