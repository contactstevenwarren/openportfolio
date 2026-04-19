// Wraps a user-visible value with a tooltip showing its provenance
// (source, confidence, capture time). Every number on screen is
// supposed to carry one of these per roadmap Principles
// "every number shows provenance." In v0.1 we use the native `title`
// attribute -- zero dependency, works on mouse hover. M3+ may upgrade
// to a richer hover card.

import type { ReactNode } from 'react';

export type ProvenanceProps = {
  source: string;
  confidence?: number | null;
  capturedAt?: string | null;
  children: ReactNode;
};

export function Provenance({ source, confidence, capturedAt, children }: ProvenanceProps) {
  const lines = [`source: ${source}`];
  if (confidence != null) lines.push(`confidence: ${(confidence * 100).toFixed(0)}%`);
  if (capturedAt) lines.push(`captured: ${capturedAt}`);
  return (
    <span
      title={lines.join('\n')}
      style={{ borderBottom: '1px dotted #888', cursor: 'help' }}
    >
      {children}
    </span>
  );
}
