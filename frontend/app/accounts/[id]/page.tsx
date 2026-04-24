'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { api, type Account } from '../../lib/api';
import { humanize } from '../../lib/labels';

export default function AccountDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const idNum = typeof rawId === 'string' ? Number(rawId) : NaN;
  const validId = Number.isInteger(idNum) && idNum > 0;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!validId) return;
    api
      .accounts()
      .then(setAccounts)
      .catch((e) => setLoadErr((e as Error).message));
  }, [validId]);

  const account = useMemo(
    () => (validId ? accounts.find((a) => a.id === idNum) : undefined),
    [accounts, validId, idNum],
  );

  if (!validId) {
    return (
      <main style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
        <h1>Account</h1>
        <p role="alert" style={{ color: 'crimson' }}>
          Invalid account id. Use a positive integer in the URL.
        </p>
        <p>
          <a href="/accounts">Back to accounts</a>
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <h1>Account #{idNum}</h1>
      {loadErr && (
        <p role="alert" style={{ color: 'crimson' }}>
          {loadErr}
        </p>
      )}
      {!loadErr && accounts.length > 0 && !account && (
        <p role="alert" style={{ color: 'crimson' }}>
          No account with id {idNum}.
        </p>
      )}
      {account && (
        <>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '0.5rem 1rem',
              margin: '1rem 0',
            }}
          >
            <dt style={{ fontWeight: 600 }}>Label</dt>
            <dd style={{ margin: 0 }}>{account.label}</dd>
            <dt style={{ fontWeight: 600 }}>Type</dt>
            <dd style={{ margin: 0 }} title={account.type}>
              {humanize(account.type)}
            </dd>
            <dt style={{ fontWeight: 600 }}>Currency</dt>
            <dd style={{ margin: 0 }}>{account.currency}</dd>
          </dl>
          <p style={{ margin: '1.25rem 0' }}>
            <a
              href={`/accounts/${idNum}/import`}
              style={{
                display: 'inline-block',
                padding: '0.6rem 1rem',
                background: '#111',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: 4,
                fontWeight: 600,
              }}
            >
              Import PDF statement
            </a>
          </p>
          <p>
            <a href={`/positions?account=${idNum}`} style={{ color: '#0066cc' }}>
              View positions for this account
            </a>
          </p>
        </>
      )}
      <p style={{ marginTop: '2rem' }}>
        <a href="/accounts">← All accounts</a>
      </p>
    </main>
  );
}
