import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { BrandDonut } from './BrandDonut';
import { tokens, viz } from './tokens';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
});

const jbm = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jbm',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Brand · OpenPortfolio',
  description: 'Brand guideline and design system for OpenPortfolio.',
};

const principles: { title: string; body: string }[] = [
  { title: 'Visibility, not advice.', body: "Show what's there. Don't recommend trades or predict outcomes." },
  { title: 'Every number has provenance.', body: 'Hover surfaces source, freshness, and contributing holdings. Missing data is surfaced, never imputed.' },
  { title: 'Math in code, language in LLM.', body: 'Python computes. The LLM extracts and labels; deterministic validation always follows.' },
  { title: 'Open & free.', body: 'No paywall, no caps, no forced accounts. AGPL-3.0; code is auditable.' },
  { title: 'Quiet design.', body: 'Minimum ornamentation. Tokens over decoration. The data is the design.' },
];

const typeRamp: { name: string; font: 'inter' | 'jbm'; weight: number; size: number; lh: number; sample: string; note?: string }[] = [
  { name: 'Display', font: 'inter', weight: 700, size: 40, lh: 48, sample: 'See what you actually own.', note: 'Hero, marketing' },
  { name: 'H1', font: 'inter', weight: 600, size: 28, lh: 36, sample: 'Investment Portfolio' },
  { name: 'H2', font: 'inter', weight: 600, size: 22, lh: 30, sample: 'Asset allocation' },
  { name: 'H3', font: 'inter', weight: 600, size: 18, lh: 26, sample: 'US equity exposure' },
  { name: 'Body', font: 'inter', weight: 400, size: 16, lh: 24, sample: 'Decompose your ETFs and see your real allocation across every account.', note: 'default for paragraphs' },
  { name: 'Body-sm', font: 'inter', weight: 400, size: 14, lh: 20, sample: 'Sourced from broker statement, verified 3 days ago.', note: 'secondary metadata only' },
  { name: 'Label', font: 'inter', weight: 500, size: 13, lh: 18, sample: 'CASH · 14.2%' },
  { name: 'Mono', font: 'jbm', weight: 400, size: 15, lh: 20, sample: '$1,284,503' },
  { name: 'Mono-sm', font: 'jbm', weight: 400, size: 13, lh: 18, sample: 'VTSAX · 412.005 sh', note: 'Tabular cells' },
];

const numbersAndDates: { aspect: string; pattern: string; isMono: boolean; notes: string }[] = [
  { aspect: 'Currency, totals ≥ $10k', pattern: '$847,392', isMono: true, notes: 'No cents — visual noise on large numbers' },
  { aspect: 'Currency, < $10k', pattern: '$847.32', isMono: true, notes: 'Cents — precision matters at smaller scale' },
  { aspect: 'Share prices', pattern: '$4.27', isMono: true, notes: 'Always with cents, regardless of magnitude' },
  { aspect: 'Percentages', pattern: '41.8%', isMono: true, notes: '1 decimal default; whole nums in chart legends; 2 decimals only when drift < 1%' },
  { aspect: 'Negative numbers', pattern: '−$1,234.50', isMono: true, notes: 'Unicode minus (U+2212), not hyphen. Parens reserved for accounting reports' },
  { aspect: 'Abbreviation (charts)', pattern: '$1.2M  ·  $847k', isMono: true, notes: 'Charts only when constrained. Never in tables' },
  { aspect: 'Date — technical', pattern: '2026-04-12', isMono: true, notes: 'ISO 8601. Provenance stamps, timestamps, file names' },
  { aspect: 'Date — prose', pattern: 'Apr 12, 2026', isMono: false, notes: '"Holdings updated Apr 12, 2026"' },
  { aspect: 'Time', pattern: '14:32 UTC', isMono: true, notes: '24-hour with timezone. Only when time matters (rare)' },
];

const motionSpec: { aspect: string; value: string }[] = [
  { aspect: 'Easing — entry', value: 'ease-out' },
  { aspect: 'Easing — exit', value: 'ease-in' },
  { aspect: 'Easing — state change', value: 'ease-in-out' },
  { aspect: 'Duration — small UI (tooltips, hover)', value: '120ms' },
  { aspect: 'Duration — panels, modals, theme toggle', value: '200ms' },
  { aspect: 'Duration — donut drill-down', value: '300ms' },
  { aspect: 'Duration — chart re-render with new data', value: '400ms' },
];

const iconGlyphs: { glyph: string; meaning: string }[] = [
  { glyph: '▲', meaning: 'Gain (discrete)' },
  { glyph: '▼', meaning: 'Loss (discrete)' },
  { glyph: '↗', meaning: 'Trend up (over time)' },
  { glyph: '↘', meaning: 'Trend down (over time)' },
  { glyph: '●', meaning: 'Filled marker' },
  { glyph: '○', meaning: 'Open marker' },
  { glyph: '✕', meaning: "Don't / close / error" },
  { glyph: '→', meaning: 'Forward / next' },
  { glyph: '←', meaning: 'Back' },
];

const voiceCompare: { good: string; bad: string }[] = [
  {
    good: "Couldn't read this paste — the broker format isn't recognized.",
    bad: 'Oops! Something went wrong.',
  },
  {
    good: 'Holdings updated Apr 12, 2026 · Fund composition from SEC N-PORT, Q4 2025.',
    bad: 'Last synced just now.',
  },
  {
    good: 'No holdings yet. Paste positions from any broker to get started.',
    bad: "Welcome! Let's begin your journey.",
  },
];

const avoidWords = ['magical', 'effortless', 'powerful', 'intelligent', 'smart', 'seamless', 'revolutionary'];

const Mark = ({ size = 24, ink = 'var(--foreground)', accent = 'var(--brand)' }: { size?: number; ink?: string; accent?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
    <circle cx="12" cy="12" r="9.25" fill="none" stroke={ink} strokeWidth="3.5" />
    <circle cx="12" cy="12" r="3.5" fill="none" stroke={accent} strokeWidth="3" />
  </svg>
);

const themeCss = `
.brand-root {
  --background: ${tokens.light.background};
  --foreground: ${tokens.light.foreground};
  --muted: ${tokens.light.muted};
  --muted-foreground: ${tokens.light.mutedForeground};
  --border: ${tokens.light.border};
  --brand: ${tokens.light.brand};
  --brand-soft: ${tokens.light.brandSoft};
  --success: ${tokens.light.success};
  --success-soft: ${tokens.light.successSoft};
  --warning: ${tokens.light.warning};
  --warning-soft: ${tokens.light.warningSoft};
  --destructive: ${tokens.light.destructive};
  --destructive-soft: ${tokens.light.destructiveSoft};
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  .brand-root {
    --background: ${tokens.dark.background};
    --foreground: ${tokens.dark.foreground};
    --muted: ${tokens.dark.muted};
    --muted-foreground: ${tokens.dark.mutedForeground};
    --border: ${tokens.dark.border};
    --brand: ${tokens.dark.brand};
    --brand-soft: ${tokens.dark.brandSoft};
    --success: ${tokens.dark.success};
    --success-soft: ${tokens.dark.successSoft};
    --warning: ${tokens.dark.warning};
    --warning-soft: ${tokens.dark.warningSoft};
    --destructive: ${tokens.dark.destructive};
    --destructive-soft: ${tokens.dark.destructiveSoft};
    color-scheme: dark;
  }
}
`;

export default function BrandPage() {
  const t = {
    background: 'var(--background)',
    foreground: 'var(--foreground)',
    muted: 'var(--muted)',
    mutedForeground: 'var(--muted-foreground)',
    border: 'var(--border)',
    brand: 'var(--brand)',
    brandSoft: 'var(--brand-soft)',
    success: 'var(--success)',
    successSoft: 'var(--success-soft)',
    warning: 'var(--warning)',
    warningSoft: 'var(--warning-soft)',
    destructive: 'var(--destructive)',
    destructiveSoft: 'var(--destructive-soft)',
  };
  const containerW = 1080;
  const monoFont = 'var(--font-jbm), ui-monospace, SFMono-Regular, Menlo, monospace';
  const sansFont = 'var(--font-inter), system-ui, -apple-system, sans-serif';

  const sectionStyle: React.CSSProperties = {
    paddingTop: 64,
    paddingBottom: 64,
    borderBottom: `1px solid ${t.border}`,
  };
  const sectionTitle: React.CSSProperties = {
    fontFamily: sansFont,
    fontWeight: 600,
    fontSize: 22,
    lineHeight: '30px',
    margin: 0,
    color: t.foreground,
    letterSpacing: '-0.01em',
  };
  const eyebrow: React.CSSProperties = {
    fontFamily: sansFont,
    fontWeight: 500,
    fontSize: 12,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: t.mutedForeground,
    margin: '0 0 8px 0',
  };
  const muted: React.CSSProperties = {
    color: t.mutedForeground,
    fontFamily: sansFont,
    fontSize: 14,
    lineHeight: '20px',
  };
  const cellTh: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 12px',
    fontFamily: sansFont,
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: t.mutedForeground,
    borderBottom: `1px solid ${t.border}`,
  };
  const cellTd: React.CSSProperties = {
    padding: '10px 12px',
    fontFamily: sansFont,
    fontSize: 14,
    color: t.foreground,
    borderBottom: `1px solid ${t.border}`,
    verticalAlign: 'middle',
  };
  const codeStyle: React.CSSProperties = {
    fontFamily: monoFont,
    fontSize: 13,
    color: t.foreground,
    fontFeatureSettings: '"tnum","lnum"',
  };
  const subTitle: React.CSSProperties = { ...sectionTitle, fontSize: 16, marginTop: 32 };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      <div className={`brand-root ${inter.variable} ${jbm.variable}`} style={{ background: t.background, color: t.foreground }}>
        <div style={{ maxWidth: containerW, margin: '0 auto', padding: '0 32px' }}>
        {/* Hero */}
        <header style={{ paddingTop: 80, paddingBottom: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <Mark size={40} ink={t.foreground} accent={t.brand} />
            <span style={{ fontFamily: sansFont, fontWeight: 600, fontSize: 22, letterSpacing: '-0.01em' }}>
              OpenPortfolio
            </span>
          </div>
          <h1
            style={{
              fontFamily: sansFont,
              fontWeight: 700,
              fontSize: 40,
              lineHeight: '48px',
              letterSpacing: '-0.02em',
              margin: '0 0 16px 0',
              maxWidth: 800,
            }}
          >
            Brand &amp; design system.
          </h1>
          <p style={{ fontFamily: sansFont, fontSize: 20, lineHeight: '30px', color: t.mutedForeground, margin: 0, maxWidth: 720 }}>
            The portfolio x-ray for fragmented holdings. This page documents the visual system end-to-end.
          </p>
        </header>

        {/* Voice & principles */}
        <section style={sectionStyle}>
          <p style={eyebrow}>Voice</p>
          <h2 style={sectionTitle}>Five principles</h2>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            Anti-hype, transparency-first, engineering-honest. Every choice in this system serves
            comprehension over decoration.
          </p>
          <ol
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '32px 0 0 0',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {principles.map((p, i) => (
              <li
                key={p.title}
                style={{
                  background: t.muted,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: 20,
                }}
              >
                <div style={{ ...codeStyle, color: t.mutedForeground, marginBottom: 8 }}>0{i + 1}</div>
                <div style={{ fontFamily: sansFont, fontWeight: 600, fontSize: 16, lineHeight: '24px', marginBottom: 6 }}>
                  {p.title}
                </div>
                <div style={{ fontFamily: sansFont, fontSize: 14, lineHeight: '20px', color: t.mutedForeground }}>
                  {p.body}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Logo */}
        <section style={sectionStyle}>
          <p style={eyebrow}>Logo</p>
          <h2 style={sectionTitle}>Mark, wordmark, lockup</h2>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            Two concentric rings: outer in brand ink, inner in brand teal. Reads as nested holdings —
            an x-ray of layers. The mark works alone as favicon and avatar; the lockup is the default
            in headers and marketing.
          </p>

          {/* Lockups */}
          <div
            style={{
              marginTop: 32,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            <div style={{ background: t.muted, border: `1px solid ${t.border}`, borderRadius: 8, padding: 32 }}>
              <p style={eyebrow}>Lockup</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <Mark size={32} ink={t.foreground} accent={t.brand} />
                <span style={{ fontFamily: sansFont, fontWeight: 600, fontSize: 24, letterSpacing: '-0.01em' }}>
                  OpenPortfolio
                </span>
              </div>
            </div>
            <div style={{ background: t.muted, border: `1px solid ${t.border}`, borderRadius: 8, padding: 32 }}>
              <p style={eyebrow}>Wordmark</p>
              <div style={{ marginTop: 12, fontFamily: sansFont, fontWeight: 600, fontSize: 24, letterSpacing: '-0.01em' }}>
                OpenPortfolio
              </div>
            </div>
            <div style={{ background: t.muted, border: `1px solid ${t.border}`, borderRadius: 8, padding: 32 }}>
              <p style={eyebrow}>Mark</p>
              <div style={{ marginTop: 12 }}>
                <Mark size={48} ink={t.foreground} accent={t.brand} />
              </div>
            </div>
            <div style={{ background: tokens.dark.background, border: `1px solid ${t.border}`, borderRadius: 8, padding: 32 }}>
              <p style={{ ...eyebrow, color: tokens.dark.mutedForeground }}>On dark</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <Mark size={32} ink={tokens.dark.foreground} accent={tokens.dark.brand} />
                <span
                  style={{
                    fontFamily: sansFont,
                    fontWeight: 600,
                    fontSize: 24,
                    letterSpacing: '-0.01em',
                    color: tokens.dark.foreground,
                  }}
                >
                  OpenPortfolio
                </span>
              </div>
            </div>
          </div>

          {/* Sizes */}
          <div style={{ marginTop: 32 }}>
            <p style={eyebrow}>Mark sizes</p>
            <div
              style={{
                marginTop: 12,
                background: t.muted,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: 32,
                display: 'flex',
                alignItems: 'flex-end',
                gap: 32,
                flexWrap: 'wrap',
              }}
            >
              {[16, 24, 32, 48, 64, 96].map((s) => (
                <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <Mark size={s} ink={t.foreground} accent={t.brand} />
                  <span style={{ ...codeStyle, color: t.mutedForeground }}>{s}px</span>
                </div>
              ))}
            </div>
            <p style={{ ...muted, marginTop: 12 }}>
              Minimum: mark 16px, wordmark 80px wide. Clearspace: 0.5× mark height on all sides.
            </p>
          </div>

          {/* Backgrounds */}
          <div style={{ marginTop: 32 }}>
            <p style={eyebrow}>Backgrounds</p>
            <p style={{ ...muted, marginTop: 4, maxWidth: 720 }}>
              The logo only appears on <span style={codeStyle}>--background</span>,{' '}
              <span style={codeStyle}>--muted</span>, or pure black/white surfaces. Never on photography,
              gradients, or arbitrary colors.
            </p>
          </div>

          {/* Don'ts */}
          <div style={{ marginTop: 32 }}>
            <p style={eyebrow}>Don't</p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '12px 0 0 0',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              {[
                'No fills inside the rings',
                'No all-caps wordmark',
                'No stretching or skewing',
                'No drop shadows or glows',
                'No gradients on the mark',
                'No rotation off the axis',
                'No placement on photos or non-token colors',
              ].map((d) => (
                <li
                  key={d}
                  style={{
                    background: t.muted,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    padding: '12px 16px',
                    fontFamily: sansFont,
                    fontSize: 14,
                    color: t.foreground,
                  }}
                >
                  <span style={{ color: t.destructive, marginRight: 8 }}>✕</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Color */}
        <section style={sectionStyle}>
          <p style={eyebrow}>Color</p>
          <h2 style={sectionTitle}>Tokens</h2>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            Slate ink with teal accent. Teal is "almost invisible" — it appears on focus rings, one
            or two key actions, and the total-portfolio-value figure. Status and asset-viz colors
            stay out of UI chrome.
          </p>
          <p style={{ ...muted, marginTop: 12, maxWidth: 720 }}>
            <strong style={{ color: t.foreground, fontWeight: 600 }}>Status pill rule.</strong> Pill
            background uses the matching <span style={codeStyle}>-soft</span> variant; foreground/icon
            uses the base semantic token. Always pair with a text label or glyph.
          </p>

          {/* Semantic */}
          <h3 style={subTitle}>Semantic</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16, tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={cellTh}>Token</th>
                <th style={cellTh}>Light</th>
                <th style={cellTh}>Dark</th>
                <th style={cellTh}>Use</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['background', 'Page background'],
                  ['foreground', 'Primary text'],
                  ['muted', 'Cards, sections'],
                  ['mutedForeground', 'Secondary text'],
                  ['border', 'Dividers'],
                  ['brand', 'Brand · sparingly'],
                  ['brandSoft', 'Focus rings, hovers'],
                  ['success', 'Gains (text/icon)'],
                  ['successSoft', 'Pill backgrounds'],
                  ['warning', 'Warnings (text/icon)'],
                  ['warningSoft', 'Pill backgrounds'],
                  ['destructive', 'Losses (text/icon)'],
                  ['destructiveSoft', 'Pill backgrounds'],
                ] as const
              ).map(([key, use]) => (
                <tr key={key}>
                  <td style={cellTd}>
                    <span style={codeStyle}>--{key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}</span>
                  </td>
                  <td style={cellTd}>
                    <Swatch color={tokens.light[key]} on="light" />
                  </td>
                  <td style={cellTd}>
                    <Swatch color={tokens.dark[key]} on="dark" />
                  </td>
                  <td style={{ ...cellTd, color: t.mutedForeground }}>{use}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Asset viz */}
          <h3 style={{ ...sectionTitle, fontSize: 16, marginTop: 40 }}>Asset categories</h3>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            Reserved for charts and category badges. Order shown is the canonical donut order.
          </p>
          <div
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
            }}
          >
            {(
              [
                ['cash', 'Cash'],
                ['usEquity', 'US equity'],
                ['intlEquity', 'Intl equity'],
                ['fixedIncome', 'Fixed income'],
                ['realEstate', 'Real estate'],
                ['crypto', 'Crypto'],
                ['alts', 'Alts'],
                ['other', 'Other'],
              ] as const
            ).map(([key, label]) => (
              <div
                key={key}
                style={{
                  background: t.muted,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 4, background: viz.light[key] }} />
                  <span style={{ width: 24, height: 24, borderRadius: 4, background: viz.dark[key] }} />
                </div>
                <div style={{ fontFamily: sansFont, fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{label}</div>
                <div style={{ ...codeStyle, color: t.mutedForeground, fontSize: 12 }}>
                  {viz.light[key]} · {viz.dark[key]}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Typography */}
        <section style={sectionStyle}>
          <p style={eyebrow}>Typography</p>
          <h2 style={sectionTitle}>Inter &amp; JetBrains Mono</h2>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            Inter for all UI and headings (weight + size as hierarchy). JetBrains Mono for numbers,
            tickers, and code — its tabular figures align decimals in column views. Both self-hosted
            via <span style={codeStyle}>next/font</span>.
          </p>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 32, tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...cellTh, width: '12%' }}>Style</th>
                <th style={{ ...cellTh, width: '18%' }}>Spec</th>
                <th style={cellTh}>Specimen</th>
                <th style={{ ...cellTh, width: '24%' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {typeRamp.map((r) => (
                <tr key={r.name}>
                  <td style={cellTd}>
                    <span style={{ fontFamily: sansFont, fontWeight: 500 }}>{r.name}</span>
                  </td>
                  <td style={{ ...cellTd, color: t.mutedForeground }}>
                    <span style={codeStyle}>
                      {r.font === 'inter' ? 'Inter' : 'JBM'} {r.weight} · {r.size}/{r.lh}
                    </span>
                  </td>
                  <td style={cellTd}>
                    <span
                      style={{
                        fontFamily: r.font === 'inter' ? sansFont : monoFont,
                        fontWeight: r.weight,
                        fontSize: r.size,
                        lineHeight: `${r.lh}px`,
                        letterSpacing: r.size >= 28 ? '-0.02em' : r.size >= 18 ? '-0.01em' : 'normal',
                        fontFeatureSettings: '"tnum","lnum"',
                      }}
                    >
                      {r.sample}
                    </span>
                  </td>
                  <td style={{ ...cellTd, color: t.mutedForeground, fontSize: 12, fontStyle: r.note ? 'italic' : 'normal' }}>
                    {r.note ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ ...muted, marginTop: 24, maxWidth: 720 }}>
            Apply <span style={codeStyle}>font-feature-settings: "tnum", "lnum"</span> on every numeric
            cell. Default to <strong style={{ color: t.foreground, fontWeight: 600 }}>Body</strong>{' '}
            unless density is the explicit goal — Body-sm earns its place only for secondary content.
          </p>

          {/* Numbers & dates */}
          <h3 style={subTitle}>Numbers &amp; dates</h3>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            Patterns for the most repeated formats in the product. Consistency here is more visible
            than any other typographic choice.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16, tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...cellTh, width: '28%' }}>Aspect</th>
                <th style={{ ...cellTh, width: '24%' }}>Pattern</th>
                <th style={cellTh}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {numbersAndDates.map((n) => (
                <tr key={n.aspect}>
                  <td style={cellTd}>
                    <span style={{ fontFamily: sansFont, fontWeight: 500 }}>{n.aspect}</span>
                  </td>
                  <td style={cellTd}>
                    <span
                      style={
                        n.isMono
                          ? { ...codeStyle, fontSize: 14, color: t.foreground }
                          : { fontFamily: sansFont, fontSize: 14, color: t.foreground }
                      }
                    >
                      {n.pattern}
                    </span>
                  </td>
                  <td style={{ ...cellTd, color: t.mutedForeground }}>{n.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Spacing & radius & elevation */}
        <section style={sectionStyle}>
          <p style={eyebrow}>Layout</p>
          <h2 style={sectionTitle}>Spacing, radius, elevation</h2>

          <h3 style={subTitle}>Spacing scale (4px base)</h3>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            {[4, 8, 12, 16, 24, 32, 48, 64, 96].map((s) => (
              <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                <div style={{ width: s, height: s, background: t.brand, borderRadius: 2 }} />
                <span style={{ ...codeStyle, color: t.mutedForeground }}>{s}</span>
              </div>
            ))}
          </div>

          <h3 style={{ ...sectionTitle, fontSize: 16, marginTop: 40 }}>Radius</h3>
          <div style={{ marginTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[
              { name: 'sharp', value: 0 },
              { name: 'sm', value: 4 },
              { name: 'md', value: 8 },
              { name: 'lg', value: 12 },
              { name: 'pill', value: 9999 },
            ].map((r) => (
              <div key={r.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    background: t.muted,
                    border: `1px solid ${t.border}`,
                    borderRadius: r.value,
                  }}
                />
                <span style={{ ...codeStyle, color: t.mutedForeground }}>{r.name} · {r.value === 9999 ? '∞' : r.value}</span>
              </div>
            ))}
          </div>

          <h3 style={{ ...sectionTitle, fontSize: 16, marginTop: 40 }}>Elevation</h3>
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            {[
              { level: 0, shadow: 'none', use: 'Default' },
              { level: 1, shadow: '0 1px 2px rgba(0,0,0,0.04)', use: 'Row separation' },
              { level: 2, shadow: '0 4px 12px rgba(0,0,0,0.06)', use: 'Cards, popovers' },
              { level: 3, shadow: '0 12px 32px rgba(0,0,0,0.10)', use: 'Modals, dropdowns' },
            ].map((e) => (
              <div
                key={e.level}
                style={{
                  background: t.background,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: 20,
                  boxShadow: e.shadow,
                }}
              >
                <div style={{ fontFamily: sansFont, fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  Elevation {e.level}
                </div>
                <div style={{ ...muted, fontSize: 13 }}>{e.use}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Motion */}
        <section style={sectionStyle}>
          <p style={eyebrow}>Motion</p>
          <h2 style={sectionTitle}>Reserved and functional</h2>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            Motion serves comprehension, never decoration. Donut transitions fade-and-shift, never
            spin or rotate. Honor <span style={codeStyle}>prefers-reduced-motion: reduce</span> by
            collapsing all transitions to 0ms.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24, tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...cellTh, width: '60%' }}>Aspect</th>
                <th style={cellTh}>Value</th>
              </tr>
            </thead>
            <tbody>
              {motionSpec.map((m) => (
                <tr key={m.aspect}>
                  <td style={cellTd}>
                    <span style={{ fontFamily: sansFont }}>{m.aspect}</span>
                  </td>
                  <td style={cellTd}>
                    <span style={codeStyle}>{m.value}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '24px 0 0 0',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {[
              'No looping animations',
              'No bounces',
              'No page-load splash',
              'No parallax',
              'No spinning charts',
            ].map((d) => (
              <li
                key={d}
                style={{
                  background: t.muted,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: '12px 16px',
                  fontFamily: sansFont,
                  fontSize: 14,
                  color: t.foreground,
                }}
              >
                <span style={{ color: t.destructive, marginRight: 8 }}>✕</span>
                {d}
              </li>
            ))}
          </ul>
        </section>

        {/* Components */}
        <section style={sectionStyle}>
          <p style={eyebrow}>Components</p>
          <h2 style={sectionTitle}>Tokens applied</h2>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            Demonstrates how the tokens compose into the primitives users actually see.
          </p>

          {/* Buttons */}
          <h3 style={subTitle}>Buttons</h3>
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              style={{
                fontFamily: sansFont,
                fontWeight: 500,
                fontSize: 14,
                background: t.brand,
                color: tokens.dark.foreground,
                border: 'none',
                padding: '10px 18px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Primary action
            </button>
            <button
              style={{
                fontFamily: sansFont,
                fontWeight: 500,
                fontSize: 14,
                background: t.background,
                color: t.foreground,
                border: `1px solid ${t.border}`,
                padding: '10px 18px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Secondary
            </button>
            <button
              style={{
                fontFamily: sansFont,
                fontWeight: 500,
                fontSize: 14,
                background: 'transparent',
                color: t.foreground,
                border: 'none',
                padding: '10px 12px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Ghost
            </button>
          </div>
          <p style={{ ...muted, marginTop: 12 }}>
            Primary uses <span style={codeStyle}>--brand</span>; reserve for the single most important
            action per view. Secondary and ghost cover everything else.
          </p>

          {/* Links */}
          <h3 style={subTitle}>Links</h3>
          <p style={{ fontFamily: sansFont, fontSize: 16, lineHeight: '24px', color: t.foreground, marginTop: 16, maxWidth: 720 }}>
            Inline links use{' '}
            <span
              style={{
                color: t.foreground,
                textDecoration: 'underline',
                textUnderlineOffset: '0.15em',
                textDecorationThickness: '1px',
              }}
            >
              foreground color with underline
            </span>
            , never teal. Visited state matches default — links don't change color after click.
          </p>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            The brand-color rule reserves <span style={codeStyle}>--brand</span> for focus rings, key
            actions, and the total-value figure. Links stay quiet.
          </p>

          {/* Focus state */}
          <h3 style={subTitle}>Focus state</h3>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            Every interactive element gets a 2px outset focus ring in{' '}
            <span style={codeStyle}>--brand-soft</span> with 2px offset. Never remove with{' '}
            <span style={codeStyle}>outline: none</span> unless replaced.
          </p>
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              style={{
                fontFamily: sansFont,
                fontWeight: 500,
                fontSize: 14,
                background: t.brand,
                color: tokens.dark.foreground,
                border: 'none',
                padding: '10px 18px',
                borderRadius: 8,
                cursor: 'pointer',
                outline: `2px solid ${t.brandSoft}`,
                outlineOffset: 2,
              }}
            >
              Primary (focused)
            </button>
            <button
              style={{
                fontFamily: sansFont,
                fontWeight: 500,
                fontSize: 14,
                background: t.background,
                color: t.foreground,
                border: `1px solid ${t.border}`,
                padding: '10px 18px',
                borderRadius: 8,
                cursor: 'pointer',
                outline: `2px solid ${t.brandSoft}`,
                outlineOffset: 2,
              }}
            >
              Secondary (focused)
            </button>
          </div>

          {/* Status pills (target spec — using -soft tokens) */}
          <h3 style={{ ...sectionTitle, fontSize: 16, marginTop: 40 }}>Status pills</h3>
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {(
              [
                { label: '▲ Gain', bg: t.successSoft, fg: t.success },
                { label: 'Minor drift', bg: t.warningSoft, fg: t.warning },
                { label: '▼ Loss', bg: t.destructiveSoft, fg: t.destructive },
              ] as const
            ).map((p) => (
              <span
                key={p.label}
                style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  borderRadius: 9999,
                  fontFamily: sansFont,
                  fontSize: 13,
                  fontWeight: 600,
                  background: p.bg,
                  color: p.fg,
                  fontFeatureSettings: '"tnum","lnum"',
                }}
              >
                {p.label}
              </span>
            ))}
          </div>
          <p style={{ ...muted, marginTop: 12 }}>
            Background <span style={codeStyle}>--*-soft</span>, foreground base semantic. Pair with
            text or glyph — never color alone.
          </p>

          {/* Iconography */}
          <h3 style={subTitle}>Iconography</h3>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            No icon library. Approved Unicode glyph set:
          </p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '16px 0 0 0',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 8,
            }}
          >
            {iconGlyphs.map((g) => (
              <li
                key={g.glyph}
                style={{
                  background: t.muted,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: sansFont,
                    fontSize: 22,
                    lineHeight: 1,
                    color: t.foreground,
                    width: 24,
                    textAlign: 'center',
                  }}
                >
                  {g.glyph}
                </span>
                <span style={{ fontFamily: sansFont, fontSize: 13, color: t.mutedForeground }}>{g.meaning}</span>
              </li>
            ))}
          </ul>
          <p style={{ ...muted, marginTop: 12, maxWidth: 720 }}>
            Use <span style={{ fontFamily: sansFont, color: t.foreground }}>▲</span>/
            <span style={{ fontFamily: sansFont, color: t.foreground }}>▼</span> for discrete values
            (gain/loss amounts, status pills); use{' '}
            <span style={{ fontFamily: sansFont, color: t.foreground }}>↗</span>/
            <span style={{ fontFamily: sansFont, color: t.foreground }}>↘</span> for trends over time
            (sparklines, axes).
          </p>

          {/* Tooltips & popovers */}
          <h3 style={subTitle}>Tooltips &amp; popovers</h3>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            The provenance hover — every user-visible number exposes its source — is the product's
            hero interaction. Background <span style={codeStyle}>--background</span>, border{' '}
            <span style={codeStyle}>1px solid --border</span>, radius <span style={codeStyle}>md</span>,
            padding <span style={codeStyle}>12 16</span>, max-width 320px, body-sm text, elevation 2,
            120ms fade-in.
          </p>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                background: t.background,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: '12px 16px',
                maxWidth: 320,
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                fontFamily: sansFont,
                fontSize: 14,
                lineHeight: '20px',
                color: t.foreground,
              }}
            >
              <div style={{ ...eyebrow, marginBottom: 6 }}>Provenance</div>
              <div>Holdings updated Apr 12, 2026 · Fund composition from SEC N-PORT, Q4 2025.</div>
            </div>
          </div>

          {/* State surfaces */}
          <h3 style={subTitle}>State surfaces</h3>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            Empty, loading, and error states are first-impression surfaces. They follow the same voice
            as the rest of the product: explanatory, specific, and never marketing.
          </p>
          <div
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {/* Empty */}
            <div
              style={{
                background: t.muted,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: 24,
                minHeight: 180,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={eyebrow}>Empty</p>
                <p style={{ fontFamily: sansFont, fontSize: 15, lineHeight: '22px', margin: 0, color: t.foreground }}>
                  No holdings yet.
                </p>
                <p style={{ ...muted, marginTop: 4 }}>Paste positions from any broker to get started.</p>
              </div>
              <button
                style={{
                  alignSelf: 'flex-start',
                  fontFamily: sansFont,
                  fontWeight: 500,
                  fontSize: 13,
                  background: t.brand,
                  color: tokens.dark.foreground,
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  marginTop: 16,
                }}
              >
                Paste holdings
              </button>
            </div>

            {/* Loading */}
            <div
              style={{
                background: t.muted,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: 0,
                minHeight: 180,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <div style={{ height: 2, background: t.brand, width: '40%' }} />
              <div style={{ padding: 24 }}>
                <p style={eyebrow}>Loading</p>
                <p style={{ fontFamily: sansFont, fontSize: 15, lineHeight: '22px', margin: 0 }}>
                  Refreshing positions…
                </p>
                <p style={{ ...muted, marginTop: 4 }}>as of Apr 12, 2026</p>
              </div>
            </div>

            {/* Error */}
            <div
              style={{
                background: t.muted,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: 24,
                minHeight: 180,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <p style={eyebrow}>Error</p>
              <p style={{ fontFamily: sansFont, fontSize: 15, lineHeight: '22px', margin: 0, color: t.destructive }}>
                <span aria-hidden style={{ marginRight: 6 }}>✕</span>
                Couldn't read this paste.
              </p>
              <p style={{ ...muted, marginTop: 4 }}>The broker format isn't recognized. Try a CSV export instead.</p>
            </div>
          </div>
          <p style={{ ...muted, marginTop: 12 }}>
            Loading uses a single thin progress bar (1–2px) at the top of the affected component. No
            skeleton loaders that mock content shape — never show fake data.
          </p>

          {/* Charts */}
          <h3 style={subTitle}>Charts</h3>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            The donut (asset allocation) is the product hero.
          </p>
          <div
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'minmax(240px, 280px) 1fr',
              gap: 32,
              alignItems: 'center',
              background: t.muted,
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <BrandDonut />
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              {[
                ['Segment separation', 'Stroke each segment with --background — clean visual boundary, not a darker line.'],
                ['Inner radius', 'Donut, not pie — leave room for the total-value label at center.'],
                ['Center label', '"Total" in Inter Medium above; total value in JetBrains Mono Medium, in --brand.'],
                ['Hover', 'Selected segment emphasized; siblings drop opacity. Never spin or bounce.'],
                ['Drill-down', 'Selected expands; siblings fade. 300ms ease-out.'],
                ['Empty state', '3-ring outline in --border with prompt to add holdings.'],
                ['Legend', 'Below chart, single row, swatches in canonical asset-category order.'],
              ].map(([title, body]) => (
                <li key={title} style={{ fontFamily: sansFont, fontSize: 13, lineHeight: '20px' }}>
                  <strong style={{ color: t.foreground, fontWeight: 600 }}>{title}.</strong>{' '}
                  <span style={{ color: t.mutedForeground }}>{body}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Tabular row */}
          <h3 style={subTitle}>Tabular row</h3>
          <div
            style={{
              marginTop: 16,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              overflow: 'hidden',
              background: t.background,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 140px 140px 100px',
                padding: '10px 16px',
                background: t.muted,
                borderBottom: `1px solid ${t.border}`,
                fontFamily: sansFont,
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: t.mutedForeground,
              }}
            >
              <span>Symbol</span>
              <span>Name</span>
              <span style={{ textAlign: 'right' }}>Shares</span>
              <span style={{ textAlign: 'right' }}>Value</span>
              <span style={{ textAlign: 'right' }}>%</span>
            </div>
            {[
              { sym: 'VTSAX', name: 'Vanguard Total Stock Mkt', sh: '412.005', val: '$58,712', pct: '24.1%' },
              { sym: 'VTIAX', name: 'Vanguard Total Intl Stock', sh: '186.142', val: '$22,445', pct: '9.2%' },
              { sym: 'VBTLX', name: 'Vanguard Total Bond Mkt', sh: '301.770', val: '$31,089', pct: '12.7%' },
            ].map((r, i, arr) => (
              <div
                key={r.sym}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 140px 140px 100px',
                  padding: '12px 16px',
                  borderBottom: i < arr.length - 1 ? `1px solid ${t.border}` : 'none',
                  alignItems: 'center',
                }}
              >
                <span style={{ ...codeStyle, fontWeight: 500 }}>{r.sym}</span>
                <span style={{ fontFamily: sansFont, fontSize: 14, color: t.mutedForeground }}>{r.name}</span>
                <span style={{ ...codeStyle, textAlign: 'right' }}>{r.sh}</span>
                <span style={{ ...codeStyle, textAlign: 'right' }}>{r.val}</span>
                <span style={{ ...codeStyle, textAlign: 'right', color: t.mutedForeground }}>{r.pct}</span>
              </div>
            ))}
          </div>
          <p style={{ ...muted, marginTop: 12 }}>
            Symbol and figures in JetBrains Mono with tabular nums. Names in Inter. Right-align all
            numeric columns; left-align labels.
          </p>

          {/* Total value emphasis */}
          <h3 style={subTitle}>Total value (the one teal moment)</h3>
          <div
            style={{
              marginTop: 16,
              padding: 24,
              background: t.muted,
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              maxWidth: 360,
            }}
          >
            <div style={{ ...eyebrow, marginBottom: 8 }}>Total portfolio value</div>
            <div
              style={{
                fontFamily: monoFont,
                fontSize: 36,
                fontWeight: 500,
                lineHeight: '44px',
                letterSpacing: '-0.01em',
                color: t.brand,
                fontFeatureSettings: '"tnum","lnum"',
              }}
            >
              $1,284,503
            </div>
            <div style={{ ...muted, marginTop: 4 }}>across 6 accounts · updated Apr 12, 2026</div>
          </div>
        </section>

        {/* Voice */}
        <section style={sectionStyle}>
          <p style={eyebrow}>Voice</p>
          <h2 style={sectionTitle}>Plain, technical, second person</h2>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            The voice in copy is operationalized below. Deviation should be a deliberate choice.
          </p>

          <h3 style={subTitle}>Good vs. bad</h3>
          <ul style={{ margin: '16px 0 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
            {voiceCompare.map((v, i) => (
              <li
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    background: t.successSoft,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    padding: 16,
                  }}
                >
                  <div style={{ ...eyebrow, color: t.success, marginBottom: 6 }}>Good</div>
                  <div style={{ fontFamily: sansFont, fontSize: 14, lineHeight: '20px', color: t.foreground }}>
                    {v.good}
                  </div>
                </div>
                <div
                  style={{
                    background: t.destructiveSoft,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    padding: 16,
                  }}
                >
                  <div style={{ ...eyebrow, color: t.destructive, marginBottom: 6 }}>Avoid</div>
                  <div style={{ fontFamily: sansFont, fontSize: 14, lineHeight: '20px', color: t.foreground }}>
                    {v.bad}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <h3 style={subTitle}>Avoid these words</h3>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            Marketing claims that don't describe what the feature does. If a feature is good, say what it does.
          </p>
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {avoidWords.map((w) => (
              <span
                key={w}
                style={{
                  display: 'inline-block',
                  padding: '6px 12px',
                  borderRadius: 9999,
                  fontFamily: sansFont,
                  fontSize: 13,
                  fontWeight: 500,
                  background: t.destructiveSoft,
                  color: t.destructive,
                  textDecoration: 'line-through',
                }}
              >
                {w}
              </span>
            ))}
          </div>
          <p style={{ ...muted, marginTop: 12 }}>
            Use functional verbs instead: <span style={{ color: t.foreground }}>shows · computes · displays · decomposes · imports · exports</span>.
          </p>

          <h3 style={subTitle}>Provenance pattern</h3>
          <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
            Every user-visible number names where it came from. Pattern:{' '}
            <span style={codeStyle}>[Data] [verb] [date] · [source if applicable]</span>
          </p>
          <ul style={{ margin: '16px 0 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {[
              'Holdings updated Apr 12, 2026',
              'Fund compositions from SEC N-PORT, Q4 2025',
              'Real estate value provided by user',
            ].map((line) => (
              <li
                key={line}
                style={{
                  background: t.muted,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontFamily: sansFont,
                  fontSize: 14,
                  color: t.mutedForeground,
                }}
              >
                {line}
              </li>
            ))}
          </ul>

          <p style={{ ...muted, marginTop: 24, maxWidth: 720 }}>
            <strong style={{ color: t.foreground, fontWeight: 600 }}>No emojis in product UI.</strong>{' '}
            Acceptable in <span style={codeStyle}>README.md</span>, blog posts, and social.
          </p>
        </section>

        {/* Accessibility */}
        <section style={{ ...sectionStyle, borderBottom: 'none' }}>
          <p style={eyebrow}>Accessibility</p>
          <h2 style={sectionTitle}>Quiet, but always legible</h2>
          <ul style={{ margin: '24px 0 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 16 }}>
            {[
              {
                title: 'WCAG AA contrast',
                body: 'Foreground/background pairs in semantic tokens clear 4.5:1 for body text. Verify any new pairing before shipping.',
              },
              {
                title: 'WCAG AAA on hero numbers',
                body: 'Total portfolio value and top-line allocation % clear 7:1. The product\'s most-read figures earn the higher target.',
              },
              {
                title: 'Status is never color alone',
                body: 'Pair every status with a glyph or label. Gains use ▲ +$X, losses use ▼ −$X, drift uses an explicit pill label.',
              },
              {
                title: 'Focus rings are sacred',
                body: '2px outset using --brand-soft on every interactive element. Never remove with outline:none unless replaced.',
              },
              {
                title: 'Honor reduced motion',
                body: 'prefers-reduced-motion: reduce collapses all transitions to 0ms. Animation is never load-bearing for meaning.',
              },
              {
                title: 'Provenance on every number',
                body: 'Every user-visible figure exposes its source on hover or click. Missing data is surfaced, not silently zeroed.',
              },
            ].map((a) => (
              <li
                key={a.title}
                style={{
                  background: t.muted,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: 20,
                }}
              >
                <div style={{ fontFamily: sansFont, fontWeight: 600, fontSize: 16, marginBottom: 6 }}>{a.title}</div>
                <div style={{ ...muted }}>{a.body}</div>
              </li>
            ))}
          </ul>
        </section>

        {/* Footer */}
        <footer style={{ paddingTop: 48, paddingBottom: 96 }}>
          <div style={{ ...muted, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>Brand spec</span>
            <span>·</span>
            <span>
              Source: <span style={codeStyle}>frontend/app/brand/page.tsx</span>
            </span>
            <span>·</span>
            <span>
              Summary: <span style={codeStyle}>docs/brand.md</span>
            </span>
          </div>
        </footer>
        </div>
      </div>
    </>
  );
}

function Swatch({ color, on }: { color: string; on: 'light' | 'dark' }) {
  const bg = on === 'light' ? tokens.light.background : tokens.dark.background;
  const border = on === 'light' ? tokens.light.border : tokens.dark.border;
  const fg = on === 'light' ? tokens.light.foreground : tokens.dark.mutedForeground;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 6,
        padding: '4px 10px 4px 4px',
      }}
    >
      <span style={{ width: 22, height: 22, borderRadius: 4, background: color }} aria-hidden />
      <span
        style={{
          fontFamily: 'var(--font-jbm), ui-monospace, monospace',
          fontSize: 12,
          color: fg,
        }}
      >
        {color}
      </span>
    </div>
  );
}
