'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { PositionExtractReview } from '../../../../components/PositionExtractReview';
import { strongLabelMatch } from '../../../../lib/accountLabelMatch';
import {
  api,
  type Account,
  type ClassificationSuggestItem,
  type ExtractedPosition,
  type Position,
  type Taxonomy,
} from '../../../../lib/api';
import {
  clearPdfImportDraft,
  consumePdfImportDraftIfPending,
  pdfImportMetaFromExtractionResult,
  stashPdfImportDraftForRouteChange,
  type PdfImportDraftMeta,
} from '../../../../lib/pdfImportDraft';

function sourcePdfString(filename: string, extractedAt: string): string {
  const safeName = filename.replace(/[^\w.\-]+/g, '_').slice(0, 200) || 'statement';
  const date = extractedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `pdf:${safeName}:${date}`;
}

export default function AccountPdfImportPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id;
  const routeAccountId = typeof rawId === 'string' ? Number(rawId) : NaN;
  const validRouteId = Number.isInteger(routeAccountId) && routeAccountId > 0;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsErr, setAccountsErr] = useState<string | null>(null);

  const [rows, setRows] = useState<ExtractedPosition[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filename, setFilename] = useState('');
  const [meta, setMeta] = useState<PdfImportDraftMeta | null>(null);

  const [accountPositions, setAccountPositions] = useState<Position[]>([]);
  const [removalsConfirmed, setRemovalsConfirmed] = useState(false);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [suggestionByTicker, setSuggestionByTicker] = useState<
    Record<string, ClassificationSuggestItem>
  >({});
  const [assetClassByIndex, setAssetClassByIndex] = useState<Record<number, string>>({});

  const [dismissMatchedBanner, setDismissMatchedBanner] = useState(false);
  const [dismissNameMismatchBanner, setDismissNameMismatchBanner] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  const currentAccount = useMemo(
    () => (validRouteId ? accounts.find((a) => a.id === routeAccountId) : undefined),
    [accounts, validRouteId, routeAccountId],
  );

  const knownTypes = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.type))).sort(),
    [accounts],
  );

  // Restore draft after router.replace remount
  useEffect(() => {
    const draft = consumePdfImportDraftIfPending();
    if (!draft) return;
    setRows(draft.rows);
    setSelected(new Set(draft.selectedIndices));
    setFilename(draft.filename);
    setMeta(draft.meta);
    setDismissMatchedBanner(false);
    setDismissNameMismatchBanner(false);
    void refreshClassificationHintsFor(draft.rows).catch(() => {});
  }, []);

  useEffect(() => {
    if (!validRouteId) return;
    api
      .accounts()
      .then((list) => {
        setAccounts(list);
        setAccountsErr(null);
      })
      .catch((e) => setAccountsErr((e as Error).message));
  }, [validRouteId]);

  useEffect(() => {
    if (!validRouteId) {
      setAccountPositions([]);
      return;
    }
    let cancelled = false;
    api
      .positions(routeAccountId)
      .then((list) => {
        if (!cancelled) setAccountPositions(list);
      })
      .catch(() => {
        if (!cancelled) setAccountPositions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [validRouteId, routeAccountId]);

  const removalsPreview = useMemo(() => {
    if (!validRouteId || accountPositions.length === 0) return [];
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
  }, [validRouteId, accountPositions, selected, rows]);

  useEffect(() => {
    setRemovalsConfirmed(false);
  }, [removalsPreview.join('\0')]);

  const matchedOther =
    meta?.matched_account_id != null &&
    meta.matched_account_id !== routeAccountId &&
    !dismissMatchedBanner;

  const stmtName = (meta?.statement_account_name ?? '').trim();
  const nameMismatch =
    stmtName.length > 0 &&
    currentAccount &&
    !strongLabelMatch(stmtName, currentAccount.label) &&
    !dismissNameMismatchBanner;

  function persistForNavigation() {
    if (rows.length === 0) return;
    if (!meta) return;
    stashPdfImportDraftForRouteChange({
      rows,
      selectedIndices: [...selected],
      filename,
      meta,
    });
  }

  function goAccount(newId: number) {
    persistForNavigation();
    router.replace(`/accounts/${newId}/import`);
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

  async function runExtract(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setStatus({ kind: 'err', message: 'Choose a .pdf file.' });
      return;
    }
    setBusy(true);
    setStatus(null);
    setDismissMatchedBanner(false);
    setDismissNameMismatchBanner(false);
    try {
      const result = await api.extractPdf(file);
      const sorted = [...result.positions].sort((a, b) => a.confidence - b.confidence);
      setRows(sorted);
      setSelected(new Set(sorted.map((_, i) => i)));
      setFilename(file.name);
      setMeta(pdfImportMetaFromExtractionResult(result));
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
      }
    } catch (e) {
      setStatus({ kind: 'err', message: `Extract failed: ${(e as Error).message}` });
      setRows([]);
      setSelected(new Set());
      setFilename('');
      setMeta(null);
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
    if (!validRouteId || !meta) return;
    setBusy(true);
    setStatus(null);
    try {
      if (!taxonomy) {
        setTaxonomy(await api.taxonomy());
      }
      const result = await api.commit({
        account_id: routeAccountId,
        source: sourcePdfString(filename, meta.extracted_at),
        replace_account: true,
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
        message: `Committed ${result.position_ids.length} position(s); replace mode applied on account #${result.account_id}.`,
      });
      setRows([]);
      setSelected(new Set());
      setFilename('');
      setMeta(null);
      setSuggestionByTicker({});
      setAssetClassByIndex({});
      setRemovalsConfirmed(false);
      setAccountPositions([]);
      clearPdfImportDraft();
      api.accounts().then(setAccounts).catch(() => {});
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

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim() || !newType.trim()) return;
    setCreateBusy(true);
    try {
      const created = await api.createAccount({ label: newLabel.trim(), type: newType.trim() });
      setShowCreateModal(false);
      setNewLabel('');
      setNewType('');
      persistForNavigation();
      router.replace(`/accounts/${created.id}/import`);
      api.accounts().then(setAccounts).catch(() => {});
    } catch (e) {
      setStatus({ kind: 'err', message: (e as Error).message });
    } finally {
      setCreateBusy(false);
    }
  }

  function openCreateModal() {
    const pre = (meta?.statement_account_name ?? '').trim();
    setNewLabel(pre);
    setNewType('');
    setShowCreateModal(true);
  }

  const selectedCount = selected.size;
  const commitBlockedByReplace =
    validRouteId && (removalsPreview.length > 0 && !removalsConfirmed);
  const commitDisabled = busy || selectedCount === 0 || !validRouteId || !meta || commitBlockedByReplace;

  if (!validRouteId) {
    return (
      <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
        <h1>Import PDF</h1>
        <p role="alert" style={{ color: 'crimson' }}>
          Invalid account id in URL.
        </p>
        <a href="/accounts">Accounts</a>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <h1>Import PDF statement</h1>
      <p style={{ color: '#555' }}>
        Account-scoped import with replace mode: approved rows replace holdings for this account;
        tickers you leave unchecked can be removed after confirmation.
      </p>

      <p style={{ marginBottom: '0.75rem' }}>
        <a href={`/accounts/${routeAccountId}`}>← Account #{routeAccountId}</a>
        {' · '}
        <a href={`/positions?account=${routeAccountId}`}>Positions</a>
      </p>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <label>
          Target account:{' '}
          <select
            value={routeAccountId}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v !== routeAccountId) goAccount(v);
            }}
            disabled={accounts.length === 0}
          >
            {accounts.length === 0 ? (
              <option value={routeAccountId}>#{routeAccountId} (loading…)</option>
            ) : (
              accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  #{a.id} {a.label} ({a.type})
                </option>
              ))
            )}
          </select>
        </label>
        {accountsErr && (
          <span style={{ color: 'crimson', fontSize: '0.85rem' }}>{accountsErr}</span>
        )}
      </div>

      {matchedOther && meta?.matched_account_id != null && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.75rem',
            background: '#e8f4ff',
            border: '1px solid #9cc',
            borderRadius: 4,
            fontSize: '0.9rem',
          }}
        >
          <p style={{ margin: '0 0 0.5rem' }}>
            The extract suggests this statement may belong to account #{meta.matched_account_id}
            {meta.matched_account_confidence != null &&
              ` (${(meta.matched_account_confidence * 100).toFixed(0)}% confidence)`}
            .
          </p>
          <button type="button" onClick={() => goAccount(meta.matched_account_id!)} disabled={busy}>
            Switch to suggested account
          </button>{' '}
          <button type="button" onClick={() => setDismissMatchedBanner(true)} disabled={busy}>
            Ignore (keep #{routeAccountId})
          </button>
        </div>
      )}

      {nameMismatch && currentAccount && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.75rem',
            background: '#fff4e6',
            border: '1px solid #e6c08c',
            borderRadius: 4,
            fontSize: '0.9rem',
          }}
        >
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>Statement name vs account label</p>
          <p style={{ margin: '0 0 0.75rem' }}>
            Statement account name &quot;{stmtName}&quot; does not strongly match this account&apos;s
            label &quot;{currentAccount.label}&quot;. Confirm you are importing into the right bucket.
          </p>
          <button type="button" onClick={() => setDismissNameMismatchBanner(true)}>
            Continue with #{routeAccountId}
          </button>{' '}
          <button type="button" onClick={openCreateModal}>
            Create new account…
          </button>
          <span style={{ marginLeft: '0.5rem', color: '#555' }}>
            Or pick another account in the dropdown above.
          </span>
        </div>
      )}

      {meta?.extraction_warnings && meta.extraction_warnings.length > 0 && (
        <div
          role="status"
          style={{
            marginBottom: '0.75rem',
            padding: '0.75rem',
            background: '#fffbe6',
            border: '1px solid #e6d08c',
            borderRadius: 4,
            fontSize: '0.9rem',
          }}
        >
          <strong>Extraction warnings</strong>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
            {meta.extraction_warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {removalsPreview.length > 0 && (
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

      <PdfDropZone busy={busy} onFile={(f) => void runExtract(f)} />

      {status && (
        <p
          role="alert"
          style={{
            marginTop: '0.75rem',
            color: status.kind === 'ok' ? 'green' : 'crimson',
            background: status.kind === 'ok' ? '#e7f5e8' : '#fde7ea',
            padding: '0.5rem 0.75rem',
            borderRadius: 4,
          }}
        >
          {status.message}
        </p>
      )}

      {rows.length > 0 && meta && (
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
              <button onClick={() => void handleCommit()} disabled={commitDisabled}>
                {busy ? 'Working...' : `Commit ${selectedCount} row${selectedCount === 1 ? '' : 's'} (replace account)`}
              </button>
            </div>
          </PositionExtractReview>
        </>
      )}

      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <form
            onSubmit={handleCreateAccount}
            style={{
              background: '#fff',
              padding: '1.25rem',
              borderRadius: 8,
              minWidth: 320,
              maxWidth: 420,
              boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            }}
          >
            <h2 style={{ marginTop: 0 }}>Create account</h2>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem' }}>Label</span>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                required
                style={{ padding: '0.4rem 0.5rem' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.85rem' }}>Type (required)</span>
              <input
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                list="import-account-types"
                placeholder="brokerage, hsa, 401k, …"
                required
                style={{ padding: '0.4rem 0.5rem' }}
              />
              <datalist id="import-account-types">
                {knownTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowCreateModal(false)} disabled={createBusy}>
                Cancel
              </button>
              <button type="submit" disabled={createBusy || !newLabel.trim() || !newType.trim()}>
                {createBusy ? 'Working…' : 'Create and switch'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function PdfDropZone({ busy, onFile }: { busy: boolean; onFile: (f: File) => void }) {
  const [highlight, setHighlight] = useState(false);
  const depth = useRef(0);

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setHighlight(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) {
          setHighlight(false);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setHighlight(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      style={{
        border: `2px dashed ${highlight ? '#0066cc' : '#ccc'}`,
        borderRadius: 8,
        padding: '2rem',
        textAlign: 'center',
        background: highlight ? '#f0f7ff' : '#fafafa',
      }}
    >
      <p style={{ margin: '0 0 0.75rem' }}>Drag and drop a brokerage statement PDF here</p>
      <label style={{ cursor: busy ? 'wait' : 'pointer' }}>
        <input
          type="file"
          accept=".pdf,application/pdf"
          disabled={busy}
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
        <span
          style={{
            display: 'inline-block',
            padding: '0.5rem 1rem',
            background: '#eee',
            borderRadius: 4,
            border: '1px solid #ccc',
          }}
        >
          {busy ? 'Working…' : 'Choose PDF file'}
        </span>
      </label>
    </div>
  );
}
