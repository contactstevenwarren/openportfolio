"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { mutate } from "swr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
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

type SourceFilter = "all" | "yaml" | "user";

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
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [showOnlyHoldings, setShowOnlyHoldings] = useState(false);
  const [editTicker, setEditTicker] = useState<string | null>(null);
  const [editBuckets, setEditBuckets] = useState<ClassificationBucketPayload[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; message: string } | null>(
    null,
  );
  const firstLoadRef = useRef(true);

  const { data: rows = [], error: rowsError } = useSWR<ClassificationRow[]>(
    "/api/classifications",
    api.classifications,
    { revalidateOnFocus: false },
  );

  const { data: positions = [] } = useSWR<Position[]>("/api/positions", api.positions, {
    revalidateOnFocus: false,
  });

  const { data: taxonomy } = useSWR<Taxonomy>("/api/classifications/taxonomy", api.taxonomy, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    const t = searchParams.get("ticker");
    if (t) setSearch(t);
  }, [searchParams]);

  useEffect(() => {
    if (firstLoadRef.current && positions.length > 0) {
      firstLoadRef.current = false;
      setShowOnlyHoldings(true);
    }
  }, [positions]);

  const positionCountByTicker = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of positions) m.set(p.ticker, (m.get(p.ticker) ?? 0) + 1);
    return m;
  }, [positions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
      if (q && !r.ticker.toLowerCase().includes(q)) return false;
      if (showOnlyHoldings && (positionCountByTicker.get(r.ticker) ?? 0) === 0)
        return false;
      return true;
    });
  }, [rows, search, sourceFilter, showOnlyHoldings, positionCountByTicker]);

  const userRowCount = rows.filter((r) => r.source === "user").length;

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
      setStatus({ kind: "ok", message: `Saved override for ${editTicker}` });
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
      setStatus({ kind: "ok", message: `Reverted ${row.ticker} to seed baseline` });
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
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Classifications</CardTitle>
          <CardDescription>
            Bundled seed weights per ticker, plus your overrides. Overrides drive the
            allocation donut and targets math.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rowsError && (
            <p className="text-body-sm text-destructive">{rowsError.message}</p>
          )}

          {rows.length > 0 && userRowCount === 0 && (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-body-sm text-muted-foreground">
              Showing {rows.length} tickers from the project seed. Edit a row to store
              an override in your database; overrides survive deploys.
            </p>
          )}

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
            <div className="flex flex-col gap-1">
              <span className="text-label text-muted-foreground">Source</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-body-sm"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
              >
                <option value="all">All ({rows.length})</option>
                <option value="user">Your overrides ({userRowCount})</option>
                <option value="yaml">Seed only ({rows.length - userRowCount})</option>
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 pb-1 text-body-sm">
              <input
                type="checkbox"
                checked={showOnlyHoldings}
                onChange={(e) => setShowOnlyHoldings(e.target.checked)}
              />
              Only my holdings
            </label>
            <span className="ml-auto text-body-sm text-muted-foreground">
              {filtered.length} shown
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

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] text-left text-body-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-label text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Ticker</th>
                  <th className="px-3 py-2 font-medium">Routing</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Holdings</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const holdingCount = positionCountByTicker.get(r.ticker) ?? 0;
                  return (
                    <tr key={r.ticker} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">{r.ticker}</td>
                      <td className="max-w-[420px] px-3 py-2 text-muted-foreground">
                        <span className="line-clamp-2" title={formatBucketsBrief(r)}>
                          {r.has_breakdown && r.source !== "user" ? (
                            <span className="text-foreground">
                              <span className="mr-1" aria-hidden>
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
                      </td>
                      <td className="px-3 py-2">
                        {r.source === "user" ? (
                          <span className="rounded bg-warning-soft px-2 py-0.5 text-label text-warning">
                            user{r.overrides_yaml ? " · overrides seed" : ""}
                          </span>
                        ) : (
                          <span className="rounded bg-muted px-2 py-0.5 text-label text-muted-foreground">
                            seed
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {holdingCount === 0 ? (
                          <span className="text-muted-foreground">0</span>
                        ) : (
                          <span>{holdingCount}</span>
                        )}
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
        </CardContent>
      </Card>

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
