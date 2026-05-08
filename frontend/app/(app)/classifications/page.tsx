"use client";

// Classifications for symbols you hold come from the merged API list (YAML ∪ DB).
// Tickers that are only unclassified may not appear here until classified elsewhere — separate flow.

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { mutate } from "swr";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  BucketEditor,
  normalizeBucketsForTaxonomy,
} from "@/app/components/bucket-editor";
import {
  api,
  classificationDominantBucket,
  type ClassificationBucketPayload,
  type ClassificationRow,
  type Position,
  type Taxonomy,
} from "@/app/lib/api";
import { cn } from "@/app/lib/utils";

function formatBucketsBrief(r: ClassificationRow): string {
  if (r.buckets.length === 0) return "—";
  if (r.has_breakdown && r.source !== "user") {
    const parts = r.buckets
      .slice(0, 3)
      .map(
        (b) =>
          `${Math.round(b.weight * 100)}% ${b.asset_class}${b.sub_class ? ` / ${b.sub_class}` : ""}`,
      );
    const extra = r.buckets.length > 3 ? ` +${r.buckets.length - 3}` : "";
    return `${parts.join(" · ")}${extra}`;
  }
  const d = classificationDominantBucket(r);
  return `${d.asset_class} · ${d.sub_class ?? "—"}`;
}

function bucketSum(buckets: ClassificationBucketPayload[]): number {
  return buckets.reduce((s, b) => s + b.weight, 0);
}

function ClassificationsPageInner() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [editTicker, setEditTicker] = useState<string | null>(null);
  const [editBuckets, setEditBuckets] = useState<ClassificationBucketPayload[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; message: string } | null>(
    null,
  );

  const { data: rows = [], error: rowsError } = useSWR<ClassificationRow[]>(
    "/api/classifications",
    api.classifications,
    { revalidateOnFocus: false },
  );

  const { data: positions = [], isLoading: positionsLoading } = useSWR<Position[]>(
    "/api/positions",
    api.positions,
    { revalidateOnFocus: false },
  );

  const { data: taxonomy } = useSWR<Taxonomy>("/api/classifications/taxonomy", api.taxonomy, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    const t = searchParams.get("ticker");
    if (t) setSearch(t);
  }, [searchParams]);

  const positionCountByTicker = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of positions) m.set(p.ticker, (m.get(p.ticker) ?? 0) + 1);
    return m;
  }, [positions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if ((positionCountByTicker.get(r.ticker) ?? 0) === 0) return false;
      if (q && !r.ticker.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, positionCountByTicker]);

  const hasAnyPositions = positions.length > 0;

  function startEdit(row: ClassificationRow) {
    if (!taxonomy) return;
    setEditTicker(row.ticker);
    setEditBuckets(
      normalizeBucketsForTaxonomy(row.buckets.map((b) => ({ ...b })), taxonomy),
    );
    setStatus(null);
  }

  function closeEdit() {
    setEditTicker(null);
    setEditBuckets([]);
  }

  async function saveEdit() {
    if (!editTicker || !taxonomy) return;
    const s = bucketSum(editBuckets);
    if (Math.abs(s - 1) > 0.02) {
      setStatus({
        kind: "err",
        message: "Bucket weights must sum to 100% (±2%).",
      });
      return;
    }
    setBusy(true);
    try {
      await api.patchClassification(editTicker, { buckets: editBuckets });
      setStatus({ kind: "ok", message: `Saved classification for ${editTicker}` });
      await mutate("/api/classifications");
      await mutate("/api/allocation");
      closeEdit();
    } catch (e) {
      setStatus({ kind: "err", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function revertToYaml(row: ClassificationRow) {
    const ok = window.confirm(
      `Revert ${row.ticker} to the bundled classification? Your override will be deleted.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteClassification(row.ticker);
      setStatus({ kind: "ok", message: `Reverted ${row.ticker} to catalog baseline` });
      await mutate("/api/classifications");
      await mutate("/api/allocation");
    } catch (e) {
      setStatus({ kind: "err", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function deleteUserTicker(row: ClassificationRow) {
    const ok = window.confirm(
      `Delete the classification for ${row.ticker}? This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteClassification(row.ticker);
      setStatus({ kind: "ok", message: `Deleted classification for ${row.ticker}` });
      await mutate("/api/classifications");
      await mutate("/api/allocation");
    } catch (e) {
      setStatus({ kind: "err", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 lg:px-6">
      <header className="flex flex-col gap-1">
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          Classifications
        </p>
        <h1 className="text-h2">Classifications</h1>
        <p className="text-body-sm text-muted-foreground">
          How each held symbol maps to asset classes and sub-classes. Edits apply
          portfolio-wide and drive allocation and drift; every number stays traceable.
        </p>
      </header>

      {rowsError && (
        <p className="text-body-sm text-destructive">{rowsError.message}</p>
      )}

      {positionsLoading ? (
        <p className="text-body-sm text-muted-foreground">Loading positions…</p>
      ) : !hasAnyPositions ? (
        <div className="rounded-md border border-border bg-muted/30 px-4 py-8 text-center">
          <p className="text-body-sm text-muted-foreground">
            No positions yet. Add holdings on Accounts, then classify them here.
          </p>
          <Button className="mt-4" variant="outline" asChild>
            <Link href="/accounts">Go to Accounts</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-label text-muted-foreground">Search ticker</span>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="VTI, BND, …"
                className="w-56"
              />
            </div>
            <span className="ml-auto text-body-sm text-muted-foreground">
              {filtered.length} held {filtered.length === 1 ? "symbol" : "symbols"}
            </span>
          </div>

          {status && (
            <p
              role="alert"
              className={cn(
                "rounded-md px-3 py-2 text-body-sm",
                status.kind === "ok"
                  ? "bg-success-soft text-success"
                  : "bg-destructive-soft text-destructive",
              )}
            >
              {status.message}
            </p>
          )}

          {hasAnyPositions && filtered.length === 0 && !rowsError && (
            <p className="text-body-sm text-muted-foreground">
              No matching held symbols{search.trim() ? ` for “${search.trim()}”` : ""}.
              Try another search, or check the dashboard if a ticker is still unclassified.
            </p>
          )}

          {filtered.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[640px] text-left text-body-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2 text-left text-label font-medium text-muted-foreground">
                      Ticker
                    </th>
                    <th className="px-3 py-2 text-left text-label font-medium text-muted-foreground">
                      Classification
                    </th>
                    <th className="px-3 py-2 text-right text-label font-medium text-muted-foreground">
                      Positions
                    </th>
                    <th className="px-3 py-2 text-left text-label font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const holdingCount = positionCountByTicker.get(r.ticker) ?? 0;
                    return (
                      <tr key={r.ticker} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 text-mono-sm tabular-nums text-foreground">
                          {r.ticker}
                        </td>
                        <td className="max-w-[min(420px,50vw)] px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {r.source === "user" && (
                              <span className="shrink-0 rounded bg-warning-soft px-2 py-0.5 text-label text-warning">
                                Adjusted
                              </span>
                            )}
                            <span
                              className="line-clamp-2 text-muted-foreground"
                              title={formatBucketsBrief(r)}
                            >
                              {r.has_breakdown && r.source !== "user" ? (
                                <span className="text-foreground">
                                  <span className="mr-1 text-muted-foreground" aria-hidden>
                                    ◇
                                  </span>
                                  Multi-bucket ({r.buckets.length}) —{" "}
                                  <span className="text-muted-foreground">
                                    {formatBucketsBrief(r)}
                                  </span>
                                </span>
                              ) : (
                                formatBucketsBrief(r)
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-mono-sm tabular-nums">
                          {holdingCount}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy || !taxonomy}
                              onClick={() => startEdit(r)}
                            >
                              Edit
                            </Button>
                            {r.source === "user" && r.overrides_yaml && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => revertToYaml(r)}
                              >
                                Revert
                              </Button>
                            )}
                            {r.source === "user" && !r.overrides_yaml && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                disabled={busy}
                                onClick={() => deleteUserTicker(r)}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <Dialog open={editTicker !== null} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-h3">
              Edit classification ·{" "}
              <span className="font-mono">{editTicker}</span>
            </DialogTitle>
            <DialogDescription className="text-body-sm">
              Replace all buckets for this ticker. Saves apply portfolio-wide.
            </DialogDescription>
          </DialogHeader>
          {taxonomy && (
            <BucketEditor
              buckets={editBuckets}
              taxonomy={taxonomy}
              disabled={busy}
              onChange={setEditBuckets}
            />
          )}
          <DialogFooter className="gap-3 sm:justify-end">
            <Button type="button" variant="outline" disabled={busy} onClick={closeEdit}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !taxonomy} onClick={() => void saveEdit()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ClassificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1200px] px-4 py-12 text-center text-body-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <ClassificationsPageInner />
    </Suspense>
  );
}
