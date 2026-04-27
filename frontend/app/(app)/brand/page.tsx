import type { Metadata } from "next";
import { BrandDonut } from "./brand-donut";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Separator } from "@/app/components/ui/separator";

export const metadata: Metadata = {
  title: "Brand · OpenPortfolio",
  description:
    "Anti-hype, transparency-first brand system. Tokens, principles, and voice.",
};

const principles = [
  {
    title: "Visibility, not advice",
    body:
      "Show what's there; don't recommend trades or predict outcomes.",
  },
  {
    title: "Every number has provenance",
    body:
      "Source, freshness, and contributing holdings on hover. Missing data is surfaced, never imputed.",
  },
  {
    title: "Math in code, language in LLM",
    body:
      "Python computes; the LLM only extracts and labels; deterministic validation always follows.",
  },
  {
    title: "Open & free",
    body: "No paywall, no caps, no forced accounts. AGPL-3.0.",
  },
  {
    title: "Quiet design",
    body:
      "Minimum ornamentation. Tokens over decoration. The data is the design.",
  },
];

const semanticColors: Array<{
  name: string;
  light: string;
  dark: string;
  use: string;
  cssVar: string;
}> = [
  { name: "background", cssVar: "--background", light: "#fafafa", dark: "#0a0a0a", use: "Page background" },
  { name: "foreground", cssVar: "--foreground", light: "#0a0a0a", dark: "#fafafa", use: "Primary text" },
  { name: "primary", cssVar: "--primary", light: "= foreground", dark: "= foreground", use: "Default buttons, body" },
  { name: "muted", cssVar: "--muted", light: "#f4f4f5", dark: "#18181b", use: "Cards, sections" },
  { name: "muted-foreground", cssVar: "--muted-foreground", light: "#71717a", dark: "#a1a1aa", use: "Secondary text" },
  { name: "border", cssVar: "--border", light: "#e4e4e7", dark: "#27272a", use: "Dividers" },
  { name: "accent", cssVar: "--accent", light: "#0f766e", dark: "#2dd4bf", use: "Accent · sparingly" },
  { name: "accent-soft", cssVar: "--accent-soft", light: "#ccfbf1", dark: "#134e4a", use: "Focus ring" },
  { name: "success", cssVar: "--success", light: "#16a34a", dark: "#4ade80", use: "Gains" },
  { name: "warning", cssVar: "--warning", light: "#d97706", dark: "#fbbf24", use: "Warnings" },
  { name: "destructive", cssVar: "--destructive", light: "#dc2626", dark: "#f87171", use: "Losses" },
];

const vizPalette = [
  { name: "cash", cssVar: "--viz-cash", light: "#d97706", dark: "#fbbf24" },
  { name: "us-equity", cssVar: "--viz-us-equity", light: "#2563eb", dark: "#60a5fa" },
  { name: "intl-equity", cssVar: "--viz-intl-equity", light: "#0d9488", dark: "#5eead4" },
  { name: "fixed-income", cssVar: "--viz-fixed-income", light: "#7c3aed", dark: "#a78bfa" },
  { name: "real-estate", cssVar: "--viz-real-estate", light: "#ea580c", dark: "#fb923c" },
  { name: "crypto", cssVar: "--viz-crypto", light: "#db2777", dark: "#f472b6" },
  { name: "alts", cssVar: "--viz-alts", light: "#ca8a04", dark: "#facc15" },
  { name: "other", cssVar: "--viz-other", light: "#71717a", dark: "#a1a1aa" },
];

const typeScale = [
  { name: "display", token: "text-display", desc: "40 / 48 · Inter 700", sample: "Display" },
  { name: "h1", token: "text-h1", desc: "28 / 36 · Inter 600", sample: "Heading 1" },
  { name: "h2", token: "text-h2", desc: "22 / 30 · Inter 600", sample: "Heading 2" },
  { name: "h3", token: "text-h3", desc: "18 / 26 · Inter 600", sample: "Heading 3" },
  { name: "body", token: "text-body", desc: "16 / 24 · Inter 400", sample: "Default body text for paragraphs and dialog body." },
  { name: "body-sm", token: "text-body-sm", desc: "14 / 20 · Inter 400", sample: "Secondary metadata, table captions, dense lists." },
  { name: "label", token: "text-label", desc: "13 / 18 · Inter 500", sample: "Form label" },
  { name: "mono", token: "text-mono", desc: "15 / 20 · JBM 400", sample: "847,392.41" },
  { name: "mono-sm", token: "text-mono-sm", desc: "13 / 18 · JBM 400", sample: "AAPL · 124.50" },
];

const spacingScale = [4, 8, 12, 16, 24, 32, 48, 64, 96];
const radiiScale = [
  { name: "none", value: "0", className: "rounded-none" },
  { name: "sm", value: "4px", className: "rounded-sm" },
  { name: "md", value: "8px", className: "rounded-md" },
  { name: "lg", value: "12px", className: "rounded-lg" },
  { name: "pill", value: "9999px", className: "rounded-full" },
];
const shadowScale = [
  { name: "0", value: "none", className: "shadow-none" },
  { name: "1", value: "0 1px 2px rgba(0,0,0,0.04)", className: "shadow-1" },
  { name: "2", value: "0 4px 12px rgba(0,0,0,0.06)", className: "shadow-2" },
  { name: "3", value: "0 12px 32px rgba(0,0,0,0.10)", className: "shadow-3" },
];

const motionTokens = [
  { name: "fast", value: "120ms", use: "Tooltips, hover" },
  { name: "medium", value: "200ms", use: "Panels, modals, theme toggle" },
  { name: "slow", value: "300ms", use: "Donut drill-down" },
  { name: "chart", value: "400ms", use: "Chart re-render with new data" },
];

export default function BrandPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 lg:px-6">
      <header className="flex flex-col gap-3">
        <p className="text-label text-muted-foreground uppercase tracking-wide">
          Brand
        </p>
        <h1 className="text-display">OpenPortfolio</h1>
        <p className="text-body text-muted-foreground max-w-2xl">
          See what you actually own — including the parts that aren&rsquo;t on
          any brokerage. Anti-hype, transparency-first, engineering-honest.
          Visibility, not advice.
        </p>
      </header>

      <Section
        title="Principles"
        intro="Five rules that keep the product calm and useful."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {principles.map((p, i) => (
            <Card key={p.title}>
              <CardHeader>
                <p className="text-mono-sm text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <CardTitle className="text-h3">{p.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-body-sm text-muted-foreground">
                {p.body}
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        title="Logo"
        intro="Two concentric rings: outer in ink, inner in accent. Reads as nested holdings — an x-ray of layers."
      >
        <div className="flex flex-wrap items-center gap-12">
          <div className="flex flex-col items-center gap-3">
            <LogoMark size={64} />
            <p className="text-label text-muted-foreground">Mark · 24×24</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <LogoLockup />
            <p className="text-label text-muted-foreground">Lockup · header</p>
          </div>
        </div>
        <p className="text-body-sm text-muted-foreground max-w-2xl">
          Wordmark in Inter SemiBold. Mark stroke widths: outer 3.5, inner 3.
          Clearspace = 0.5× mark height. Min sizes: mark 16px, wordmark 80px
          wide. Logo only on <code>--background</code>, <code>--muted</code>, or
          pure black/white surfaces.
        </p>
      </Section>

      <Section
        title="Semantic colors"
        intro="The shadcn vocabulary. Every primitive consumes these without translation."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {semanticColors.map((c) => (
            <ColorRow
              key={c.name}
              name={c.name}
              cssVar={c.cssVar}
              light={c.light}
              dark={c.dark}
              use={c.use}
            />
          ))}
        </div>

        <div className="bg-muted text-body-sm text-muted-foreground mt-6 rounded-md p-4">
          <strong className="text-foreground">Accent-color rule.</strong> The
          accent (teal) is &quot;almost invisible.&quot; Apply only to: focus
          rings via <code>--ring</code>, one or two key CTAs per view via{" "}
          <code>variant=&quot;accent&quot;</code>, and the total-portfolio-value
          figure on the dashboard. Default <code>&lt;Button&gt;</code> is ink —
          opt into accent explicitly.
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button>Default · ink</Button>
          <Button variant="accent">Accent · sparingly</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>
      </Section>

      <Section
        title="Asset categories"
        intro="Eight viz colors in canonical order. The first five are also exposed as --chart-1..5 for shadcn charts."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {vizPalette.map((c) => (
            <ColorRow
              key={c.name}
              name={c.name}
              cssVar={c.cssVar}
              light={c.light}
              dark={c.dark}
              use=""
            />
          ))}
        </div>
      </Section>

      <Section
        title="Donut"
        intro="The product hero. Segment stroke = --background. Inner radius leaves room for the total-value label. The one accent moment in data viz."
      >
        <Card>
          <CardContent className="flex flex-col items-center gap-6 py-8">
            <BrandDonut />
            <div className="text-body-sm text-muted-foreground flex flex-wrap justify-center gap-3">
              <LegendDot color="var(--viz-cash)" label="Cash" />
              <LegendDot color="var(--viz-us-equity)" label="US equity" />
              <LegendDot color="var(--viz-intl-equity)" label="Intl equity" />
              <LegendDot color="var(--viz-fixed-income)" label="Fixed income" />
              <LegendDot color="var(--viz-real-estate)" label="Real estate" />
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section
        title="Typography"
        intro="Inter for UI. JetBrains Mono for numbers. tnum + lnum applied everywhere."
      >
        <div className="flex flex-col gap-6">
          {typeScale.map((t) => (
            <div
              key={t.name}
              className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_1fr]"
            >
              <div className="text-mono-sm text-muted-foreground">
                <div>{t.token}</div>
                <div>{t.desc}</div>
              </div>
              <div
                className={`${t.token} ${t.name.startsWith("mono") ? "font-mono" : "font-sans"}`}
              >
                {t.sample}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Spacing"
        intro="4px base. Tailwind v4's default scale matches brand exactly."
      >
        <div className="flex items-end gap-4">
          {spacingScale.map((px) => (
            <div key={px} className="flex flex-col items-center gap-2">
              <div
                className="bg-foreground"
                style={{ width: 4, height: px }}
                aria-hidden
              />
              <span className="text-mono-sm text-muted-foreground">{px}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Radii"
        intro="Five steps. shadcn's --radius defaults to md (8px)."
      >
        <div className="flex flex-wrap gap-6">
          {radiiScale.map((r) => (
            <div key={r.name} className="flex flex-col items-center gap-2">
              <div
                className={`bg-muted h-20 w-20 ${r.className}`}
                aria-hidden
              />
              <span className="text-mono-sm text-muted-foreground">
                {r.name} · {r.value}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Elevation"
        intro="Three steps + level 0. Sparingly used — flat by default."
      >
        <div className="flex flex-wrap gap-6">
          {shadowScale.map((s) => (
            <div key={s.name} className="flex flex-col items-center gap-3">
              <div
                className={`bg-background flex h-24 w-32 items-center justify-center rounded-md ${s.className}`}
              >
                <span className="text-mono-sm text-muted-foreground">
                  shadow-{s.name}
                </span>
              </div>
              <span className="text-mono-sm text-muted-foreground max-w-[160px] text-center">
                {s.value}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Motion"
        intro="Reserved and functional. Honors prefers-reduced-motion."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {motionTokens.map((m) => (
            <div
              key={m.name}
              className="flex items-baseline justify-between gap-4 border-b py-2"
            >
              <div className="flex flex-col">
                <span className="text-body-sm">{m.name}</span>
                <span className="text-body-sm text-muted-foreground">
                  {m.use}
                </span>
              </div>
              <span className="text-mono-sm text-muted-foreground">
                {m.value}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Status"
        intro="Pill background uses the -soft variant. Always pair with a glyph or label — never color alone."
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill kind="success" glyph="▲" label="On target · +1.2%" />
          <StatusPill kind="warning" glyph="●" label="Drifted · 4.1%" />
          <StatusPill
            kind="destructive"
            glyph="▼"
            label="Stale · 14d"
          />
        </div>
        <p className="text-body-sm text-muted-foreground">
          Glyphs are Unicode — no icon library inside data UI. Use{" "}
          <code>▲</code>/<code>▼</code> for discrete values, <code>↗</code>/
          <code>↘</code> for trends over time.
        </p>
      </Section>

      <Section
        title="Voice"
        intro="Plain, technical, second person. Avoid marketing words."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-h3">Avoid</CardTitle>
              <CardDescription>Marketing claims</CardDescription>
            </CardHeader>
            <CardContent className="text-body-sm text-muted-foreground">
              <ul className="space-y-1">
                <li>magical</li>
                <li>effortless</li>
                <li>powerful</li>
                <li>seamless</li>
                <li>revolutionary</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-h3">Prefer</CardTitle>
              <CardDescription>Functional verbs</CardDescription>
            </CardHeader>
            <CardContent className="text-body-sm text-muted-foreground">
              <ul className="space-y-1">
                <li>shows</li>
                <li>computes</li>
                <li>displays</li>
                <li>decomposes</li>
                <li>imports / exports</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Separator />

      <footer className="text-body-sm text-muted-foreground flex flex-wrap items-center justify-between gap-4 pb-8">
        <p>
          Source of truth: <code>docs/brand.md</code>. Component reference in
          Storybook.
        </p>
        <Badge variant="outline">v0.2 · alpha</Badge>
      </footer>
    </div>
  );
}

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-h2">{title}</h2>
        <p className="text-body-sm text-muted-foreground max-w-2xl">{intro}</p>
      </header>
      {children}
    </section>
  );
}

function ColorRow({
  name,
  cssVar,
  light,
  dark,
  use,
}: {
  name: string;
  cssVar: string;
  light: string;
  dark: string;
  use: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <span
        className="border-border h-10 w-10 shrink-0 rounded-md border"
        style={{ background: `var(${cssVar})` }}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-sm font-medium">{name}</span>
        <span className="text-mono-sm text-muted-foreground truncate">
          {cssVar}
        </span>
      </div>
      <div className="text-mono-sm text-muted-foreground hidden flex-col items-end sm:flex">
        <span>{light}</span>
        <span>{dark}</span>
      </div>
      {use ? (
        <span className="text-body-sm text-muted-foreground hidden sm:block">
          {use}
        </span>
      ) : null}
    </div>
  );
}

function StatusPill({
  kind,
  glyph,
  label,
}: {
  kind: "success" | "warning" | "destructive";
  glyph: string;
  label: string;
}) {
  const map = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    destructive: "bg-destructive-soft text-destructive",
  } as const;
  return (
    <span
      className={`text-body-sm inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${map[kind]}`}
    >
      <span aria-hidden>{glyph}</span>
      <span>{label}</span>
    </span>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-label="OpenPortfolio mark"
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="3.5" />
      <circle
        cx="12"
        cy="12"
        r="5"
        stroke="var(--accent)"
        strokeWidth="3"
        fill="none"
      />
    </svg>
  );
}

function LogoLockup() {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={32} />
      <span className="text-h2 font-semibold tracking-tight">
        OpenPortfolio
      </span>
    </span>
  );
}
