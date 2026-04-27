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
  mockExposures,
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

export function ExposuresCard() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-h3">Effective exposures</CardTitle>
        <CardDescription>Including ETF look-through</CardDescription>
        <CardAction>
          <Link
            href="/legacy/positions"
            className="text-body-sm text-muted-foreground hover:text-foreground"
          >
            Learn how →
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {mockExposures.map((e) => (
            <li
              key={e.class}
              className="flex items-center gap-3"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: ASSET_CLASS_COLOR[e.class] }}
              />
              <span className="flex-1 truncate text-body-sm text-foreground">
                {e.label}
              </span>
              <span className="flex items-center gap-1.5 text-mono-sm tabular-nums text-foreground">
                <Provenance
                  source={e.freshness.source}
                  confidence={e.freshness.confidence}
                  capturedAt={e.freshness.capturedAt}
                >
                  {formatPct(e.pct)}
                </Provenance>
                <FreshnessDot freshness={e.freshness} />
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
