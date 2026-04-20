'use client';

// Accounts page: list + create + edit + delete.
// v0.1.5 M2 drops the hardcoded TYPE_OPTIONS dropdown in favor of a
// free-form text input backed by a datalist of types the user has
// already used. Edit and delete live inline per row; delete cascades
// positions (confirmed on the server via schema-level ondelete=CASCADE).

import { useEffect, useState } from 'react';

import { api, type Account } from '../lib/api';
import { humanize } from '../lib/labels';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [label, setLabel] = useState('');
  const [type, setType] = useState('brokerage');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editType, setEditType] = useState('');

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    api
      .accounts()
      .then(setAccounts)
      .catch((e) => setStatus({ kind: 'err', message: (e as Error).message }));
  }

  // Distinct types already in the DB, used as datalist suggestions so
  // the free-form input still offers the common values as autocomplete.
  const knownTypes = Array.from(new Set(accounts.map((a) => a.type))).sort();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !type.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.createAccount({ label: label.trim(), type: type.trim() });
      setLabel('');
      setType('brokerage');
      setStatus({ kind: 'ok', message: `Created "${label.trim()}"` });
      refresh();
    } catch (e) {
      setStatus({ kind: 'err', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(a: Account) {
    setEditingId(a.id);
    setEditLabel(a.label);
    setEditType(a.type);
    setStatus(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel('');
    setEditType('');
  }

  async function handleSaveEdit(id: number) {
    if (!editLabel.trim() || !editType.trim()) return;
    setBusy(true);
    try {
      await api.patchAccount(id, { label: editLabel.trim(), type: editType.trim() });
      setStatus({ kind: 'ok', message: `Updated account #${id}` });
      cancelEdit();
      refresh();
    } catch (e) {
      setStatus({ kind: 'err', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(a: Account) {
    const ok = window.confirm(
      `Delete account "${a.label}"? All positions in this account will be deleted too. This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteAccount(a.id);
      setStatus({ kind: 'ok', message: `Deleted "${a.label}"` });
      refresh();
    } catch (e) {
      setStatus({ kind: 'err', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <h1>Accounts</h1>
      <p style={{ color: '#555' }}>
        Labeled buckets for each brokerage, HSA, or non-brokerage pool. Edit or delete
        an account inline; deleting an account also deletes its positions.
      </p>

      <form
        onSubmit={handleCreate}
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'end',
          margin: '1rem 0 1.5rem',
          padding: '1rem',
          border: '1px solid #ddd',
          borderRadius: 4,
          background: '#fafafa',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.85rem' }}>Label</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Fidelity Taxable"
            style={{ padding: '0.4rem 0.5rem', width: 240 }}
            required
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.85rem' }}>Type</span>
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="brokerage, hsa, 401k, real_estate, ..."
            list="account-types"
            style={{ padding: '0.4rem 0.5rem', width: 220 }}
            required
          />
          <datalist id="account-types">
            {knownTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <button type="submit" disabled={busy || !label.trim() || !type.trim()}>
          {busy ? 'Working...' : 'Create account'}
        </button>
      </form>

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

      <h2 style={{ fontSize: '1.1rem' }}>
        {accounts.length} account{accounts.length === 1 ? '' : 's'}
      </h2>
      {accounts.length === 0 ? (
        <p style={{ color: '#555' }}>
          None yet. Create one above, or skip and the first /paste commit will auto-create
          "Default".
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
              <th style={th}>#</th>
              <th style={th}>Label</th>
              <th style={th}>Type</th>
              <th style={th}>Currency</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const isEditing = editingId === a.id;
              return (
                <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={td}>{a.id}</td>
                  <td style={td}>
                    {isEditing ? (
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        style={{ padding: '0.3rem 0.4rem', width: 220 }}
                      />
                    ) : (
                      a.label
                    )}
                  </td>
                  <td style={td}>
                    {isEditing ? (
                      <>
                        <input
                          value={editType}
                          onChange={(e) => setEditType(e.target.value)}
                          list="account-types"
                          style={{ padding: '0.3rem 0.4rem', width: 180 }}
                        />
                      </>
                    ) : (
                      <span title={a.type}>{humanize(a.type)}</span>
                    )}
                  </td>
                  <td style={td}>{a.currency}</td>
                  <td style={td}>
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(a.id)}
                          disabled={busy || !editLabel.trim() || !editType.trim()}
                        >
                          Save
                        </button>{' '}
                        <button type="button" onClick={cancelEdit} disabled={busy}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEdit(a)} disabled={busy}>
                          Edit
                        </button>{' '}
                        <button
                          type="button"
                          onClick={() => handleDelete(a)}
                          disabled={busy}
                          style={{ color: 'crimson' }}
                        >
                          Delete
                        </button>
                        <div style={{ marginTop: 4 }}>
                          <a
                            href={`/positions?account=${a.id}`}
                            style={{
                              fontSize: '0.75rem',
                              color: '#0066cc',
                              textDecoration: 'none',
                            }}
                          >
                            View positions
                          </a>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}

const th = { padding: '0.5rem 0.25rem', fontWeight: 600 };
const td = { padding: '0.5rem 0.25rem' };
