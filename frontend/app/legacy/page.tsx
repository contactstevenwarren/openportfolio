import Link from "next/link";

const routes = [
  { href: "/legacy/accounts", label: "Accounts" },
  { href: "/legacy/positions", label: "Positions" },
  { href: "/legacy/classifications", label: "Classifications" },
  { href: "/legacy/targets", label: "Targets" },
  { href: "/legacy/paste", label: "Paste positions" },
  { href: "/legacy/manual", label: "Manual entry" },
];

export default function LegacyIndex() {
  return (
    <div style={{ padding: "2rem", maxWidth: 720 }}>
      <h1 style={{ marginTop: 0 }}>Legacy</h1>
      <p style={{ color: "#666" }}>
        Pre-redesign data-entry routes. Visual quality not maintained — kept for
        functional reference only. The new UI lives at <code>/</code>.
      </p>
      <ul style={{ paddingLeft: "1rem" }}>
        {routes.map((r) => (
          <li key={r.href} style={{ marginBottom: "0.25rem" }}>
            <Link href={r.href} style={{ color: "#111" }}>
              {r.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
