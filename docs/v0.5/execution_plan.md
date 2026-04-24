# OpenPortfolio v0.5 Execution Plan (PRD)

**Status:** draft · 2026-04-24
**Authoritative product spec:** [../openportfolio-roadmap.md](../openportfolio-roadmap.md)
**Authoritative technical spec:** [../architecture.md](../architecture.md)
**Prior phase:** [v0.2 Targets & drift](../v0.2/execution_plan.md). v0.3 (Design & Polish) and v0.4 (PDF Import) are deferred by maintainer decision; will be revisited after v0.5 ships.

---

## Problem Statement

After v0.2, a portfolio owner can see *how far* their actual allocation has drifted from their targets — the ring color, the drift pill, and per-class numbers make the gap visible. What v0.2 does not give them is an answer to the next question: *what do I actually do about it?* Translating "+5% overweight equity" into a dollar amount, a sell, and a buy — and reasoning about how drift in Equity's L2 sub-classes interacts with the L1 picture — is left as an exercise for the user. Owners who want to close drift on a regular cadence (e.g. with monthly contributions) have no tool-supported path from "I see the gap" to "here is the move."

## Solution

A **Rebalance panel** on the hero page, placed below the drift pill and above the allocation table, that shows explicit dollar moves per asset class needed to close drift. The panel has two modes. **Rebalance existing** computes buys and sells against current net worth to hit targets. **New money** takes a contribution amount and shows how to distribute it toward closing drift without selling. Moves are shown at both L1 (root) and L2 (within each class) to match the full v0.2 target model. Every number is a class-level dollar figure — no per-ticker trade lists, no share counts — consistent with the project's commitment to deterministic math, visibility not advice, and honesty about what the tool can and cannot know.

## User Stories

1. As a portfolio owner, I want to see per-class dollar moves that close drift in Rebalance mode, so that I know what to sell and what to buy to reach my targets.
2. As a portfolio owner, I want to see L2 dollar moves inside each asset class that has L2 targets, so that I can act on drift at the same depth I've modeled my portfolio.
3. As a portfolio owner, I want a clear explanation when no L1 targets are configured, so that I understand why no recommendations appear rather than seeing a silently empty panel.
4. As a portfolio owner, I want classes inside the minor drift band to show "hold" instead of a tiny move, so that the recommendation doesn't generate noise trades the drift pill already told me to ignore.
5. As a portfolio owner, I want to enter a contribution amount in New money mode and see how to distribute it across classes, so that I can rebalance gradually without realizing gains.
6. As a portfolio owner, I want contributions smaller than the total gap to be distributed proportionally to each class's gap with no sells, so that every dollar of new money closes drift where drift exists.
7. As a portfolio owner, I want contributions larger than the total gap to put the excess only into classes at or under target, so that over-target classes don't get more money just because I happened to contribute more.
8. As a portfolio owner, I want L2 allocation in New money mode to follow the L1 decision, so that the class-level choice is made first and then distributed within, matching how I think about the portfolio.
9. As a portfolio owner, when holdings have been added since I saved my targets and those holdings fall under an L2 scope my targets no longer cover, I want a clear banner linking me to the targets editor instead of confusing numbers, so that I can fix the source of the problem.
10. As a portfolio owner, I want every dollar figure in the panel to show its derivation on hover, so that I can audit the math per the project's provenance rule.
11. As a portfolio owner, I want the rebalance panel hidden entirely when I have no L1 targets, so that the hero doesn't grow dead surface area before targets are configured.
12. As a portfolio owner, I want the recommendations expressed as class-level dollars rather than per-ticker trades, so that the tool stays honest about what it knows (my allocation) and doesn't pretend to know what it doesn't (which specific lots to trade).
13. As a maintainer, I want per-ticker trade lists, tax-lot awareness, and live-price share counts to be explicitly out of scope for this phase, so that the rebalance feature ships with a clear boundary and doesn't creep into advice territory.

## Implementation Decisions

- **Deep module boundary.** All rebalance math lives in one pure-Python module with two public functions, `compute_rebalance` and `compute_new_money`. Inputs are the already-built allocation result and the flat dotted-path targets map used elsewhere in the backend. No DB access, no HTTP, no I/O — this is the single tested surface.
- **Endpoint shape.** One new `GET` endpoint on the backend with query params `mode` and `amount`. Auth is the existing admin-token dependency. The response is a recursive tree of moves that mirrors the existing allocation slice shape (L1 at the root, L2 as children), so the frontend can reuse allocation-table rendering patterns.
- **Return type carries floats, not rounded dollars.** Math stays exact; rounding is a display concern handled by the frontend.
- **Direction field on every move.** The server classifies each move as buy, sell, or hold. "Hold" is driven by the same drift-band threshold as the v0.2 drift pill — not by a dollar floor — so the two surfaces stay consistent. The UI never derives direction from the sign of a dollar amount.
- **L1/L2 relationship.** L1 targets are required for any recommendations to appear. If only L2 targets exist, the panel is empty. This matches the "L1 is the root story" posture of the hero.
- **Stale L2 behavior.** If new holdings have been committed in a sub-class that the L2 targets no longer cover, the endpoint returns a specific error (409) rather than a partial computation, identifying the offending asset class. The frontend surfaces this as a "your targets are out of date" banner linking to the targets editor.
- **New-money excess allocation.** When a contribution exceeds the sum of positive gaps, the excess is distributed proportionally to `target_pct` but **only** among classes at or under their target (inclusive of the hold band). Over-target classes do not receive additional money even when the contribution is large. Tooltips distinguish the gap-fill portion from the excess portion so users can see why a class received what it did.
- **No schema changes.** Targets storage, positions, the allocation engine, and classifications are all untouched. Rebalance is a pure computation over existing state.
- **No LLM involvement.** Rebalance is deterministic math, per the project's hard rule that math lives in Python.
- **UI surface.** The hero page. One new panel placed below the drift pill and above the allocation table. Mode toggle, plus (for New money) a numeric input with an explicit Compute button rather than live debounce. The panel is hidden when no L1 targets are configured.

## Testing Decisions

- **What makes a good test.** Tests hit the external behavior of the two deep-module functions via fixture portfolios, not internal helpers. Assertions target the shape of the rebalance result (moves, directions, deltas, parent totals) rather than intermediate computations. This keeps the test surface stable under refactor.
- **Prior art.** The existing drift tests (fixture-driven pure math) and targets endpoint tests (TestClient plus auth fixtures) are the pattern to mirror. One file per tested module.
- **Tested modules.** The rebalance math module — both public functions — and the new HTTP endpoint. Endpoint tests cover the happy path, auth enforcement, validation errors, and the stale-target 409. The frontend panel is validated via manual acceptance walkthrough; frontend unit tests are not added in v0.5, matching the project's current testing posture. Frontend tests can land when a frontend testing infrastructure decision is made.
- **Coverage list.** The following cases must be covered:
  - L1-only targets: recommendations at root depth only, children absent or empty.
  - L1 + L2 targets: nested moves, parent totals equal to the sum of child moves.
  - Stale L2: holdings exist in a sub-class with no L2 target coverage → endpoint returns 409 with the offending class identified.
  - Hold band: classes whose drift is inside the minor-drift threshold are classified `hold`, not `buy`/`sell`.
  - New-money under-gap: contribution < sum of positive gaps → no sells, proportional distribution across gap classes.
  - New-money excess: contribution > sum of positive gaps → gaps filled, excess distributed only among at-or-under-target classes proportional to `target_pct`.
  - New-money L2 hierarchy: L1 decision made first, then distributed within each class per L2 targets.
  - Invalid amounts: negative or non-numeric `amount` in New money mode → validation error.
  - Zero-total portfolio: empty / zero net worth → clean empty response, no division-by-zero.
  - Auth: missing or wrong admin token → 401/403 per existing dependency.

## Out of Scope

- Per-ticker trade lists, share counts, and live price refresh. v0.5 stays at class-level dollars.
- Tax-lot awareness and account-type preferences for trades (e.g. "do this sell in the Roth"). Backlog unless a later phase pulls it in.
- Design & Polish (v0.3) — deferred by maintainer.
- PDF statement import (v0.4) — deferred by maintainer.
- Auth & workspaces (v0.6).
- Historical timeline (v0.7).
- Frontend unit tests — out of the project's current testing posture.

## Further Notes

- **Skip order.** The maintainer chose to skip v0.3 and v0.4 in order to prioritize v0.5, so rebalance can be exercised against manually-entered portfolios without waiting for PDF import or visual polish. v0.3 and v0.4 will be revisited after v0.5 ships.
- **Skill provenance.** This PRD was authored using the `to-prd` skill template. The file location uses the project's phase convention (`docs/v0.<n>/execution_plan.md`) rather than the skill's default `docs/prd/` location — an intentional hybrid locked by the maintainer.
- **Follow-ups.** If the "excess goes only to at-or-under-target classes" rule produces counterintuitive output in real use, a setting to switch distribution strategies is an easy follow-up. Not worth building upfront.
