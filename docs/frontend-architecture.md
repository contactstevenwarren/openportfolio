# Frontend architecture

> Companion to [`architecture.md`](architecture.md) (system-wide constraints) and [`brand.md`](brand.md) (visual spec). This file defines how the frontend is built and why.

## Context

The frontend pivoted from inline-styled hand-rolled components to **shadcn/ui + Tailwind v4** in a single PR (`feat/brand-guideline`). Pre-production status meant we could break legacy visual quality in exchange for a clean, single-vocabulary design system. ECharts was retired in the same pivot; Recharts (via shadcn `<Chart>`) is the only chart library going forward.

## Goals

1. **Single vocabulary.** `brand.md`, CSS variables, and shadcn primitives all use the same names — no translation layer.
2. **Tokens are runtime CSS variables.** No JS mirror, no hex strings in components. Anything color-related reads `var(--token)`.
3. **Aligned by default.** Every shadcn primitive consumes brand tokens automatically. New primitives copied from the registry render correctly without overrides.
4. **Storybook is the design-system reference.** Component variants, all states, both themes. Token stories are first-class. The `/brand` route is identity-only (principles, voice, the canonical donut).
5. **Brand-rule compliance is structural, not disciplinary.** The default `<Button>` is ink, not accent — the brand-color rule is enforced at the component layer, not by code review.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 14 App Router + TS strict | Existing |
| Styling | Tailwind v4, CSS-first `@theme` | `app/globals.css` is the only source |
| Components | shadcn/ui (style: `new-york`, base: `neutral`) | CSS variables enabled |
| Icons | `lucide-react` (chrome) + Unicode (data viz) | See §Icons |
| Theme | `next-themes` (`class` strategy, default `system`) | `suppressHydrationWarning` on `<html>` |
| Charts | Recharts via shadcn `<Chart>` | ECharts retired |
| Combobox | `cmdk` via shadcn `<Command>` | Powering institution picker and any future combobox UI |
| Forms (when needed) | `react-hook-form` + `zod` + shadcn `<Form>` | Add lazily |
| Data fetching | SWR | Existing |
| Fonts | Inter + JetBrains Mono via `next/font` | Exposed as `--font-inter` / `--font-jbm`, then `--font-sans` / `--font-mono` |
| Component dev | Storybook 9 (`@storybook/nextjs-vite`) + `addon-themes` | Vite under the hood |
| Path alias | `@/*` → `./*` | shadcn convention |

## Token system

`brand.md` is the human-readable spec. `frontend/app/globals.css` is the canonical runtime form. Every brand token from `brand.md` is mirrored as a CSS variable under `:root` (light) and `.dark` (dark), then exposed to Tailwind v4 via `@theme inline`.

### Color mapping

shadcn semantic names are used directly. The accent-color rule is enforced by mapping `--primary` to `--foreground` (ink), so the default `<Button>` is ink — accent is opt-in via `<Button variant="accent">`.

| Token | Light | Dark | Note |
|---|---|---|---|
| `--background` | `#fafafa` | `#0a0a0a` | |
| `--foreground` | `#0a0a0a` | `#fafafa` | |
| `--primary` | = `--foreground` | = `--foreground` | Default buttons, links, body |
| `--primary-foreground` | = `--background` | = `--background` | |
| `--accent` | `#0f766e` | `#2dd4bf` | The teal · sparingly |
| `--accent-foreground` | = `--background` | = `--background` | |
| `--accent-soft` | `#ccfbf1` | `#134e4a` | Focus rings, soft hovers |
| `--secondary`, `--muted` | `#f4f4f5` | `#18181b` | Sections, disabled |
| `--muted-foreground` | `#71717a` | `#a1a1aa` | Secondary text |
| `--card`, `--popover` | = `--background` | = `--background` | |
| `--border` | `#e4e4e7` | `#27272a` | |
| `--input` | = `--border` | = `--border` | |
| `--ring` | = `--accent-soft` | = `--accent-soft` | Per accessibility rule |
| `--destructive` | `#dc2626` | `#f87171` | |
| `--success`, `--warning` | `#16a34a` / `#d97706` | `#4ade80` / `#fbbf24` | Status |
| `--*-soft` (success/warning/destructive) | per `brand.md` | per `brand.md` | Pill backgrounds |
| `--viz-cash`, `--viz-us-equity`, `--viz-intl-equity`, `--viz-fixed-income`, `--viz-real-estate`, `--viz-crypto`, `--viz-alts`, `--viz-other` | per `brand.md` | per `brand.md` | 8-category data viz |
| `--chart-1..5` | = first 5 of viz | = first 5 of viz | shadcn `<Chart>` palette |

Sidebar tokens (`--sidebar`, `--sidebar-foreground`, etc.) alias the corresponding semantic tokens; no separate sidebar palette.

### Typography

`next/font` injects Inter and JetBrains Mono with CSS variable names `--font-inter` and `--font-jbm`. The Tailwind theme exposes them as `--font-sans` and `--font-mono`. The full type scale from `brand.md` (display / h1 / h2 / h3 / body / body-sm / label / mono / mono-sm) is exposed as Tailwind text utilities (`text-display`, `text-body-sm`, etc.). Each utility resolves to size + line-height + font-weight + letter-spacing in one class.

`font-feature-settings: "tnum", "lnum"` is set globally in `body` so all numbers tabulate cleanly.

### Spacing, radii, shadows, motion

- **Spacing:** Tailwind v4's default 4px scale matches brand `4·8·12·16·24·32·48·64·96` exactly. No override.
- **Radii:** `--radius-none` 0 · `--radius-sm` 4 · `--radius-md` 8 · `--radius-lg` 12 · `--radius-pill` 9999. shadcn's `--radius` aliases `--radius-md` (the default for cards, buttons, inputs).
- **Shadows:** `--shadow-1/2/3` from `brand.md`. Dark mode strengthens shadow opacity to keep them visible against `#0a0a0a`.
- **Motion:** `--duration-fast` 120ms · `--duration-medium` 200ms · `--duration-slow` 300ms · `--duration-chart` 400ms. Three easings (`ease-out`, `ease-in`, `ease-in-out`). All transitions collapse to 0ms when `prefers-reduced-motion: reduce`.

## Folder layout

```
frontend/
├── app/
│   ├── layout.tsx                 # Root: Tailwind, ThemeProvider, fonts
│   ├── globals.css                # Tokens (single source of truth)
│   ├── apple-icon.tsx, opengraph-image.tsx, icon.svg
│   ├── (app)/                     # Route group with shared chrome (sidebar + header)
│   │   ├── layout.tsx             # SidebarProvider + AppSidebar + SiteHeader
│   │   ├── page.tsx               # / new home (dashboard)
│   │   ├── accounts/
│   │   │   ├── page.tsx           # /accounts — account list (UI-only mock pass)
│   │   │   └── _accounts/        # Private module: mocks, header, filters, list, row
│   │   └── brand/
│   │       ├── page.tsx           # Refactored brand identity showcase
│   │       └── brand-donut.tsx    # Recharts donut (canonical chart example)
│   ├── components/
│   │   ├── ui/                    # shadcn primitives + .stories.tsx co-located
│   │   │   │                      # Includes: command.tsx, popover.tsx (added for combobox)
│   │   ├── theme-provider.tsx     # next-themes wrapper
│   │   ├── theme-toggle.tsx       # sun/moon dropdown
│   │   ├── app-sidebar.tsx        # main nav sidebar
│   │   └── site-header.tsx        # top header (sidebar trigger + theme + avatar)
│   ├── stories/
│   │   └── tokens/                # token reference stories
│   ├── lib/
│   │   ├── utils.ts               # cn() helper (shadcn)
│   │   └── api.ts, drill.ts, ...  # shared domain helpers
│   ├── hooks/                     # shadcn-generated hooks (use-mobile)
│   └── legacy/                    # Pre-redesign routes
│       ├── layout.tsx             # Plain nav, points to /legacy/*
│       ├── page.tsx               # Index of legacy routes
│       ├── components/            # Legacy-only components (PositionExtractReview)
│       └── {targets,accounts,classifications,positions,paste,manual}/
├── .storybook/
│   ├── main.ts                    # @storybook/nextjs-vite + addon-themes
│   ├── preview.ts                 # Imports globals.css, theme decorator
│   └── storybook.css              # Storybook-specific bg/color
├── components.json                # shadcn CLI config
├── postcss.config.mjs             # @tailwindcss/postcss
├── tsconfig.json                  # path alias @/* + .stories.tsx exclude
└── package.json
```

## Routing & coexistence with legacy

- **`/`** — new home, dashboard with allocation and account widgets.
- **`/accounts`** — account list page (UI-only mock pass; real API wiring deferred). Components live in `(app)/accounts/_accounts/`. The `_accounts/` prefix marks the folder as a private module — not a routable segment.
- **`/brand`** — refactored brand identity showcase (uses shadcn primitives + Recharts donut).
- **`/legacy/*`** — pre-redesign data-entry routes (forms only; the legacy dashboard was deleted). Visual quality not maintained.

The `(app)` route group shares the sidebar-and-header chrome between `/` and `/brand`. The `legacy/` folder has its own thin nav-only layout. Both groups inherit the root `app/layout.tsx` (which provides Tailwind globals, fonts, and the ThemeProvider).

When the new app reaches feature parity with legacy, `app/legacy/` will be deleted in a follow-up PR.

## Charts

- **Library:** Recharts via shadcn's `<ChartContainer>` / `<ChartTooltip>` / `<ChartTooltipContent>` / `<ChartLegend>` wrappers (`app/components/ui/chart.tsx`).
- **Theming:** Slice colors are `var(--viz-*)` or `var(--chart-N)` — no inline hex.
- **Donut spec compliance** (per `brand.md`):
  - Segment stroke = `var(--background)` (clean visual separation, not a darker line).
  - Inner radius leaves room for the total-value label.
  - Center label: "Total" in Inter Medium + value in JetBrains Mono Medium with `text-accent` (the one accent moment in data viz).
  - `isAnimationActive={false}` for now to avoid Recharts' default rotation; explicit fade-and-shift behavior added when drill-down is built.
  - When drill-down lands, transitions use `var(--duration-slow)` (300ms) and `var(--ease-out)`.
- **Why Recharts over ECharts:** shadcn's chart primitives are first-party, theme-aware, and consume CSS variables natively. ECharts required a JS color mirror (`tokens.ts`) and prefers-color-scheme subscription — both retired.

## Theme switching

- `next-themes` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`.
- `<html lang="en" suppressHydrationWarning>` to silence the unavoidable mismatch warning when the script writes the class on the client.
- `disableTransitionOnChange` prevents flash of transition during theme flip.
- Theme toggle (`app/components/theme-toggle.tsx`) is a sun/moon dropdown with three options: Light, Dark, System.

## Icons

Two domains, two libraries:

- **Chrome** — `lucide-react`. Sidebar collapse, theme toggle, account menu, search, etc. Roughly 5KB tree-shaken when used selectively.
- **Data viz** — Unicode glyphs only (`▲ ▼ ↗ ↘ ● ○ ✕ → ←`). Every glyph next to a number must have a defined semantic meaning per `brand.md`.

This split is documented in `brand.md`. The rationale: lucide is the de-facto chrome library and removing it breaks shadcn examples copied from the registry; the brand's "no icon library" rule was always about data viz integrity, not chrome affordances.

## Storybook

- **Run:** `npm run storybook` (Vite, port 6006). `npm run build-storybook` for static export.
- **Framework:** `@storybook/nextjs-vite` (Storybook 9). Vite-based; avoids the webpack tap conflict that breaks `@storybook/nextjs` against Next.js's bundled webpack.
- **Theme switcher:** `@storybook/addon-themes` toolbar item toggles `class="dark"` on the `<html>` element.
- **Stories:** primitives co-located in `app/components/ui/*.stories.tsx`; token stories in `app/stories/tokens/*.stories.tsx`; page-level component stories co-located in `app/(app)/<route>/_<module>/*.stories.tsx` (e.g. `_accounts/row.stories.tsx`).
- **Excluded from Next.js build:** `tsconfig.json` excludes `**/*.stories.tsx` and `.storybook/**` so dev-only types don't fail production builds.

## Brand-rule compliance notes

- **Default `<Button>` is ink.** `<Button variant="accent">` is the explicit teal opt-in. Hover states for `outline` and `ghost` use `--muted`, not `--accent`. Link variant uses `--foreground` with underline (per brand link rule), not the shadcn default `text-primary` highlight.
- **Skeleton primitive included as a sidebar dependency.** It exists in `app/components/ui/skeleton.tsx` because shadcn's sidebar imports it for `<SidebarMenuSkeleton>`. We do not use `<Skeleton>` directly in our pages — loading states use a thin progress indicator per `brand.md`. If a future shadcn upgrade removes the dependency, delete the file.
- **AAA hero numbers.** `brand.md` requires WCAG AAA (7:1) contrast for the total-portfolio-value figure and top-line allocation %. A `<HeroNumber>` primitive that enforces this will be added when the dashboard total is built. Until then, the demo on `/brand` and in `Card` stories uses standard contrast — flagged as TODO.
- **No theme toggle in v0.1** was a brand rule explicitly relaxed in this pivot. The design system now ships a header toggle.
- **Combobox pattern.** Comboboxes are built from `<Popover>` + `<Command>` (shadcn primitives backed by `cmdk`). The `<InstitutionCombobox>` in `_accounts/header.tsx` is the canonical example: trigger is `<Button variant="outline" role="combobox">`, the popover width matches the trigger via `w-(--radix-popover-trigger-width)`, and `shouldFilter={false}` on `<Command>` delegates filtering to the component's own `useMemo` so the create-on-the-fly row is always in the right position. Copy this pattern for any future combobox field.
- **Mock-data modules.** Pages in the `(app)/` group that are not yet wired to the real API use a `_<route>/mocks.ts` file for typed seed data. These files use `new Date()` as the reference instant so staleness states stay accurate indefinitely rather than being pinned to a build-time constant.

## Verification

- `docker compose build && docker compose up app` → `GET /` returns 200, sidebar + header visible, `Card` placeholder renders.
- `docker run ... npm run storybook` → port 6006, stories render, theme toolbar toggles light/dark, no console errors.
- Token round-trip: every value in `brand.md` is reachable as a CSS variable (computed style on any element under `:root` or `.dark` returns the listed hex).
- ECharts removed: `grep -r echarts frontend/` (excluding `node_modules`) returns nothing.

## Open questions / future work

- **Storybook deployment.** Currently local-only. Static export at `storybook-static/` could deploy to Fly.io or Chromatic when team grows beyond solo.
- **Legacy deletion.** Targeted for the PR after `/` reaches feature parity with the legacy dashboard. ~7 files + the `app/legacy/` folder.
- **`<HeroNumber>` primitive.** Enforces AAA contrast and JetBrains Mono Medium styling. Add when first dashboard page lands.
- **Brand donut drill-down.** When real allocation data is wired up, port the legacy drill-down behavior into the Recharts donut with the brand's specified motion (300ms ease-out, fade-not-rotate).
- **`/accounts` real data wiring.** Replace `_accounts/mocks.ts` with SWR calls to `/api/accounts` + `/api/positions`. Requires backend schema migration: `Institution` table, `is_archived` / `is_manual` / `staleness_threshold_days` / `tax_treatment` / `account_type` columns on `Account`, per-account `Snapshot` with FK to `Position` rows.
- **`<Provenance>` primitive.** Full provenance coverage on `/accounts` (every balance, position value, asset-class total). Currently only balance and last-updated carry a `Tooltip`; the architecture hard rule requires all user-visible numbers.
- **`<HeroNumber>` primitive.** Also needed on `/accounts` header NW figure (currently TODO-flagged at AA contrast).
