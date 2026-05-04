"use client";

// Tabbed update form shared by both trigger paths:
//   - row.tsx UpdateSheet (upload icon, stale pill, Update button, drag-drop)
//   - header.tsx Update Sheet (after saving a new account)
//
// State machine:
//   "entry"     → user picks file / pastes text / types manual rows
//   "extracting" → calling /api/extract or /api/extract/pdf
//   "review"    → ExtractionResult returned; ReviewStep shown
//   "committing" → handled inside ReviewStep
//   "done"      → commit succeeded, onContinue() called to close sheet
//
// Parent is responsible for the SheetFooter (Cancel + Continue / Cancel-only)
// and wires onContinueDisabledChange + onContinue.

import { useState, useEffect, useRef, forwardRef, useImperativeHandle, Fragment } from "react";
import { UploadIcon, FileIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/app/components/ui/tabs";
import { cn } from "@/app/lib/utils";
import type { Account, ExtractionResult } from "@/app/lib/api";
import { api } from "@/app/lib/api";
import { ReviewStep, type ReviewStepHandle } from "./review-step";
import { ManualGrid } from "./manual-grid";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UpdateMode = "pdf" | "paste" | "manual";
type Stage = "entry" | "extracting" | "review";

export type UpdateFormProps = {
  account: Account;
  initialMode?: UpdateMode;
  autoSubmit?: boolean;
  initialFile?: File | null;
  onContinueDisabledChange: (disabled: boolean) => void;
  onContinue: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type UpdateFormHandle = {
  handleContinue: () => void;
};

// ── UpdateForm ────────────────────────────────────────────────────────────────

export const UpdateForm = forwardRef<UpdateFormHandle, UpdateFormProps>(function UpdateForm({
  account,
  initialMode = "pdf",
  autoSubmit = false,
  initialFile = null,
  onContinueDisabledChange,
  onContinue,
}: UpdateFormProps, ref) {
  const [stage, setStage] = useState<Stage>("entry");
  const [mode, setMode] = useState<UpdateMode>(initialMode);

  // Per-mode state
  const [pickedFile, setPickedFile] = useState<File | null>(initialFile ?? null);
  const [pasted, setPasted] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extraction state
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  // ReviewStep imperative handle
  const reviewRef = useRef<ReviewStepHandle>(null);

  // Review-step commit-disabled state (bubbled up via callback)
  const [reviewCommitDisabled, setReviewCommitDisabled] = useState(true);

  // Sync initialMode / initialFile / autoSubmit when parent re-opens sheet
  useEffect(() => {
    setStage("entry");
    setMode(initialMode);
    setPickedFile(initialFile ?? null);
    setExtractionResult(null);
    setExtractError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit, initialMode, initialFile]);

  // Auto-extract on mount when autoSubmit=true and a file is ready
  useEffect(() => {
    if (autoSubmit && initialFile) {
      void runExtract("pdf", initialFile, null);
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Continue disabled logic ─────────────────────────────────────────────────

  const isContinueDisabled: boolean = (() => {
    if (stage === "entry") {
      if (mode === "manual") return true; // Manual has its own Commit button
      if (mode === "pdf") return pickedFile === null;
      if (mode === "paste") return pasted.trim() === "";
    }
    if (stage === "extracting") return true;
    if (stage === "review") return reviewCommitDisabled;
    return true;
  })();

  useEffect(() => {
    onContinueDisabledChange(isContinueDisabled);
  }, [isContinueDisabled, onContinueDisabledChange]);

  // ── Extraction ──────────────────────────────────────────────────────────────

  async function runExtract(
    extractMode: "pdf" | "paste",
    file: File | null,
    text: string | null
  ) {
    setStage("extracting");
    setExtractError(null);
    try {
      const result =
        extractMode === "pdf" && file
          ? await api.extractPdf(file)
          : await api.extract(text ?? "");
      setExtractionResult(result);
      setStage("review");
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Extraction failed.");
      setStage("entry");
    }
  }

  // Called by parent's Continue button — either triggers extraction or ReviewStep commit.
  function handleContinue() {
    if (stage === "entry") {
      if (mode === "pdf" && pickedFile) {
        void runExtract("pdf", pickedFile, null);
      } else if (mode === "paste" && pasted.trim()) {
        void runExtract("paste", null, pasted);
      }
    } else if (stage === "review") {
      reviewRef.current?.triggerCommit();
    }
  }

  // Expose handleContinue so parent (row.tsx UpdateSheet) can call it from its footer button.
  useImperativeHandle(ref, () => ({ handleContinue }));

  // ── PDF tab ─────────────────────────────────────────────────────────────────

  function handleDropzoneDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setPickedFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file) setPickedFile(file);
    e.target.value = "";
  }

  // ── Render: extracting spinner ──────────────────────────────────────────────

  if (stage === "extracting") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-body-sm text-muted-foreground">
        <div className="size-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
        Extracting positions…
      </div>
    );
  }

  // ── Render: review step ─────────────────────────────────────────────────────

  if (stage === "review" && extractionResult) {
    return (
      <ReviewStep
        ref={reviewRef}
        account={account}
        extractionResult={extractionResult}
        source={mode}
        onCommitSuccess={onContinue}
        onBack={() => {
          setStage("entry");
          setExtractionResult(null);
        }}
        onCommitDisabledChange={setReviewCommitDisabled}
      />
    );
  }

  // ── Render: entry tabs ──────────────────────────────────────────────────────

  const inputCls =
    "w-full rounded-md border border-input bg-background px-2 py-1.5 text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="flex flex-col gap-3">
      {extractError && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-body-sm text-destructive flex items-center justify-between gap-2">
          <span>{extractError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setExtractError(null);
              if (mode === "pdf" && pickedFile) void runExtract("pdf", pickedFile, null);
              else if (mode === "paste" && pasted.trim()) void runExtract("paste", null, pasted);
            }}
          >
            Retry
          </Button>
        </div>
      )}

      <Tabs
        value={mode}
        onValueChange={(v) => {
          setMode(v as UpdateMode);
          setExtractError(null);
        }}
        className="flex flex-col"
      >
        <TabsList className="-mx-6 px-6">
          <TabsTrigger value="pdf">PDF</TabsTrigger>
          <TabsTrigger value="paste">Paste</TabsTrigger>
          <TabsTrigger value="manual">Manual</TabsTrigger>
        </TabsList>

        {/* ── PDF tab ─────────────────────────────────────────────────────── */}
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
            <div className="flex flex-col gap-2">
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
              <p className="text-body-sm text-muted-foreground">
                Click Continue to extract positions from this PDF.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ── Paste tab ───────────────────────────────────────────────────── */}
        <TabsContent value="paste" className="flex flex-col gap-2">
          <textarea
            className={cn(inputCls, "font-mono min-h-40 resize-y leading-relaxed")}
            placeholder="Paste your statement text here…"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <p className="text-body-sm text-muted-foreground">
            Anything works — table rows, copy-paste from a webpage, or plain text. Click Continue
            to extract positions.
          </p>
        </TabsContent>

        {/* ── Manual tab ──────────────────────────────────────────────────── */}
        <TabsContent value="manual">
          <ManualGrid account={account} />
        </TabsContent>
      </Tabs>
    </div>
  );
});
