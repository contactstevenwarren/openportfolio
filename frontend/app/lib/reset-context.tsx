"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ResetContextValue = { resetKey: number; reset: () => void };

const ResetContext = createContext<ResetContextValue | null>(null);

export function ResetProvider({ children }: { children: ReactNode }) {
  const [resetKey, setResetKey] = useState(0);
  const reset = useCallback(() => setResetKey((k) => k + 1), []);
  return <ResetContext.Provider value={{ resetKey, reset }}>{children}</ResetContext.Provider>;
}

export function useReset(): ResetContextValue {
  const ctx = useContext(ResetContext);
  if (!ctx) throw new Error("useReset must be used inside <ResetProvider>");
  return ctx;
}

export function ResetBoundary({ children }: { children: ReactNode }) {
  const { resetKey } = useReset();
  return <div key={resetKey} className="contents">{children}</div>;
}
