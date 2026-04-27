import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'OpenPortfolio — see what you actually own';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '80px',
          background: '#fafafa',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <svg viewBox="0 0 24 24" width="80" height="80">
            <circle cx="12" cy="12" r="9.25" fill="none" stroke="#0a0a0a" strokeWidth="3.5" />
            <circle cx="12" cy="12" r="3.5" fill="none" stroke="#0f766e" strokeWidth="3" />
          </svg>
          <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: '-0.02em', color: '#0a0a0a' }}>
            OpenPortfolio
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: '-0.02em', color: '#0a0a0a', lineHeight: 1.1 }}>
            See what you actually own.
          </div>
          <div style={{ fontSize: 28, color: '#71717a', letterSpacing: '-0.005em' }}>
            The portfolio x-ray for fragmented holdings.
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 22, color: '#71717a' }}>
          <span>openportfolio.fly.dev</span>
          <span>open source · AGPL-3.0</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
