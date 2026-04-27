import Link from "next/link";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Provenance } from "@/app/lib/provenance";
import {
  ASSET_CLASS_COLOR,
  formatPct,
  formatUsd,
  mockHoldings,
  type Freshness,
} from "../mocks";

const FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Maps a Freshness record to a tone — drives the freshness dot color.
// snapshot/yfinance within ~7d → emerald; older → amber; user → muted slate.
function freshnessTone(f: Freshness): "fresh" | "stale" | "user" {
  if (f.source === "user") return "user";
  if (f.capturedAt) {
    const ageMs = Date.now() - new Date(f.capturedAt).getTime();
    if (ageMs > FRESH_WINDOW_MS) return "stale";
  }
  return "fresh";
}

const TONE_CLASS: Record<"fresh" | "stale" | "user", string> = {
  fresh: "bg-emerald-500",
  stale: "bg-amber-500",
  user: "bg-slate-400",
};

function FreshnessDot({ freshness }: { freshness: Freshness }) {
  const tone = freshnessTone(freshness);
  return (
    <span
      aria-hidden
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${TONE_CLASS[tone]}`}
    />
  );
}

export function HoldingsCard() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-h3">Top holdings</CardTitle>
        <CardDescription>Largest positions by value</CardDescription>
        <CardAction>
          <Link
            href="/legacy/positions"
            className="text-body-sm text-muted-foreground hover:text-foreground"
          >
            View all →
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div
          role="table"
          className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-x-4 gap-y-1"
        >
          {mockHoldings.map((h) => {
            const color = ASSET_CLASS_COLOR[h.class];
            return (
              <div
                key={h.ticker}
                role="row"
                className="contents"
              >
                <span
                  role="cell"
                  className="text-mono-sm tabular-nums text-foreground"
                >
                  {h.ticker}
                </span>
                <span
                  role="cell"
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-label"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
                    color: "var(--foreground)",
                  }}
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {h.classLabel}
                </span>
                <span
                  role="cell"
                  className="flex items-center justify-end gap-1.5 text-mono-sm tabular-nums text-foreground"
                >
                  <FreshnessDot freshness={h.freshness} />
                  <Provenance
                    source={h.freshness.source}
                    confidence={h.freshness.confidence}
                    capturedAt={h.freshness.capturedAt}
                  >
                    {formatUsd(h.value)}
                  </Provenance>
                </span>
                <span
                  role="cell"
                  className="text-mono-sm tabular-nums text-muted-foreground"
                >
                  <Provenance
                    source={h.freshness.source}
                    confidence={h.freshness.confidence}
                    capturedAt={h.freshness.capturedAt}
                  >
                    {formatPct(h.pctOfNw)}
                  </Provenance>
                </span>
                <span
                  role="cell"
                  className="max-w-[8rem] truncate text-body-sm text-muted-foreground"
                  title={h.account}
                >
                  {h.account}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
