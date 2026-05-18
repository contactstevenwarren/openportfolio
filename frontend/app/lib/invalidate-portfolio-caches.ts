import { mutate } from "swr";

/** Revalidate SWR keys that depend on live portfolio totals / positions after account or archive changes. */
export async function invalidatePortfolioCaches(): Promise<void> {
  await Promise.all([
    mutate("/api/allocation"),
    mutate("/api/snapshots"),
    mutate("/api/snapshots/earliest"),
    mutate("/api/positions"),
    mutate((key) => typeof key === "string" && key.startsWith("/api/rebalance")),
  ]);
}
