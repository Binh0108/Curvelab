"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { readLadder, readMarket, type LadderPoint, type MarketStats } from "./lab";

/** Loads the selected curve's stats and depth ladder; reloads when `tick` changes (after a trade). */
export function useMarket(curve: Address | null, decimals: number | null, tick: number) {
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [ladder, setLadder] = useState<LadderPoint[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Drop the old curve's data immediately when switching tokens.
  useEffect(() => {
    setStats(null);
    setLadder(null);
    setFailed(false);
  }, [curve]);

  useEffect(() => {
    if (!curve || decimals === null) return;
    let cancelled = false;
    readMarket(curve, decimals)
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    readLadder(curve, decimals)
      .then((points) => {
        if (!cancelled) setLadder(points);
      })
      .catch(() => {
        if (!cancelled) setLadder([]);
      });
    return () => {
      cancelled = true;
    };
  }, [curve, decimals, tick]);

  return { stats, ladder, failed };
}
