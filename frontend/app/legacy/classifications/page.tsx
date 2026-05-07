"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy URL — classifications live on the main app shell now. */
export default function LegacyClassificationsRedirect() {
  const router = useRouter();
  useEffect(() => {
    const q = typeof window !== "undefined" ? window.location.search : "";
    router.replace(`/classifications${q}`);
  }, [router]);
  return (
    <main style={{ padding: "2rem", maxWidth: 560, margin: "0 auto" }}>
      <p style={{ color: "#555" }}>Redirecting to classifications…</p>
    </main>
  );
}
