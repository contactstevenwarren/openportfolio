import { describe, expect, it } from "vitest";

import { roundPlanToWholeDollars, type SandboxPlan } from "./sandbox-plan-round";

describe("roundPlanToWholeDollars", () => {
  it("rebalance recomputes buyTotal and sellTotal from rounded actions", () => {
    const plan: SandboxPlan = {
      assets: [
        {
          name: "Cash",
          label: "Cash",
          value: 100,
          pct: 10,
          targetPct: 10,
          action: 100.6,
        },
        {
          name: "Stocks",
          label: "Stocks",
          value: 200,
          pct: 90,
          targetPct: 90,
          action: -50.4,
        },
      ],
      cashExcess: 0,
      buyTotal: 999,
      sellTotal: 999,
      gapsClosed: true,
    };
    const r = roundPlanToWholeDollars(plan, "rebalance", null);
    expect(r.assets[0].action).toBe(101);
    expect(r.assets[1].action).toBe(-50);
    expect(r.buyTotal).toBe(101);
    expect(r.sellTotal).toBe(50);
  });

  it("deploy buyTotal matches non-cash buys plus max(0, rounded cash action)", () => {
    const plan: SandboxPlan = {
      assets: [
        {
          name: "Cash",
          label: "Cash",
          value: 1000,
          pct: 50,
          targetPct: 50,
          action: -100.7,
        },
        {
          name: "Stocks",
          label: "Stocks",
          value: 1000,
          pct: 50,
          targetPct: 50,
          action: 80.3,
        },
      ],
      cashExcess: 0,
      buyTotal: 0,
      sellTotal: 0,
      gapsClosed: true,
    };
    const r = roundPlanToWholeDollars(plan, "deploy", "Cash");
    expect(r.assets[0].action).toBe(-101);
    expect(r.assets[1].action).toBe(80);
    expect(r.sellTotal).toBe(0);
    expect(r.buyTotal).toBe(80);
  });

  it("deploy counts rounded positive cash action toward buyTotal", () => {
    const plan: SandboxPlan = {
      assets: [
        {
          name: "Cash",
          label: "Cash",
          value: 100,
          pct: 50,
          targetPct: 50,
          action: 12.4,
        },
        {
          name: "Bonds",
          label: "Bonds",
          value: 900,
          pct: 50,
          targetPct: 50,
          action: 3.2,
        },
      ],
      cashExcess: 0,
      buyTotal: 0,
      sellTotal: 0,
      gapsClosed: true,
    };
    const r = roundPlanToWholeDollars(plan, "deploy", "Cash");
    expect(r.buyTotal).toBe(3 + 12);
    expect(r.assets.find((a) => a.name === "Cash")?.action).toBe(12);
  });
});
