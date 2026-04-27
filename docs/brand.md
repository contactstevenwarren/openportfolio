# OpenPortfolio — brand & design system

> **Tagline:** See what you actually own — including the parts that aren't on any brokerage.
>
> **Voice:** anti-hype, transparency-first, engineering-honest. Visibility, not advice.

The live, browsable spec lives at [`/brand`](https://openportfolio.fly.dev/brand) (source: `frontend/app/brand/page.tsx`). This file is its scannable summary.

## Principles

1. **Visibility, not advice.** Show what's there; don't recommend trades or predict outcomes.
2. **Every number has provenance.** Source, freshness, and contributing holdings on hover. Missing data is surfaced, never imputed.
3. **Math in code, language in LLM.** Python computes; the LLM only extracts and labels; deterministic validation always follows.
4. **Open & free.** No paywall, no caps, no forced accounts. AGPL-3.0.
5. **Quiet design.** Minimum ornamentation. Tokens over decoration. The data is the design.

## Logo

Two concentric rings: outer in brand ink, inner in brand teal. Reads as nested holdings — an x-ray of layers.

| Asset | Path | Use |
| --- | --- | --- |
| Mark | `frontend/public/brand/logo-mark.svg` | Favicon, avatar, standalone icon |
| Wordmark | `frontend/public/brand/logo-wordmark.svg` | Text-heavy contexts (uses `currentColor`) |
| Lockup | `frontend/public/brand/logo.svg` | Default header / marketing |
| On-dark lockup | `frontend/public/brand/logo-on-dark.svg` | Dark surfaces |
| Favicon | `frontend/app/icon.svg` (auto-registered) | Browser tab |
| iOS icon | `frontend/app/apple-icon.tsx` (180×180 PNG, generated) | Home-screen icon |
| Social card | `frontend/app/opengraph-image.tsx` (1200×630 PNG, generated) | OG/Twitter card |

**Specs**

- Wordmark: Inter SemiBold (600), letter-spacing `-0.01em`, color `--foreground`.
- Mark: 24×24 viewBox; outer ring stroke `--foreground` (`#0a0a0a`) 3.5; inner ring stroke `--brand` (`#0f766e`) 3 (light). Dark mode: `#fafafa` outer, `#2dd4bf` inner.
- Clearspace: 0.5× mark height on all sides.
- Min sizes: mark 16px, wordmark 80px wide.

**Backgrounds.** The logo only appears on `--background`, `--muted`, or pure black/white surfaces. Never on photography, gradients, or arbitrary colors.

**Don'ts**

No fills inside rings · no all-caps · no stretching · no drop shadows · no gradients · no rotation · no placement on non-token backgrounds.

## Color tokens

### Semantic

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--background` | `#fafafa` | `#0a0a0a` | Page background |
| `--foreground` | `#0a0a0a` | `#fafafa` | Primary text |
| `--muted` | `#f4f4f5` | `#18181b` | Cards, sections |
| `--muted-foreground` | `#71717a` | `#a1a1aa` | Secondary text |
| `--border` | `#e4e4e7` | `#27272a` | Dividers |
| `--brand` | `#0f766e` | `#2dd4bf` | Brand · sparingly |
| `--brand-soft` | `#ccfbf1` | `#134e4a` | Focus rings, hovers |
| `--success` | `#16a34a` | `#4ade80` | Gains (text/icon) |
| `--success-soft` | `#dcfce7` | `#14532d` | Pill backgrounds |
| `--warning` | `#d97706` | `#fbbf24` | Warnings (text/icon) |
| `--warning-soft` | `#fef3c7` | `#451a03` | Pill backgrounds |
| `--destructive` | `#dc2626` | `#f87171` | Losses (text/icon) |
| `--destructive-soft` | `#fee2e2` | `#450a0a` | Pill backgrounds |

**Brand-color rule.** Teal is "almost invisible." Apply only to (a) focus rings, (b) one or two key calls-to-action per view, (c) the total-portfolio-value figure on the dashboard. Teal does not belong in normal links, body text, or general UI chrome.

**Status pill rule.** Pill background uses the matching `-soft` variant (e.g., `--success-soft`); foreground/icon uses the base semantic token. Always pair with a text label or glyph — never color alone.

### Color modes

The system follows the user's OS preference via `prefers-color-scheme`. Tokens are defined as CSS custom properties under a scoped root; the dark column above takes effect automatically when the OS is in dark mode — no JavaScript, no FOUC, no toggle UI.

- Tokens live in CSS, never in JS strings. JS components that need concrete color values (charts, generated images) read the JS mirror in `frontend/app/brand/tokens.ts` and subscribe to `matchMedia('(prefers-color-scheme: dark)')` for reactivity.
- Both modes ship complete: every semantic token has a light AND dark value. Never partially themed.
- v0.1: no user-facing theme toggle. Function over form; defer until a roadmap phase pulls it in.
- Generated assets (favicon, iOS icon, OG card) are rendered without browser context and ship a single light-mode variant. Acceptable for v0.1.

### Asset categories (data viz)

| Token | Light | Dark | Category |
| --- | --- | --- | --- |
| `--viz-cash` | `#d97706` | `#fbbf24` | Cash |
| `--viz-us-equity` | `#2563eb` | `#60a5fa` | US equity |
| `--viz-intl-equity` | `#0d9488` | `#5eead4` | Intl equity |
| `--viz-fixed-income` | `#7c3aed` | `#a78bfa` | Fixed income |
| `--viz-real-estate` | `#ea580c` | `#fb923c` | Real estate |
| `--viz-crypto` | `#db2777` | `#f472b6` | Crypto |
| `--viz-alts` | `#ca8a04` | `#facc15` | Alts |
| `--viz-other` | `#71717a` | `#a1a1aa` | Other |

Asset-viz teal (`--viz-intl-equity`) is intentionally close to brand teal but distinct. When both appear together (rare), brand teal wins by weight (e.g., bold).

## Typography

Two families, both via `next/font` (self-hosted at build time, zero CDN call):

- **Inter** — all UI and headings (weight + size as hierarchy)
- **JetBrains Mono** — numbers, tickers, code, anywhere figures are tabulated

Apply `font-feature-settings: "tnum", "lnum"` everywhere numbers appear. Both families honor it; columns of figures align cleanly.

| Style | Family | Weight | Size / line-height | Use |
| --- | --- | --- | --- | --- |
| Display | Inter | 700 | 40 / 48 | Hero, marketing |
| H1 | Inter | 600 | 28 / 36 | Page titles |
| H2 | Inter | 600 | 22 / 30 | Section titles |
| H3 | Inter | 600 | 18 / 26 | Subsection titles |
| Body | Inter | 400 | 16 / 24 | Default for paragraphs, descriptions, dialog body |
| Body-sm | Inter | 400 | 14 / 20 | Secondary metadata, table captions, dense lists, tooltip body |
| Label | Inter | 500 | 13 / 18 | Form labels, captions |
| Mono | JetBrains Mono | 400 | 15 / 20 | Numbers, tickers, code |
| Mono-sm | JetBrains Mono | 400 | 13 / 18 | Tabular cells |

Default to **Body** unless density is the explicit goal. **Body-sm** earns its place only for secondary content; not a stylistic choice.

### Numbers & dates

| Aspect | Pattern | Notes |
| --- | --- | --- |
| Currency, totals ≥ $10k | `$847,392` (no cents) | Cents add visual noise on large numbers |
| Currency, < $10k | `$847.32` (with cents) | Precision matters at smaller scale |
| Share prices | `$4.27` (always with cents) | Regardless of magnitude — share prices show cents |
| Percentages | `41.8%` (1 decimal default) | Whole numbers in chart legends; 2 decimals only when drift < 1% |
| Negative numbers | `−$1,234.50` (Unicode minus U+2212) | Hyphen `-` is typographically wrong. Parentheses reserved for accounting reports |
| Abbreviation | Never in tables. Charts only when constrained: `$1.2M`, `$847k` | Tables = precise; charts = loose |
| Date, technical | `2026-04-12` (ISO 8601) | Provenance stamps, timestamps, file names |
| Date, prose | `Apr 12, 2026` | "Holdings updated Apr 12, 2026" |
| Time | `14:32 UTC` (24-hour + zone) | Only when time matters (rare in this product) |

## Layout

**Spacing scale** (4px base): `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`

**Radius:** `0` (sharp) · `4` (sm) · `8` (md) · `12` (lg) · `9999` (pill)

**Elevation**

| Level | Shadow | Use |
| --- | --- | --- |
| 0 | `none` | Default |
| 1 | `0 1px 2px rgba(0,0,0,0.04)` | Row separation |
| 2 | `0 4px 12px rgba(0,0,0,0.06)` | Cards, popovers |
| 3 | `0 12px 32px rgba(0,0,0,0.10)` | Modals, dropdowns |

## Motion

Reserved and functional. Motion serves comprehension, never decoration.

| Aspect | Value |
| --- | --- |
| Easing — entry | `ease-out` |
| Easing — exit | `ease-in` |
| Easing — state change | `ease-in-out` |
| Duration — small UI (tooltips, hover) | 120ms |
| Duration — panels, modals, theme toggle | 200ms |
| Duration — donut drill-down | 300ms |
| Duration — chart re-render with new data | 400ms |

**Hard rules**

- No looping animations, no bounces, no page-load splash, no parallax, no spinning charts.
- Honor `prefers-reduced-motion: reduce`. Collapse all transitions to 0ms when set.
- Donut transitions: segments fade-and-shift, never spin or rotate.

## Components

The live `/brand` page renders these against the tokens above:

- **Buttons** — primary (teal bg, white text · used sparingly), secondary (border + ink text), ghost (text only).
- **Links** — `--foreground` color with underline, never teal. (See Links below.)
- **Status pills** — success / warning / destructive variants. (See Status pill rule above.)
- **Tabular row** — symbol + figures in JetBrains Mono with tabular nums; names in Inter; numeric columns right-aligned.
- **Total value emphasis** — the one place teal appears in data: dashboard portfolio total in JetBrains Mono Medium.

### Links

Inline links use `--foreground` color with `text-decoration: underline` and `text-underline-offset: 0.15em`. Hover thickens the underline; visited state matches default — links don't change color after click. Links never use teal; the brand-color rule reserves `--brand` for focus rings, key actions, and the total-value figure.

### Focus state

Every interactive element gets a 2px outset focus ring in `--brand-soft` with 2px offset. Never remove with `outline: none` unless replaced by an equivalent visual marker.

### Iconography

No icon library. Approved Unicode glyph set:

| Glyph | Meaning |
| --- | --- |
| `▲` | Gain (discrete value) |
| `▼` | Loss (discrete value) |
| `↗` | Trend up (over time) |
| `↘` | Trend down (over time) |
| `●` | Filled marker |
| `○` | Open marker |
| `✕` | Don't / close / error |
| `→` | Forward / next |
| `←` | Back |

Use `▲`/`▼` for discrete values (gain/loss amounts, status pills). Use `↗`/`↘` for trends over time (sparklines, axes).

### Tooltips & popovers

The provenance hover — every user-visible number exposes its source — is the product's hero interaction.

- Background `--background`; border `1px solid --border`; radius `8px (md)`.
- Padding `12px 16px`. Max-width ~320px.
- Body text Body-sm (14/20).
- Elevation 2.
- 120ms fade-in on hover; 0ms when `prefers-reduced-motion: reduce`.

### State surfaces

- **Empty states** are explanatory and direct. One line of plain text + one action. No illustrations, no marketing copy. Example: *"No holdings yet. Paste positions from any broker to get started."*
- **Loading states** use a single thin progress indicator (1px or 2px) at the top of the affected component. No skeleton loaders that mock content shape — never show fake data placeholders.
- **Error states** name the specific failure and the next action. Use `--destructive` foreground on `--background` (no red panels). Pair with a `✕` glyph or text label.
- **Stale data.** When data is refreshing, show *"as of [last known date]"* until new data confirms.

### Charts

The donut (asset allocation) is the product hero.

- **Segment separation.** Stroke each segment with `--background` color (not a darker line) — creates clean visual separation.
- **Inner radius.** Donut, not pie — leave room for the total-value label at center.
- **Center label.** Total portfolio value in JetBrains Mono Medium with "Total" label in Inter Medium above. This is the one teal moment in data viz.
- **Hover.** Selected segment emphasized via stroke or weight; siblings drop opacity. Never spin, never bounce.
- **Drill-down.** Selected segment expands; non-selected siblings fade. 300ms ease-out.
- **Empty.** Three-ring outline in `--border` color with prompt: *"Add holdings to see your allocation."*
- **Legend.** Below chart, single row, asset-category swatches in fixed canonical order (Cash · US equity · Intl equity · Fixed income · Real estate · Crypto · Alts · Other).

## Voice

Anti-hype, transparency-first, engineering-honest. The voice in copy is operationalized below; deviation should be a deliberate choice.

- **Plain, technical, second person.** Avoid "we" except in legal/footer contexts.
- **Avoid marketing claims:** *magical · effortless · powerful · intelligent · smart · seamless · revolutionary*. If a feature is good, say what it does.
- **Use functional verbs:** *shows · computes · displays · decomposes · imports · exports*.
- **Errors are direct and specific.** *"Couldn't read this paste — the broker format isn't recognized."* Not *"Oops! Something went wrong."*
- **Provenance pattern:** `[Data] [verb] [date] · [source if applicable]`. Examples: *"Holdings updated Apr 12, 2026"* · *"Fund compositions from SEC N-PORT, Q4 2025"* · *"Real estate value provided by user."*
- **Empty states explain the state, not the brand.** *"No holdings yet. Paste positions from any broker to get started."* Not *"Welcome! Let's begin your journey."*
- **No emojis in product UI.** Acceptable in `README.md`, blog posts, social.

## Accessibility

- WCAG AA contrast (4.5:1) on all foreground/background pairs above for body text.
- **WCAG AAA (7:1) for hero numbers** — total portfolio value, top-line allocation %. The product's most-read figures earn the higher target.
- Status is never communicated by color alone — pair with glyph or label (e.g., `▲ +$X` / `▼ −$X`).
- Focus rings: 2px outset using `--brand-soft`; never removed without replacement.
- Honor `prefers-reduced-motion: reduce`. Animation is never load-bearing for meaning.
- Provenance on every user-visible number; missing data is surfaced, not silently zeroed.
