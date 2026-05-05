# OpenPortfolio — Roadmap

**Repo:** `github.com/contactstevenwarren/openportfolio`  
**Status:** Roadmap v2 · 2026-04-19  
**Maintainer:** Solo · Alpha user: Maintainer

> Personal design document. Decisions may change as implementation reveals reality. See git log for history. **Technical rules** (stack, LLM constraints, data model, risks): [architecture.md](architecture.md).

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
- **Deterministic math, LLM-assisted extraction.** Percentages and aggregations are Python code. LLM extracts values from pasted text (with verification). LLM never computes derived values.
- **Pluggable LLM providers.** Azure OpenAI and Ollama ship first; additional providers are backlog until needed.
- **Minimalist UX.** One hero screen per phase until a feature earns more surface. Features earn their place or don't ship.
- **Honest about uncertainty.** Every number carries provenance. Missing data is surfaced, not imputed.
- **Privacy.** Your data never leaves your deployment except ticker and share counts sent to your chosen LLM during extraction; details in [architecture.md](architecture.md#privacy).

---

## 4. Phases

One theme per phase. **Done when** is the acceptance bar.

| v | Theme | User Value |
|---|---|---|
| 0.1 | Foundation (Shipped) | Instantly visualize your true asset allocation by pasting raw portfolio data. |
| 0.1.5 | Entity Management (Shipped) | Track custom non-brokerage assets and save manual snapshots of your portfolio. |
| 0.1.6 | Portfolio donut view redesign (Shipped) | Replace the current sunburst + breakdown table with a simpler donut chart that supports one-level drill-down. |
| 0.1.7 | Liabilities & true net worth | Track debts (mortgage, credit card, loans) so the hero "Net worth" is assets minus liabilities. |
| 0.2 | Targets & drift | Keep your portfolio on track with target allocations and visible drift against them. |
| 0.3 | Design & Polish | Access and understand your portfolio seamlessly across both desktop and mobile devices. |
| 0.4 | PDF Import (Shipped) | Eliminate manual data entry by dragging and dropping brokerage statements to extract positions. |
| 0.5 | Rebalance recommendations (Shipped) | Turn drift into action with specific trade recommendations to close the gap. |
| 0.6 | Auth & Workspaces | Securely save your data across sessions and manage multiple independent portfolios. |
| 0.7 | Historical Timeline | Visualize how your asset allocation and wealth drift over time. |
| 1.0 | Public Release | Rely on a production-grade, fully documented platform with automated backups. |

Ordering is indicative, not a schedule.

### 4.1 Backlog (unphased)

Revisit after v1.0 unless a phase explicitly pulls an item in.

- Tax lens (lots, wash sales, TLH surfacing)
- OCR for scanned statements
- Plaid / broker APIs
- PWA mobile (beyond responsive web)
- AI narration around deterministic numbers
- More broker formats
- `yfinance` → SEC EDGAR migration
- GitHub Actions CI (beyond Fly deploy)
- Additional LLM providers (Anthropic, OpenAI direct, Gemini)

### 4.2 Execution plans

- **v0.1 Foundation:** [v0.1/execution_plan.md](v0.1/execution_plan.md)
- **v0.1.5 Entity management:** [v0.1.5/execution_plan.md](v0.1.5/execution_plan.md)
- **v0.1.6 Portfolio donut view redesign:** [v0.1.6/execution_plan.md](v0.1.6/execution_plan.md)
- **v0.1.7 Liabilities & true net worth:** [v0.1.7/execution_plan.md](v0.1.7/execution_plan.md)
- **v0.2 Targets & drift:** [v0.2/execution_plan.md](v0.2/execution_plan.md)
- **v0.5 Rebalance recommendations:** [v0.5/execution_plan.md](v0.5/execution_plan.md)
- **v0.4 PDF import:** [v0.4/execution_plan_prd.md](v0.4/execution_plan_prd.md)

Future phases add execution plans here when scoped.

**Convention:** every execution plan opens with a user-stories section capturing the end-user value delivered by the phase. Implementation detail (milestones, file changes, schema moves) follows the stories, not the other way around. Acceptance walks the stories. This keeps scope grounded in "what can a maintainer do after this phase ships" rather than in internal architecture.

---

## 5. Success criteria

- **Primary:** maintainer uses it monthly for 6 months post-launch.
- **Secondary:** 5 target-persona users return at least quarterly for 6 months.
- **Realistic first-year:** 200–500 stars, 20–100 MAU, 3–5 external contributors.

Not a growth-phenomenon project. Expected niche: open, transparent, non-brokerage-aware users — not displacing incumbents.
