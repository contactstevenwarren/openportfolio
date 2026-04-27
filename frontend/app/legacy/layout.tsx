export default function LegacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <nav
        style={{
          padding: "0.75rem 2rem",
          borderBottom: "1px solid #ddd",
          display: "flex",
          gap: "1.5rem",
          background: "#fafafa",
        }}
      >
        <a href="/legacy" style={{ fontWeight: 600, color: "#111" }}>
          OpenPortfolio · Legacy
        </a>
        <a href="/legacy/accounts" style={{ color: "#111" }}>
          Accounts
        </a>
        <a href="/legacy/positions" style={{ color: "#111" }}>
          Positions
        </a>
        <a href="/legacy/classifications" style={{ color: "#111" }}>
          Classifications
        </a>
        <a href="/" style={{ marginLeft: "auto", color: "#666" }}>
          ← Back to new UI
        </a>
      </nav>
      {children}
    </>
  );
}
