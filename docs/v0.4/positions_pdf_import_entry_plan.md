# Positions page PDF import entry — implementation plan

> **For agentic workers:** Implement task-by-task with review between tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second entry surface on `/positions` so users can drop a brokerage PDF, reuse the existing extract API and account-matching LLM fields, then land on `/accounts/{id}/import` with the review draft restored—without duplicating the full import UI.

**Architecture:** `POST /api/extract/pdf` already passes all DB accounts into the LLM and returns `matched_account_id` (validated server-side). The positions page calls `api.extractPdf`, sorts rows, then **always** shows a short **confirm destination** step (account dropdown + Continue / Cancel)—no immediate `router.replace` on extract success. The dropdown **defaults** to `matched_account_id` when present, else the positions **account filter** when not “All,” else empty (user must pick). **Continue** stashes `PdfImportDraft` and `router.replace` to `/accounts/{chosen}/import`; **Cancel** clears pending extract without stashing. (Import page still supports **Switch** after landing if someone skips this mental model; preflight is the primary guard.) When `accounts.length === 0`, show link to create accounts instead of navigating.

**Tech stack:** Next.js 14 App Router, client components, existing `frontend/app/lib/api.ts` (`extractPdf`), `frontend/app/lib/pdfImportDraft.ts`, pattern mirror `frontend/app/accounts/[id]/import/page.tsx` (`runExtract` / draft stash).

**Related product spec:** [execution_plan_prd.md](./execution_plan_prd.md) (v0.4 PDF import; this plan is a small UX extension).

**Deprecation note:** Prefer asking for the **superpowers writing-plans** skill over the deprecated `/write-plan` Cursor command.

---

## File map

| File | Responsibility |
|------|----------------|
| `frontend/app/lib/pdfImportDraft.ts` | Add exported `pdfImportMetaFromExtractionResult(result: ExtractionResult): PdfImportDraftMeta` (move logic out of import page for DRY). |
| `frontend/app/accounts/[id]/import/page.tsx` | Import helper from `pdfImportDraft`; remove local `metaFromResult` duplicate. |
| `frontend/app/positions/page.tsx` | PDF drop zone + extract; **mandatory** post-extract panel (account default = match then filter, user confirms) → stash + navigate. |

No backend or API contract changes.

---

### Task 1: Shared meta helper (DRY)

**Files:**

- Modify: `frontend/app/lib/pdfImportDraft.ts`
- Modify: `frontend/app/accounts/[id]/import/page.tsx`

- [ ] **Step 1:** In `pdfImportDraft.ts`, import type `ExtractionResult` from `./api` and add:

```typescript
export function pdfImportMetaFromExtractionResult(
  result: ExtractionResult,
): PdfImportDraftMeta {
  return {
    statement_account_name: result.statement_account_name,
    statement_account_name_confidence: result.statement_account_name_confidence,
    matched_account_id: result.matched_account_id,
    matched_account_confidence: result.matched_account_confidence,
    extraction_warnings: result.extraction_warnings,
    extracted_at: result.extracted_at,
    model: result.model,
  };
}
```

- [ ] **Step 2:** In `import/page.tsx`, delete the local `metaFromResult` function and replace `metaFromResult(result)` with `pdfImportMetaFromExtractionResult(result)` imported from `../../../lib/pdfImportDraft`.

- [ ] **Step 3:** Run frontend typecheck inside Docker (per repo `CLAUDE.md`):

```bash
docker compose run --rm frontend npm run build
```

Expected: build completes without TypeScript errors (adjust service name if `docker-compose.yml` uses a different service name for the Next app).

- [ ] **Step 4:** Commit:

```bash
git add frontend/app/lib/pdfImportDraft.ts frontend/app/accounts/[id]/import/page.tsx
git commit -m "refactor(frontend): share PDF import meta mapping for reuse"
```

---

### Task 2: Positions page — extract, confirm account, stash, navigate

**Files:**

- Modify: `frontend/app/positions/page.tsx`

**Behavior (lock these rules in code comments or a short inline note):**

1. User drops a `.pdf` or picks one via hidden file input. If **`pdfImportPending` is already set** (confirm panel open), **replace**: clear prior pending state implicitly by overwriting after the new extract completes (same as first drop); optional short status “Replaced with new file.”
2. `setPdfBusy(true)`, clear error status for this flow.
3. `const result = await api.extractPdf(file)`.
4. `const sorted = [...result.positions].sort((a, b) => a.confidence - b.confidence)`.
5. `const selectedIndices = sorted.map((_, i) => i)` (all rows selected, same as import page).
6. `const meta = pdfImportMetaFromExtractionResult(result)`.
7. **Do not navigate on extract success.** Set state `pdfImportPending: { rows: sorted, selectedIndices, filename: file.name, meta, defaultAccountId: number | null }` where `defaultAccountId = result.matched_account_id ?? (filterAccountId !== 'all' ? filterAccountId : null)` (invalid match ids are already null from API).
8. Render **confirm panel** (same session as extract). **If `rows.length === 0` (empty extract):** error-styled message “No position rows were extracted.”; still show `meta.extraction_warnings` if any; **Continue disabled** (do not stash empty row sets); account `<select>` may be hidden or disabled. **Cancel** clears `pdfImportPending`. **If `rows.length > 0`:** copy that user must choose import destination; show **row count** (e.g. “24 positions to review on the next screen”); `<select>` of accounts initialized to `defaultAccountId` if that id exists in `accounts`, else first account or empty. **Context lines (when data present):** statement label, suggested match + confidence, warnings list as already specified.
9. **Continue** (only when `rows.length > 0`): read selected `accountId` from select; if missing, show inline error; else `stashPdfImportDraftForRouteChange({ rows, selectedIndices, filename, meta })`, then **`router.replace`** to `/accounts/${accountId}/import` (same as import page account switch: avoids history stack where **Back** lands on `/positions` with a stale confirm state), clear `pdfImportPending`.
10. **Cancel:** clear `pdfImportPending` without stashing (user can drop again).
11. If `rows.length > 0` and `accounts.length === 0` after extract: show message + link to `/accounts` (Continue disabled until they have an account).
12. `finally` on extract: `setPdfBusy(false)`.

**Imports to add:** `useRouter` from `next/navigation`; `stashPdfImportDraftForRouteChange`, `pdfImportMetaFromExtractionResult`, types `PdfImportDraftMeta`, `ExtractedPosition` from `../lib/pdfImportDraft` and `../lib/api` as needed; ensure `api.extractPdf` is available.

- [ ] **Step 1:** Add state: `pdfBusy: boolean`, `pdfImportPending: null | { rows: ExtractedPosition[]; selectedIndices: number[]; filename: string; meta: PdfImportDraftMeta; defaultAccountId: number | null }`, and local state for the confirm `<select>` value.

- [ ] **Step 2:** Implement `async function handlePositionsPdf(file: File)` for extract + set pending; reject non-`.pdf` with the same user message as import page.

- [ ] **Step 3:** Implement confirm UI (panel above table or below header) when `pdfImportPending` is non-null; wire Continue/Cancel as above.

- [ ] **Step 4:** Add UI next to existing “Paste” / “Manual” actions: labeled drop target (`onDragOver` prevent default, `onDrop` first file) plus hidden `<input type="file" accept=".pdf,application/pdf" />` + button “Import PDF”.

- [ ] **Step 5:** Run `docker compose run --rm frontend npm run build`.

- [ ] **Step 6:** Manual check: drop PDF → confirm panel appears with sensible default → Continue → import page shows draft; Cancel → back to list with no draft.

- [ ] **Step 7:** Commit:

```bash
git add frontend/app/positions/page.tsx
git commit -m "feat(frontend): PDF import from positions with confirm-before-navigate"
```

---

### Task 4: Doc touch-up (optional, one sentence)

**Files:**

- Modify: `docs/v0.4/execution_plan_prd.md` (optional “Navigation” or “Frontend” bullet)

- [ ] Add one line under **Frontend** / **Navigation** that positions list also exposes PDF drop → same import route (keeps PRD aligned with shipped UX). Skip if you prefer not to churn docs.

---

## Verification checklist (human)

- [ ] `/positions` → drop PDF → **confirm panel** appears (no instant redirect) → Continue → `/accounts/{chosen}/import` with draft rows visible.
- [ ] `?account=5` in URL, no `matched_account_id` → confirm panel defaults select to **5**; user can change before Continue.
- [ ] Model returns matched account 7, filter is 5 → confirm panel defaults to **7**; user can switch to 5 before Continue.
- [ ] Confirm panel shows **position row count** matching draft size.
- [ ] After Continue, browser **Back** from import does not reopen a broken confirm on `/positions` (**`router.replace`**, not `push`).
- [ ] Cancel on confirm panel → no navigation, no stash; can drop again.
- [ ] With confirm panel open, drop a **different** PDF → new extract runs and panel shows **new** filename / count / defaults.
- [ ] Invalid PDF / non-PDF → error message on positions, no confirm panel.
- [ ] Large PDF / API errors → error surfaced; no partial stash.
- [ ] Extract returns **0 positions** → error-style panel, **Continue disabled**, warnings visible if any, **Cancel** clears.

---

## Out of scope

- OCR, persisting PDF bytes, new LLM fields, auto-commit by confidence, backend changes, Playwright (not in repo today).
