# OpenPortfolio v0.4 — PDF statement import (PRD)

## Problem Statement

Sophisticated DIY investors maintain holdings across multiple accounts and refresh them monthly from brokerage statements. Today, positions enter OpenPortfolio primarily through **paste** (and manual entry), which is reliable but tedious for recurring statement drops. Users need a **low-friction path** from a **brokerage PDF** to reviewed positions **scoped to the right account**, without silently duplicating rows each month or wiping holdings by mistake. They also need **confidence and provenance** preserved per project rules, and **explicit human control** over which account is targeted—especially when the statement label does not obviously match an existing account.

## Solution

Ship **PDF statement import** on an **account-scoped** flow: from an account detail view, the user **drags and drops** a PDF. The backend extracts **text** from the PDF (digital PDFs only; no OCR in this phase), **scrubs** sensitive digit runs before any LLM call, and runs the **same extraction pipeline** as paste: strict JSON from the LLM, deterministic validation, mandatory **review table** (aligned with paste), then commit.

For **monthly refresh**, commits support **replace mode** for a chosen account: **upsert** positions by ticker and **remove** holdings on that account that are absent from the approved row set. The UI shows **which tickers will be removed** and requires an **extra confirmation** when removals are non-empty. **Paste** gains the **same optional replace mode** so behavior stays consistent; **manual entry** stays append-only.

The LLM receives the **current list of accounts** (id, label, type) and may return a **statement account name** plus an optional **`matched_account_id`** drawn **only** from that list. The product **never** auto-creates or auto-switches accounts from the model alone; the user **selects** an account, switches via an inline picker, or explicitly **creates** a new account (with required type confirmation).

## User Stories

1. As a portfolio maintainer, I want to open an **account** and click **Import PDF statement**, so that imports are naturally tied to the account I care about.
2. As a user, I want to **drag and drop** a PDF onto the import page, so that I do not have to copy tables out of a PDF viewer.
3. As a user, I want the app to **reject** PDFs whose extracted text exceeds a safe size budget, so that I am not surprised by a silent truncation or a nonsense partial extract.
4. As a user, I want **long digit runs** scrubbed before anything is sent to an LLM provider, so that I reduce the chance of leaking account-like numbers (consistent with paste privacy posture).
5. As a user, I want **positions extracted with confidence and source spans**, so that I can sort and review risky rows the same way as on the paste page.
6. As a user, I want **duplicate ticker lines** from a messy statement merged into **one row** before review, so that I do not fight duplicate tickers in the table.
7. As a user, I want **merged source spans capped** with a clear note when too long, so that the UI and database stay readable.
8. As a user, I want the model to see my **existing accounts** in context, so that it can optionally suggest which account the statement belongs to **without inventing new accounts**.
9. As a user, I want **`matched_account_id` validated** against my real accounts, so that a hallucinated id cannot drive behavior.
10. As a user, when the model suggests a **different** account than the one I opened, I want a clear **Switch** or **Ignore** choice, so that I stay in control.
11. As a user, when there is **no** confident match, I want to **pick an account** or **create one** myself, so that the system does not auto-create the wrong bucket.
12. As a user creating an account mid-flow, I want the **label prefilled** from the statement name when available, but I must **explicitly set type** (no silent brokerage default), so that new accounts match my taxonomy.
13. As a user, I want a **warning** when the statement’s detected name does not **strongly match** the target account label (simple normalize + equality/substring rules), so that I notice possible mis-routing without extra dependencies.
14. As a user, I want an **inline account selector** when switching targets, so that I do not lose my extract when changing accounts.
15. As a user, I want to see **which holdings will be removed** from the account if I commit replace mode, so that I understand the destructive half of sync.
16. As a user, I want a **second confirmation** when removals are non-empty, so that I cannot commit a partial statement wipe in one careless click.
17. As a user, I want **replace mode** unavailable with an **empty** row selection, so that I cannot accidentally clear an account via API misuse.
18. As a user, I want **paste** to offer the **same replace workflow** (optional checkbox, explicit account, same removals preview), so that CSV paste and PDF import feel consistent.
19. As a user, I want **manual entry** unchanged (append-only), so that one-off assets are not tied to statement replace semantics.
20. As a user, I want **filtered positions** for only my account when previewing removals, so that the browser does not need my entire portfolio list for that calculation.
21. As a maintainer, I want **one portfolio snapshot** recorded per successful commit as today, so that timeline behavior stays predictable after replace commits.
22. As a user, I want **scanned PDFs** to fail clearly (no OCR in this release), so that I know to use paste or a text PDF instead.

## Implementation Decisions

- **PDF text module (deep module):** Single responsibility: accept PDF bytes, return canonical multi-page text with stable page delimiters; enforce a **maximum character budget**; **reject** (clear error) when over budget—**no silent truncate**.
- **PII scrub module (deep module):** Port the **same digit-run policy** as the frontend paste scrubber to the backend; run on text **before** the LLM for PDF (and optionally unify with paste path if paste scrub stays client-side—product minimum is PDF server path scrubbed).
- **LLM extraction contract:** Extend strict JSON schema with **`statement_account_name`** (+ confidence), **`matched_account_id`** (+ optional confidence), while keeping the **positions** array shape compatible with existing row validation. **Enumerate current accounts** in the prompt; model must only output **`matched_account_id`** from that set or **null**; **no** “create this account” proposals from the model.
- **Post-parse validation:** If **`matched_account_id`** is not in the loaded set, **strip** it and surface a **response-level warning** (analogous to row validation messaging).
- **Duplicate merge pass (deep module):** Pure function after **`annotate()`** on **both** text extract and PDF extract: merge rows sharing normalized ticker (sum numerics, min confidence, join spans with cap and truncation note). Shared by paste and PDF.
- **New HTTP surface:** Multipart **PDF extract** endpoint (admin-authenticated) returning positions + metadata + model id + timestamp. Optional same-release extension of **text extract** to include accounts list + **`matched_account_id`** for parity when accounts exist; empty account list forces null match id.
- **Positions list API:** Optional filter by **account id** for small payloads; **404** when account missing.
- **Commit API:** New flag **`replace_account`** (default false). When true: require **real** `account_id` (no implicit default account seeding); **422** on empty positions; **upsert** by `(account_id, ticker)`; **delete** other tickers on that account; append **provenance** for updated numerics similarly to manual patch semantics. No requirement that **`source`** start with `pdf:`—admin token remains the trust boundary.
- **Snapshot behavior:** Unchanged—still one **whole-portfolio** snapshot after each successful commit.
- **Frontend:** Account detail route; account import route with DnD; typed client helper for multipart extract; **shared review/commit UI** factored from paste; paste page **optional replace** with same removals UX; manual page **unchanged**.
- **Navigation:** Accounts list links into account detail (positions link may remain secondary). **`/positions`** also offers PDF drop → confirm account → same `/accounts/[id]/import` draft handoff as account import.

## Testing Decisions

- **Good tests** assert **observable contracts**: HTTP status codes, response shapes, DB counts, ticker sets after commit, and that forbidden states (empty replace, unknown match id) cannot occur. Prefer **mocked LLM** in CI (existing pattern) plus **small binary PDF fixtures** for text extraction.
- **Modules to test:** PDF text extraction (fixture PDF → string + budget behavior); duplicate merge (including truncation note); extract endpoint (mock completion returning positions + metadata + bad `matched_account_id`); positions list filter; commit replace (seed two tickers, commit one with replace, assert one removed and one updated not duplicated); empty replace → **422**; merge unit cases.
- **Prior art:** Backend tests already mock **`litellm.completion`** for extract; FastAPI **`TestClient`** with admin headers; commit tests seed SQLAlchemy models—extend those patterns rather than introducing a parallel framework.

## Out of Scope

- **OCR / scanned PDFs** and image-only statements.
- **Persisting uploaded PDFs** on disk or cloud storage.
- **Broker API** connectivity or automatic institution templates beyond LLM extraction from text.
- **Auto-commit** by confidence threshold (review remains mandatory per architecture).
- **Multi-currency** statement semantics (USD assumptions remain as today unless separately scoped).

## Orchestration: sequential subagents (mandatory)

The parent orchestrator **must not** load the entire v0.4 surface into one context. Use **Cursor `Task` (general-purpose subagent) runs one after another** — **never in parallel** for this feature — so each subagent keeps a **tight scope** and returns a **short handoff** (files touched, tests run, open risks). The parent only merges sequencing, resolves conflicts, and launches the next agent with the prior handoff plus this PRD.

**Order and boundaries:**

1. **Subagent A — PDF ingestion + scrub + merge (backend primitives)**  
   - **Owns:** `pdfplumber` dependency and lock refresh; PDF bytes → text module with page markers + max-char reject + empty-PDF error; digit scrub module mirroring paste; `merge_duplicate_tickers` pure function; `Settings` field for max extract chars; unit tests for scrub, merge (incl. span cap), and PDF text (mock `pdfplumber` where needed).  
   - **Does not own:** LLM prompts, HTTP routes, or frontend.  
   - **Handoff:** List of new/changed modules + test commands + any env/Docker notes.

2. **Subagent B — LLM contract + extract APIs**  
   - **Owns:** Extended strict JSON schema and prompts (accounts list + `matched_account_id` validation); `ExtractionResult` fields; `extract_positions` pipeline including post-`annotate` merge; `POST /api/extract` wired with DB accounts; `POST /api/extract/pdf` multipart; update all `*_llm.json` fixtures; tests for extract endpoints and invalid `matched_account_id` stripping.  
   - **Reads:** Handoff from A (import paths for scrub/merge/pdf_text).  
   - **Does not own:** `replace_account` commit logic or frontend.

3. **Subagent C — Positions list filter + replace commit**  
   - **Owns:** `GET /api/positions?account_id=`; `PositionCommit.replace_account` semantics (422 empty, require account_id, upsert by ticker, delete absent tickers, provenance on numeric updates); snapshot behavior unchanged; extend `CommitResult` if needed; tests mirroring `test_commit` / `test_positions` patterns.  
   - **Does not own:** LLM or PDF modules (only calls existing commit path).

4. **Subagent D — Shared frontend extraction review**  
   - **Owns:** Extract `PositionExtractReview` (or equivalent) from paste: table, classification hints, provenance cells, commit payload builder; extend `api` types for new extract fields + `extractPdf` FormData + `positions(accountId)`; wire paste page to shared component **without** yet adding PDF pages.  
   - **Handoff:** Component API + any props the import page will need.

5. **Subagent E — Account routes + PDF import + paste replace**  
   - **Owns:** `/accounts/[id]`, `/accounts/[id]/import` (DnD, banners for match/mismatch, inline account select, create-account flow with type required, removals preview + checkbox, `replace_account` on PDF commit); paste replace checkbox + same removals UX; accounts list nav link; manual page **unchanged**.  
   - **Reads:** Handoff from D.

**Parent responsibilities:** Run A → review handoff → run B → … → final `docker` test run if available; fix cross-agent conflicts only in a **sixth minimal pass** if needed (still small diff).

**Plan mode note:** While Cursor **Plan mode** is on, the parent cannot apply non-markdown edits; subagent **Task** runs that write code require **Agent mode** (or plan mode off). This section is the contract for **how** to execute once unblocked.

## Further Notes

- **Roadmap alignment:** Product roadmap lists PDF import under v0.4; this PRD matches that theme.
- **Filename:** Requested path used a typo (`exection_plan_prd.md`); this document is saved as **`execution_plan_prd.md`** alongside other versioned execution docs for consistency.
