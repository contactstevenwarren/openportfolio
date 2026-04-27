import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Provenance } from "@/app/lib/provenance";

import { formatPct, formatUsd, mockNetWorth } from "../mocks";

export function HeroSection() {
  const { total, prevTotal, asOf, freshness } = mockNetWorth;
  const hasDelta = prevTotal != null && prevTotal !== total;
  const deltaUsd = hasDelta ? total - prevTotal : 0;
  const deltaPct = hasDelta ? deltaUsd / prevTotal : 0;
  const positive = deltaUsd > 0;
  const sentiment = positive
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
  const Arrow = positive ? ArrowUpRight : ArrowDownRight;
  const asOfLabel = new Date(asOf).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <section className="flex flex-col gap-2 px-1 py-2">
      <p className="text-label uppercase tracking-wide text-muted-foreground">
        Net worth
      </p>
      <p className="text-display font-mono">
        <Provenance
          source={freshness.source}
          confidence={freshness.confidence}
          capturedAt={freshness.capturedAt}
        >
          {formatUsd(total)}
        </Provenance>
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-body">
        {hasDelta ? (
          <span className={`inline-flex items-center gap-1 font-mono ${sentiment}`}>
            <Provenance
              source={freshness.source}
              confidence={freshness.confidence}
              capturedAt={freshness.capturedAt}
            >
              {formatUsd(deltaUsd, { signed: true })} · {formatPct(deltaPct, { signed: true, digits: 2 })}
            </Provenance>
            <Arrow className="size-4" aria-hidden />
          </span>
        ) : (
          <span />
        )}
        <span className="text-label text-muted-foreground">As of {asOfLabel}</span>
      </div>
    </section>
  );
}
