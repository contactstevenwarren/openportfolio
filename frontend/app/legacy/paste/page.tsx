'use client';

// Paste review-and-confirm flow (docs/architecture.md extraction pipeline).
// User pastes broker text -> Extract -> rows land in the review table
// sorted by confidence ascending so the riskiest ones are on top ->
// user edits / deselects -> Commit persists selected rows with a
// provenance row per numeric field.

import { useEffect, useMemo, useState } from 'react';

import { PositionExtractReview } from '../components/PositionExtractReview';
import {
  api,
  type Account,
  type ClassificationSuggestItem,
  type ExtractedPosition,
  type Position,
  type Taxonomy,
} from '../../lib/api';
import { scrubPaste } from '../../lib/scrub';

export default function PastePage() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ExtractedPosition[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [accountPositions, setAccountPositions] = useState<Position[]>([]);
  const [removalsConfirmed, setRemovalsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [suggestionByTicker, setSuggestionByTicker] = useState<
    Record<string, ClassificationSuggestItem>
  >({});
  const [assetClassByIndex, setAssetClassByIndex] = useState<Record<number, string>>({});

  useEffect(() => {
    refreshAccounts();
  }, []);

  useEffect(() => {
    if (!replaceMode || accountId == null) {
      setAccountPositions([]);
      return;
    }
    let cancelled = false;
    api
      .positions(accountId)
      .then((list) => {
        if (!cancelled) setAccountPositions(list);
      })
      .catch(() => {
        if (!cancelled) setAccountPositions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [replaceMode, accountId]);

  const removalsPreview = useMemo(() => {
    if (!replaceMode || accountId == null || accountPositions.length === 0) return [];
    const selectedTickers = new Set(
      [...selected]
        .map((i) => rows[i]?.ticker.trim())
        .filter((t): t is string => Boolean(t)),
    );
    const out = new Set<string>();
    for (const p of accountPositions) {
      const t = p.ticker.trim();
      if (!selectedTickers.has(t)) out.add(t);
    }
    return [...out].sort();
  }, [replaceMode, accountId, accountPositions, selected, rows]);

  useEffect(() => {
    setRemovalsConfirmed(false);
  }, [removalsPreview.join('\0')]);

  useEffect(() => {
    if (!replaceMode) setRemovalsConfirmed(false);
  }, [replaceMode]);

  function refreshAccounts() {
    api
      .accounts()
      .then(setAccounts)
      .catch(() => {
        // Admin token not yet set or rejected; user can still try extract.
      });
  }

  async function refreshClassificationHintsFor(currentRows: ExtractedPosition[]) {
    const tickers = [...new Set(currentRows.map((r) => r.ticker.trim()).filter(Boolean))];
    if (tickers.length === 0) {
      setSuggestionByTicker({});
      setAssetClassByIndex({});
      return;
    }
    let tax = taxonomy;
    if (!tax) {
      tax = await api.taxonomy();
      setTaxonomy(tax);
    }
    const items = await api.suggestClassifications(tickers);
    const map: Record<string, ClassificationSuggestItem> = {};
    for (const it of items) {
      map[it.ticker] = it;
    }
    setSuggestionByTicker(map);
    const picks: Record<number, string> = {};
    currentRows.forEach((r, i) => {
      const s = map[r.ticker.trim()];
      if (s && (s.source === 'llm' || s.source === 'existing') && s.asset_class) {
        picks[i] = s.asset_class;
      } else {
        picks[i] = '';
      }
    });
    setAssetClassByIndex(picks);
  }

  async function handleExtract() {
    if (!text.trim()) return;
    setBusy(true);
    setStatus(null);
    const { text: scrubbed, redactions } = scrubPaste(text);
    try {
      const result = await api.extract(scrubbed);
      const sorted = [...result.positions].sort((a, b) => a.confidence - b.confidence);
      setRows(sorted);
      setSelected(new Set(sorted.map((_, i) => i)));
      let hintErr: string | null = null;
      try {
        await refreshClassificationHintsFor(sorted);
      } catch (e) {
        hintErr = (e as Error).message;
      }
      if (hintErr) {
        setStatus({
          kind: 'err',
          message: `Extract ok, but classification hints failed: ${hintErr}`,
        });
      } else if (redactions > 0) {
        setStatus({
          kind: 'ok',
          message: `Redacted ${redactions} digit run(s) of 6+ before sending (account numbers, SSNs, etc.).`,
        });
      }
    } catch (e) {
      setStatus({ kind: 'err', message: `Extract failed: ${(e as Error).message}` });
      setRows([]);
      setSelected(new Set());
      setSuggestionByTicker({});
      setAssetClassByIndex({});
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshHints() {
    if (rows.length === 0) return;
    setBusy(true);
    setStatus(null);
    try {
      await refreshClassificationHintsFor(rows);
      setStatus({ kind: 'ok', message: 'Classification hints refreshed.' });
    } catch (e) {
      setStatus({ kind: 'err', message: `Hints failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    setBusy(true);
    setStatus(null);
    try {
      if (!taxonomy) {
        setTaxonomy(await api.taxonomy());
      }
      const result = await api.commit({
        account_id: accountId,
        source: `paste:${new Date().toISOString().slice(0, 10)}`,
        ...(replaceMode ? { replace_account: true } : {}),
        positions: rows
          .map((r, i) => ({ r, i }))
          .filter(({ i }) => selected.has(i))
          .map(({ r, i }) => {
            const ac = assetClassByIndex[i]?.trim();
            const sug = suggestionByTicker[r.ticker.trim()];
            const base = {
              ticker: r.ticker,
              shares: r.shares,
              cost_basis: r.cost_basis,
              market_value: r.market_value,
              confidence: r.confidence,
              source_span: r.source_span,
            };
            if (!ac) {
              return base;
            }
            return {
              ...base,
              classification: {
                asset_class: ac,
                sub_class: null,
                sector: null,
                region: null,
                auto_suffix: false,
                suggestion_confidence: sug?.source === 'llm' ? sug.confidence ?? null : null,
                suggestion_reasoning: sug?.source === 'llm' ? sug.reasoning ?? null : null,
              },
            };
          }),
      });
      setStatus({
        kind: 'ok',
        message: `Committed ${result.position_ids.length} position(s) to account #${result.account_id}.`,
      });
      setRows([]);
      setSelected(new Set());
      setText('');
      setSuggestionByTicker({});
      setAssetClassByIndex({});
      setReplaceMode(false);
      setRemovalsConfirmed(false);
      setAccountPositions([]);
      refreshAccounts();
    } catch (e) {
      setStatus({ kind: 'err', message: `Commit failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  function updateRow(i: number, patch: Partial<ExtractedPosition>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const selectedCount = selected.size;
  const commitBlockedByReplace =
    replaceMode &&
    (accountId == null || (removalsPreview.length > 0 && !removalsConfirmed));
  const commitDisabled = busy || selectedCount === 0 || commitBlockedByReplace;

  return (
    <main style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <h1>Paste positions</h1>
      <p style={{ color: '#555' }}>
        Paste brokerage holdings below. Every row is reviewed before commit.
      </p>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <label>
          Account:{' '}
          <select
            value={accountId ?? ''}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              setAccountId(v);
              if (v == null) setReplaceMode(false);
            }}
          >
            <option value="">
              {accounts.length === 0 ? 'Default (auto-create)' : 'Default (auto-create if none)'}
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                #{a.id} {a.label} ({a.type})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={replaceMode}
            disabled={!accountId}
            onChange={(e) => setReplaceMode(e.target.checked)}
          />
          <span>Replace all holdings for selected account</span>
        </label>
        {!accountId && (
          <span style={{ color: '#666', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
            (select an account first)
          </span>
        )}
      </div>

      {replaceMode && accountId != null && removalsPreview.length > 0 && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.75rem',
            background: '#fff8e6',
            border: '1px solid #e6d08c',
            borderRadius: 4,
            fontSize: '0.9rem',
          }}
        >
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>
            These tickers will be removed from the account (not in your selected rows):
          </p>
          <p style={{ margin: '0 0 0.75rem', fontFamily: 'ui-monospace, monospace' }}>
            {removalsPreview.join(', ')}
          </p>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={removalsConfirmed}
              onChange={(e) => setRemovalsConfirmed(e.target.checked)}
            />
            <span>I understand these holdings will be deleted on commit.</span>
          </label>
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste brokerage positions here..."
        rows={10}
        style={{
          width: '100%',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '0.9rem',
          padding: '0.5rem',
          border: '1px solid #ccc',
          borderRadius: 4,
        }}
      />

      <div style={{ margin: '0.75rem 0' }}>
        <button onClick={handleExtract} disabled={busy || !text.trim()}>
          {busy ? 'Working...' : 'Extract'}
        </button>
      </div>

      {status && (
        <p
          role="alert"
          style={{
            color: status.kind === 'ok' ? 'green' : 'crimson',
            background: status.kind === 'ok' ? '#e7f5e8' : '#fde7ea',
            padding: '0.5rem 0.75rem',
            borderRadius: 4,
          }}
        >
          {status.message}
        </p>
      )}

      {rows.length > 0 && (
        <>
          <h2 style={{ marginTop: '1.5rem' }}>
            Review ({rows.length} row{rows.length === 1 ? '' : 's'}, sorted by confidence asc)
          </h2>
          <PositionExtractReview
            rows={rows}
            selected={selected}
            toggle={toggle}
            updateRow={updateRow}
            taxonomy={taxonomy}
            assetClassByIndex={assetClassByIndex}
            setAssetClassByIndex={setAssetClassByIndex}
            suggestionByTicker={suggestionByTicker}
            busy={busy}
            onRefreshHints={handleRefreshHints}
          >
            <div style={{ margin: '1rem 0' }}>
              <button onClick={handleCommit} disabled={commitDisabled}>
                {busy ? 'Working...' : `Commit ${selectedCount} row${selectedCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </PositionExtractReview>
        </>
      )}
    </main>
  );
}
