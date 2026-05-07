# Classification Refactoring Progress

Source plan: `~/.cursor/plans/classifications_redesign_9913333b.plan.md`

Branch: **`feat/classifications-redesign`** (off `main`).

Last update: backend pytest **311 passed** in Docker (`uv run pytest`); frontend **`npm run build`** in Docker (Next.js 14).

---

## Done (backend + data + tests)

- **Data:** single ``data/classifications.yaml`` (flat or ``buckets`` per ticker).
- **Models:** `Classification` header-only (`ticker`, `source`, `updated_at`); **`ClassificationBucket`**; **`FundHolding` removed**; startup migration flattens legacy classifications, creates `classification_buckets`, drops `fund_holdings`, clears **`targets`**.
- **`classifications.py`:** bucket `ClassificationEntry`, `load_classifications` / `load_user_classifications`, `primary_asset_class`, `from_flat`, `migrate_synthetic_positions` writes buckets.
- **`allocation.py`:** **2-ring** tree (asset_class → sub_class); US vs intl strip via sub_class heuristic; **`sector_breakdown`** kept on `AllocationSlice` but **empty** (API shape compatibility).
- **`schemas.py`:** `ClassificationBucketPayload`, `ClassificationRow` / `ClassificationPatch` (buckets, weights sum ~1), taxonomy **`sub_classes_by_class`**, `InlineClassification` unchanged for commit (single bucket at commit time).
- **`main.py`:** GET/PATCH/DELETE `/api/classifications`, taxonomy, suggest, commit classification via **`_replace_user_classification_buckets`**; **`_yaml_asset_class_only_matches`** so paste with asset_class-only does not duplicate DB rows for multi-bucket seed tickers (e.g. VTI).
- **Removed:** `lookthrough.py`, **`yfinance`** dependency, **`test_lookthrough.py`**.
- **`config.py`:** look-through / yfinance toggles removed as applicable.
- **Tests:** `test_allocation*.py`, `test_classifications.py`, `test_classifications_api.py`, `test_commit.py`, `test_drift.py`, `test_portfolios.py`, `test_targets.py`, `test_rebalance.py`, `test_accounts.py`, `db_helpers.seed_user_classification`, and related modules updated for buckets / 2-ring drift.

---

## Done (frontend)

- **`api.ts`:** `ClassificationRow` / `ClassificationPatch` bucket model; taxonomy `sub_classes_by_class`; helpers `classificationPrimaryAssetClass`, `classificationDominantBucket`; leaner suggest / inline commit types.
- **UI:** `BucketEditor`, Radix **`Dialog`**, **`/classifications`** page (filters, table, edit/revert/delete); sidebar **Classifications**; **health-card** “Fix” → `/classifications`; **legacy/classifications** redirects to `/classifications`.
- **Flows:** **class-chip** PATCH single bucket + revalidate; **row** / **manual-grid** / **review-step** aligned; **donut-drill-panel** edit via dialog + global SWR mutate for classifications/allocation; **legacy** positions, manual, paste/import payloads aligned with bucket model (no obsolete flat fields in commit where removed).

---

## Not done yet

| Area | Items |
|------|--------|
| **Docs** | `docs/architecture.md` classification / look-through section; **CLAUDE.md** if stack line still mentions old look-through. |
| **Tests (optional)** | Dedicated **`test_seed_migration.py`** with reconciliation assertion (plan item)—not added yet. |
| **Manual QA** | Paste re-upload preserves user override; bucket editor single- vs multi-bucket (e.g. VT); allocation vs snapshot within tolerance. |

---

## Quick verify

```bash
docker compose exec app sh -c 'cd /app/backend && uv run pytest -q'
docker compose exec app sh -c 'cd /app/frontend && npm run build'
```
