export const metadata = { title: 'OpenPortfolio' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', color: '#111' }}>
        <nav
          style={{
            padding: '0.75rem 2rem',
            borderBottom: '1px solid #ddd',
            display: 'flex',
            gap: '1.5rem',
            background: '#fafafa',
          }}
        >
          <a href="/" style={{ fontWeight: 600, color: '#111' }}>
            OpenPortfolio
          </a>
          <a href="/paste" style={{ color: '#111' }}>
            Paste
          </a>
          <a href="/manual" style={{ color: '#111' }}>
            Manual
          </a>
          <a href="/accounts" style={{ color: '#111' }}>
            Accounts
          </a>
          <a href="/positions" style={{ color: '#111' }}>
            Positions
          </a>
        </nav>
        {children}
      </body>
    </html>
  );
}
