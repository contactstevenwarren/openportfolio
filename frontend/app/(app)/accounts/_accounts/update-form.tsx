"use client";

// Tabbed update form shared by both trigger paths:
//   - row.tsx UpdateSheet (upload icon, stale pill, Update button, drag-drop)
//   - header.tsx Update Sheet (after saving a new account)
//
// Parent is responsible for the SheetFooter (Cancel + Continue / Cancel-only)
// so it can control button placement consistently. The form exposes
// `isContinueDisabled` and an `onContinue` callback for the parent to wire.

import { useState, useEffect, useRef, Fragment } from "react";
import { UploadIcon, FileIcon, PlusIcon, XIcon, ArrowLeftIcon } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/app/components/ui/tabs";
import { cn } from "@/app/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UpdateMode = "pdf" | "paste" | "manual";
type Stage = "entry" | "submitted";

type ManualRow = { id: string; label: string; qty: string; value: string };

export type UpdateFormHandle = {
  isContinueDisabled: boolean;
};

export type UpdateFormProps = {
  initialMode?: UpdateMode;
  autoSubmit?: boolean;
  initialFile?: File | null;
  // Parent wires these to its SheetFooter Continue button.
  onContinueDisabledChange: (disabled: boolean) => void;
  onContinue: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function newRow(): ManualRow {
  return { id: crypto.randomUUID(), label: "", qty: "", value: "" };
}

// ── UpdateForm ────────────────────────────────────────────────────────────────

export function UpdateForm({
  initialMode = "pdf",
  autoSubmit = false,
  initialFile = null,
  onContinueDisabledChange,
  onContinue,
}: UpdateFormProps) {
  // ── Stages ──────────────────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>(autoSubmit ? "submitted" : "entry");
  const [mode, setMode] = useState<UpdateMode>(initialMode);

  // ── Per-mode state (persists across tab switches) ──────────────────────────
  const [pickedFile, setPickedFile] = useState<File | null>(initialFile ?? null);
  const [pasted, setPasted] = useState("");
  const [rows, setRows] = useState<ManualRow[]>([newRow()]);

  // Sync autoSubmit / initialFile if parent re-opens the sheet with new values.
  useEffect(() => {
    setStage(autoSubmit ? "submitted" : "entry");
    setMode(initialMode);
    setPickedFile(initialFile ?? null);
    // intentionally not resetting pasted/rows — they are empty on fresh open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit, initialMode, initialFile]);

  // ── Continue disabled state ─────────────────────────────────────────────────
  const isContinueDisabled =
    stage === "submitted" ||
    (mode === "pdf"    && pickedFile === null) ||
    (mode === "paste"  && pasted.trim() === "") ||
    (mode === "manual" && rows.every((r) => r.value.trim() === ""));

  useEffect(() => {
    onContinueDisabledChange(isContinueDisabled);
  }, [isContinueDisabled, onContinueDisabledChange]);

  // Wire parent's onContinue to advance our stage.
  // The parent calls this when the user clicks Continue.
  function handleContinue() {
    setStage("submitted");
    onContinue();
  }

  // ── PDF tab helpers ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDropzoneDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setPickedFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file) setPickedFile(file);
    // Reset input so selecting the same file again triggers onChange.
    e.target.value = "";
  }

  // ── Manual tab helpers ──────────────────────────────────────────────────────
  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(id: string) {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length > 0 ? next : [newRow()];
    });
  }

  function updateRow(id: string, field: keyof Omit<ManualRow, "id">, val: string) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }

  const inputCls =
    "w-full rounded-md border border-input bg-background px-2 py-1.5 text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  // ── Submitted stage ─────────────────────────────────────────────────────────
  if (stage === "submitted") {
    return (
      <div className="flex flex-col gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="self-start -ml-2"
          onClick={() => setStage("entry")}
        >
          <ArrowLeftIcon className="size-4" /> Back
        </Button>
        <p className="text-body-sm text-muted-foreground">
          Diff view coming soon — wiring in follow-up.
        </p>
      </div>
    );
  }

  // ── Entry stage ─────────────────────────────────────────────────────────────
  return (
    <Tabs
      value={mode}
      onValueChange={(v) => setMode(v as UpdateMode)}
      className="flex flex-col"
    >
      <TabsList className="-mx-6 px-6">
        <TabsTrigger value="pdf">PDF</TabsTrigger>
        <TabsTrigger value="paste">Paste</TabsTrigger>
        <TabsTrigger value="manual">Manual</TabsTrigger>
      </TabsList>

      {/* ── PDF tab ─────────────────────────────────────────────────────────── */}
      <TabsContent value="pdf">
        {pickedFile === null ? (
          <label
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
              isDragOver
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
            )}
            onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropzoneDrop}
          >
            <UploadIcon className="size-6" aria-hidden="true" />
            <span className="text-body-sm font-medium">Drop a PDF here</span>
            <span className="text-body-sm">or click to browse</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>
        ) : (
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
            <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-body-sm font-medium truncate">{pickedFile.name}</p>
              <p className="text-body-sm text-muted-foreground">{formatSize(pickedFile.size)}</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={handleFileChange}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPickedFile(null)}
            >
              Remove
            </Button>
          </div>
        )}
      </TabsContent>

      {/* ── Paste tab ───────────────────────────────────────────────────────── */}
      <TabsContent value="paste" className="flex flex-col gap-2">
        <textarea
          className={cn(
            inputCls,
            "font-mono min-h-40 resize-y leading-relaxed"
          )}
          placeholder="Paste your statement text here…"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <p className="text-body-sm text-muted-foreground">
          Anything works — table rows, copy-paste from a webpage, or plain text.
        </p>
      </TabsContent>

      {/* ── Manual tab ──────────────────────────────────────────────────────── */}
      <TabsContent value="manual" className="flex flex-col gap-3">
        <p className="text-body-sm text-muted-foreground">
          For positions Paste can't handle — cash, real estate, private equity, or manual corrections.
        </p>

        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-x-2 gap-y-1.5 items-center">
          <span className="text-label text-muted-foreground">Label / Ticker</span>
          <span className="text-label text-muted-foreground text-right">Qty</span>
          <span className="text-label text-muted-foreground text-right">Value (USD)</span>
          <span />

          {rows.map((row) => (
            <Fragment key={row.id}>
              <input
                className={inputCls}
                placeholder="VTI or Primary residence"
                value={row.label}
                onChange={(e) => updateRow(row.id, "label", e.target.value)}
              />
              <input
                className={cn(inputCls, "text-right tabular-nums")}
                placeholder="100 (optional)"
                value={row.qty}
                onChange={(e) => updateRow(row.id, "qty", e.target.value)}
              />
              <input
                className={cn(inputCls, "text-right tabular-nums")}
                placeholder="10000"
                value={row.value}
                onChange={(e) => updateRow(row.id, "value", e.target.value)}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeRow(row.id)}
                aria-label="Remove row"
              >
                <XIcon className="size-3.5" />
              </Button>
            </Fragment>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={addRow}
          className="self-start"
        >
          <PlusIcon className="size-4" /> Add row
        </Button>
      </TabsContent>
    </Tabs>
  );
}
