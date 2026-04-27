import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: '#fafafa',
        }}
      >
        <svg viewBox="0 0 24 24" width="140" height="140">
          <circle cx="12" cy="12" r="9.25" fill="none" stroke="#0a0a0a" strokeWidth="3.5" />
          <circle cx="12" cy="12" r="3.5" fill="none" stroke="#0f766e" strokeWidth="3" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
