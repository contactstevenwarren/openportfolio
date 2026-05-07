"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import type {
  ClassificationBucketPayload,
  Taxonomy,
} from "@/app/lib/api";

export type BucketEditorProps = {
  buckets: ClassificationBucketPayload[];
  taxonomy: Taxonomy;
  disabled?: boolean;
  onChange: (next: ClassificationBucketPayload[]) => void;
};

function bucketSum(buckets: ClassificationBucketPayload[]): number {
  return buckets.reduce((s, b) => s + (Number.isFinite(b.weight) ? b.weight : 0), 0);
}

function validSubClass(
  assetClass: string,
  subClass: string | null | undefined,
  taxonomy: Taxonomy,
): string {
  const opts = taxonomy.sub_classes_by_class[assetClass] ?? [];
  if (subClass && opts.some((o) => o.value === subClass)) return subClass;
  return opts[0]?.value ?? "";
}

/** Coerce buckets to valid taxonomy pairs when opening the editor (legacy rows). */
export function normalizeBucketsForTaxonomy(
  buckets: ClassificationBucketPayload[],
  taxonomy: Taxonomy,
): ClassificationBucketPayload[] {
  return buckets.map((b) => {
    const opts = taxonomy.sub_classes_by_class[b.asset_class] ?? [];
    let sub = validSubClass(b.asset_class, b.sub_class, taxonomy);
    if (!sub && opts[0]) sub = opts[0].value;
    return { ...b, sub_class: sub || null };
  });
}

export function BucketEditor({
  buckets,
  taxonomy,
  disabled,
  onChange,
}: BucketEditorProps) {
  const sum = bucketSum(buckets);
  const sumOk = Math.abs(sum - 1) <= 0.02;

  function update(
    index: number,
    patch: Partial<ClassificationBucketPayload>,
  ) {
    const next = buckets.map((b, i) => (i === index ? { ...b, ...patch } : b));
    onChange(next);
  }

  function addRow() {
    const ac = taxonomy.asset_classes[0]?.value ?? "Stocks";
    const sub =
      taxonomy.sub_classes_by_class[ac]?.[0]?.value ?? null;
    onChange([
      ...buckets,
      {
        asset_class: ac,
        sub_class: sub,
        weight: 0.1,
      },
    ]);
  }

  function removeRow(index: number) {
    if (buckets.length <= 1) return;
    onChange(buckets.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-2">
        {buckets.map((b, i) => {
          const subOptions = taxonomy.sub_classes_by_class[b.asset_class] ?? [];
          const subValue = validSubClass(b.asset_class, b.sub_class, taxonomy);
          return (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_minmax(5.5rem,7rem)_auto] items-end gap-3 rounded-md border border-border p-3"
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-label text-muted-foreground">
                  Asset class
                </label>
                <Select
                  disabled={disabled}
                  value={b.asset_class}
                  onValueChange={(ac) => {
                    const firstSub =
                      taxonomy.sub_classes_by_class[ac]?.[0]?.value ?? null;
                    update(i, {
                      asset_class: ac,
                      sub_class: firstSub,
                    });
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taxonomy.asset_classes.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-label text-muted-foreground">
                  Sub-class
                </label>
                <Select
                  disabled={disabled || subOptions.length === 0}
                  value={subValue}
                  onValueChange={(sc) =>
                    update(i, { sub_class: sc || null })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select sub-class" />
                  </SelectTrigger>
                  <SelectContent>
                    {subOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-label text-muted-foreground">
                  Weight (%)
                </label>
                <Input
                  type="number"
                  step={0.1}
                  min={0}
                  max={100}
                  className="font-mono tabular-nums"
                  disabled={disabled}
                  value={
                    Number.isFinite(b.weight)
                      ? Math.round(b.weight * 1000) / 10
                      : 0
                  }
                  onChange={(e) => {
                    const pct = parseFloat(e.target.value);
                    const clamped = Number.isFinite(pct)
                      ? Math.min(100, Math.max(0, pct))
                      : 0;
                    update(i, { weight: clamped / 100 });
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                disabled={disabled || buckets.length <= 1}
                aria-label="Remove bucket"
                onClick={() => removeRow(i)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={addRow}
        >
          <Plus className="mr-1 size-4" />
          Add bucket
        </Button>
        {sumOk ? (
          <p className="text-body-sm tabular-nums text-muted-foreground">
            Weights sum to {(sum * 100).toFixed(1)}%
          </p>
        ) : (
          <p
            role="status"
            className="inline-flex items-center gap-1.5 rounded-full bg-destructive-soft px-2.5 py-1 text-body-sm font-medium tabular-nums text-destructive"
          >
            <span aria-hidden>✕</span>
            {(sum * 100).toFixed(1)}% — must sum to 100% (±2%)
          </p>
        )}
      </div>

      <p className="text-body-sm text-muted-foreground">
        Each row routes a share of this ticker to an asset class and sub-class.
        Weights must sum to 100% (±2%).
      </p>
    </div>
  );
}
