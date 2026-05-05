"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import useSWR from "swr";

import {
  api,
  type AllocationResult,
  type AllocationSlice,
  type RebalanceMove,
} from "@/app/lib/api";
import { bandFromAbs, driftThresholds } from "@/app/lib/allocationTargets";

const STALE_DAYS = 30;

type SandboxCtx = {
  newCash: number;
  setNewCash: (v: number) => void;
  excessCashRedeploy: number;
  setExcessCashRedeploy: (v: number) => void;
  simulatedSlices: AllocationSlice[] | undefined;
  moves: RebalanceMove[];
  rebalanceError: boolean;
  isStale: boolean;
  lastAsOf: string | null;
};

const Context = createContext<SandboxCtx>({
  newCash: 0,
  setNewCash: () => {},
  excessCashRedeploy: 0,
  setExcessCashRedeploy: () => {},
  simulatedSlices: undefined,
  moves: [],
  rebalanceError: false,
  isStale: false,
  lastAsOf: null,
});

export function useSandbox(): SandboxCtx {
  return useContext(Context);
}

export function SandboxProvider({ children }: { children: ReactNode }) {
  const [newCash, setNewCash] = useState(0);
  const [excessCashRedeploy, setExcessCashRedeploy] = useState(0);

  const { data: allocation } = useSWR<AllocationResult>(
    "/api/allocation",
    api.allocation,
  );
  const { data: positions } = useSWR("/api/positions", () => api.positions());
  const { data: rebalance, error: rebalanceErr } = useSWR(
    newCash > 0
      ? `/api/rebalance?mode=new_money&amount=${newCash}`
      : null,
    newCash > 0
      ? () => api.rebalance("new_money", newCash)
      : null,
  );

  const maxAsOfMs = useMemo(() => {
    if (!positions?.length) return null;
    const ms = Math.max(
      ...positions.map((p) => (p.as_of ? new Date(p.as_of).getTime() : 0)),
    );
    return ms > 0 ? ms : null;
  }, [positions]);

  const isStale =
    maxAsOfMs != null &&
    Math.floor((Date.now() - maxAsOfMs) / 86_400_000) > STALE_DAYS;

  const lastAsOf = maxAsOfMs
    ? new Date(maxAsOfMs).toLocaleDateString()
    : null;

  const simulatedSlices = useMemo<AllocationSlice[] | undefined>(() => {
    if (!allocation) return undefined;
    const thresholds = driftThresholds(allocation);

    const applyDeltas = (deltas: Record<string, number>, newTotal: number): AllocationSlice[] =>
      allocation.by_asset_class.map((slice) => {
        const newValue = slice.value + (deltas[slice.name] ?? 0);
        const newPct = newTotal > 0 ? (newValue / newTotal) * 100 : 0;
        const driftPct = slice.target_pct != null ? newPct - slice.target_pct : null;
        return {
          ...slice,
          value: newValue,
          pct: newPct,
          drift_pct: driftPct,
          drift_band: driftPct != null ? bandFromAbs(Math.abs(driftPct), thresholds) : undefined,
        };
      });

    // Compute excess-cash deltas upfront (undefined when no excess is being redeployed)
    let excessDeltas: Record<string, number> | undefined;
    if (excessCashRedeploy > 0) {
      const cashSlice = allocation.by_asset_class.find(
        (s) => s.name.toLowerCase() === "cash",
      );
      if (cashSlice?.target_pct != null) {
        const cashTarget = (cashSlice.target_pct / 100) * allocation.total;
        const cashExcess = Math.max(0, cashSlice.value - cashTarget);
        // Defensive clamp: user may have typed more than is currently available
        const toDeploy = Math.min(excessCashRedeploy, cashExcess);
        if (toDeploy >= 1) {
          const nonCash = allocation.by_asset_class.filter((s) => s.name !== cashSlice.name);
          const deficits = nonCash.map((s) =>
            Math.max(0, ((s.target_pct ?? 0) / 100) * allocation.total - s.value),
          );
          const totalDeficit = deficits.reduce((a, b) => a + b, 0);
          if (totalDeficit > 0) {
            excessDeltas = {};
            const deploy = Math.min(toDeploy, totalDeficit);
            nonCash.forEach((s, i) => {
              excessDeltas![s.name] = (deploy * deficits[i]) / totalDeficit;
            });
            const leftover = toDeploy - totalDeficit;
            if (leftover > 0) {
              const sumTargets = nonCash.reduce((s, h) => s + (h.target_pct ?? 0) / 100, 0);
              if (sumTargets > 0) {
                nonCash.forEach((s) => {
                  excessDeltas![s.name] =
                    (excessDeltas![s.name] ?? 0) +
                    (leftover * ((s.target_pct ?? 0) / 100)) / sumTargets;
                });
              }
            }
            excessDeltas[cashSlice.name] = -toDeploy;
          }
        }
      }
    }

    if (newCash > 0) {
      // API still loading — show excess-cash result if available, else blank
      if (!rebalance?.moves) {
        return excessDeltas ? applyDeltas(excessDeltas, allocation.total) : undefined;
      }
      // API responded — combine new-money deltas with optional excess-cash deltas
      const combined: Record<string, number> = {};
      rebalance.moves.forEach((m) => { combined[m.path] = m.delta_usd; });
      if (excessDeltas) {
        allocation.by_asset_class.forEach((s) => {
          combined[s.name] = (combined[s.name] ?? 0) + (excessDeltas![s.name] ?? 0);
        });
      }
      return applyDeltas(combined, allocation.total + newCash);
    }

    // No new cash — excess-cash only
    return excessDeltas ? applyDeltas(excessDeltas, allocation.total) : undefined;
  }, [allocation, rebalance, newCash, excessCashRedeploy]);

  const moves: RebalanceMove[] = useMemo(
    () =>
      rebalance?.moves
        ? [...rebalance.moves]
            .filter((m) => m.direction === "buy")
            .sort((a, b) => b.delta_usd - a.delta_usd)
        : [],
    [rebalance],
  );

  return (
    <Context.Provider
      value={{
        newCash,
        setNewCash,
        excessCashRedeploy,
        setExcessCashRedeploy,
        simulatedSlices,
        moves,
        rebalanceError: !!rebalanceErr,
        isStale,
        lastAsOf,
      }}
    >
      {children}
    </Context.Provider>
  );
}
