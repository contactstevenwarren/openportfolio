'use client';

// Accounts page: list + create labeled buckets. v0.1 has no edit/delete --
// auto-seeded Default works for solo use; power users can curate types.
// Paste flow picks the account via dropdown on /paste; manual entry (non-
// brokerage) also targets a bucket.

import { useEffect, useState } from 'react';

import { api, type Account } from '../lib/api';

const TYPE_OPTIONS = [
  'brokerage',
  'hsa',
  'ira',
  'roth_ira',
  '401k',
  '529',
  'real_estate',
  'crypto',
  'private',
  'cash',
];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [label, setLabel] = useState('');
  const [type, setType] = useState('brokerage');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    api
      .accounts()
      .then(setAccounts)
      .catch((e) => setStatus({ kind: 'err', message: (e as Error).message }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.createAccount({ label: label.trim(), type });
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

  return (
    <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <h1>Accounts</h1>
      <p style={{ color: '#555' }}>
        Labeled buckets for each brokerage, HSA, or non-brokerage pool. The /paste flow
        commits rows to the selected account.
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
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{ padding: '0.4rem 0.5rem' }}
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy || !label.trim()}>
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
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={td}>{a.id}</td>
                <td style={td}>{a.label}</td>
                <td style={td}>{a.type}</td>
                <td style={td}>{a.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

const th = { padding: '0.5rem 0.25rem', fontWeight: 600 };
const td = { padding: '0.5rem 0.25rem' };
