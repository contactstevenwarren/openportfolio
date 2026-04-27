export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
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
        <a href="/accounts" style={{ color: '#111' }}>
          Accounts
        </a>
        <a href="/positions" style={{ color: '#111' }}>
          Positions
        </a>
        <a href="/classifications" style={{ color: '#111' }}>
          Classifications
        </a>
      </nav>
      {children}
    </>
  );
}
