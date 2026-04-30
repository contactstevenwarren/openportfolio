import { Provenance } from "@/app/lib/provenance";

import {
  daysSince,
  formatPct,
  formatUsd,
  getStaleAccounts,
  mockAccounts,
  mockInvestable,
  mockNetWorth,
} from "../mocks";

export function HeroSection() {
  const { total, prevTotal, asOf, freshness } = mockNetWorth;
  const hasDelta = prevTotal != null && prevTotal !== total;
  const deltaUsd = hasDelta ? total - prevTotal : 0;
  const deltaPct = hasDelta ? deltaUsd / prevTotal : 0;
  const positive = deltaUsd > 0;
  const deltaTone = positive ? "text-success" : "text-destructive";
  const deltaGlyph = positive ? "↗" : "↘";
  const asOfLabel = new Date(asOf).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const investablePct = total > 0 ? mockInvestable.total / total : 0;

  const stale = getStaleAccounts(mockAccounts);
  const staleCount = stale.length;
  const oldestDays = staleCount > 0 ? daysSince(stale[0].freshness.capturedAt!) : 0;
  const freshCount = mockAccounts.length - staleCount;

  return (
    <section className="grid grid-cols-1 gap-6 px-1 py-2 @lg/main:grid-cols-12">
      <div className="flex flex-col gap-2 @lg/main:col-span-6">
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          Net worth
        </p>
        <p className="text-display font-mono tabular-nums">
          <Provenance
            source={freshness.source}
            confidence={freshness.confidence}
            capturedAt={freshness.capturedAt}
          >
            {formatUsd(total)}
          </Provenance>
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {hasDelta ? (
            <span className={`text-body font-mono tabular-nums ${deltaTone}`}>
              <Provenance
                source={freshness.source}
                confidence={freshness.confidence}
                capturedAt={freshness.capturedAt}
              >
                {formatUsd(deltaUsd, { signed: true })} ·{" "}
                {formatPct(deltaPct, { signed: true, digits: 2 })}{" "}
                <span aria-hidden>{deltaGlyph}</span>
              </Provenance>
            </span>
          ) : null}
          <span className="text-label text-muted-foreground">As of {asOfLabel}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 @lg/main:col-span-3 @lg/main:border-l @lg/main:border-border @lg/main:pl-6">
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          Investable portfolio
        </p>
        <p className="text-h2 font-mono tabular-nums leading-tight">
          <Provenance
            source={mockInvestable.freshness.source}
            confidence={mockInvestable.freshness.confidence}
            capturedAt={mockInvestable.freshness.capturedAt}
          >
            {formatUsd(mockInvestable.total)}
          </Provenance>
        </p>
        <p className="text-body-sm text-muted-foreground">
          {formatPct(investablePct, { digits: 0 })} of net worth
        </p>
      </div>

      <div className="flex flex-col gap-2 @lg/main:col-span-3 @lg/main:border-l @lg/main:border-border @lg/main:pl-6">
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          Status
        </p>
        <div>
          {staleCount === 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-body-sm font-medium text-success">
              <span aria-hidden>▲</span>
              <span>All accounts fresh</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-body-sm font-medium text-warning">
              <span aria-hidden>●</span>
              <span>
                {staleCount} stale · oldest {oldestDays}d
              </span>
            </span>
          )}
        </div>
        <p className="text-body-sm text-muted-foreground">
          {freshCount} of {mockAccounts.length} accounts fresh
        </p>
      </div>
    </section>
  );
}
