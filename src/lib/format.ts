import { formatUnits, parseUnits } from "viem";

export const shortAddress = (address?: string | null) =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

export const isAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value.trim());

/** Trim a raw token amount to a readable decimal string without rounding up. */
export function formatAmount(value: bigint, decimals: number, maxFraction = 6): string {
  const full = formatUnits(value, decimals);
  const [whole, fraction = ""] = full.split(".");
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, "");
  if (value > 0n && whole === "0" && trimmed === "") return `<0.${"0".repeat(maxFraction - 1)}1`;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

/** Parse user input into raw units. Returns null for empty, invalid or non-positive input. */
export function parseAmount(input: string, decimals: number): bigint | null {
  const value = input.trim();
  if (!/^\d*\.?\d*$/.test(value) || value === "" || value === ".") return null;
  try {
    const raw = parseUnits(value, decimals);
    return raw > 0n ? raw : null;
  } catch {
    return null;
  }
}

export type ErrorKind = "rejected" | "gas" | "wrongChain" | "slippage" | "liquidity" | "other";

/** Turns wallet / RPC / SDK errors into a small set of cases the UI can explain in plain words. */
export function classifyError(error: unknown): { kind: ErrorKind; detail: string } {
  const e = error as { code?: number; shortMessage?: string; message?: string; cause?: { code?: number } };
  const raw = `${e?.shortMessage ?? ""} ${e?.message ?? ""}`;
  const lower = raw.toLowerCase();
  const code = e?.code ?? e?.cause?.code;
  const detail = (e?.shortMessage ?? e?.message ?? String(error)).split("\n")[0].slice(0, 220);
  if (code === 4001 || lower.includes("user rejected") || lower.includes("user denied")) {
    return { kind: "rejected", detail };
  }
  if (
    lower.includes("insufficient funds") ||
    lower.includes("exceeds the balance") ||
    lower.includes("gas required exceeds") ||
    lower.includes("insufficient balance for transfer")
  ) {
    return { kind: "gas", detail };
  }
  if (lower.includes("chain") && (lower.includes("mismatch") || lower.includes("does not match"))) {
    return { kind: "wrongChain", detail };
  }
  if (lower.includes("slippage") || lower.includes("minimumamountout") || lower.includes("toolittlereceived")) {
    return { kind: "slippage", detail };
  }
  if (lower.includes("priceoutsidecurve") || lower.includes("liquidity")) {
    return { kind: "liquidity", detail };
  }
  return { kind: "other", detail };
}

/** Compact price/amount for tiny WETH values: 4 significant digits, no scientific notation. */
export function formatSig(value: bigint, decimals = 18, digits = 4): string {
  const n = Number(formatUnits(value, decimals));
  if (n === 0) return "0";
  return n.toLocaleString("en-US", { maximumSignificantDigits: digits, maximumFractionDigits: 20 });
}

/** Rough age from a block distance (GIWA Sepolia blocks are about one second apart). */
export function formatAge(blocks: bigint): string {
  const seconds = Number(blocks);
  if (seconds < 90) return `${Math.max(seconds, 1)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 129_600) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}
