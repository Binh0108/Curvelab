"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { readCurve, type CurveInfo, type TokenMeta } from "@/lib/lab";
import { formatAge, shortAddress } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Button, StatusBanner } from "./ui";

type Props = {
  state: "loading" | "ready" | "error";
  error: unknown;
  curves: CurveInfo[];
  metas: Record<string, TokenMeta>;
  head: bigint;
  scannedBlocks: bigint;
  selected: string | null;
  onSelect: (curve: string) => void;
  canScanOlder: boolean;
  onScanOlder: () => void;
  onRetry: () => void;
};

type Progress = { bps: number; status: number } | null;

export function Radar({
  state,
  error,
  curves,
  metas,
  head,
  scannedBlocks,
  selected,
  onSelect,
  canScanOlder,
  onScanOlder,
  onRetry,
}: Props) {
  const { t, explain } = useI18n();
  const [query, setQuery] = useState("");
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const requested = useRef(new Set<string>());

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      curves.filter((c) => {
        if (!q) return true;
        const meta = metas[c.token.toLowerCase()];
        return [meta?.name, meta?.symbol, c.token, c.curve].some((v) => v?.toLowerCase().includes(q));
      }),
    [curves, metas, q],
  );
  const shown = filtered.slice(0, 40);

  // Graduation progress is read on-chain, two curves at a time, for the rows on screen.
  useEffect(() => {
    let cancelled = false;
    const queue = shown.filter((c) => !requested.current.has(c.curve));
    queue.forEach((c) => requested.current.add(c.curve));
    const worker = async () => {
      for (let c = queue.shift(); c && !cancelled; c = queue.shift()) {
        try {
          const snap = await readCurve(c.curve);
          if (!cancelled) setProgress((p) => ({ ...p, [c.curve]: { bps: snap.progressBps, status: snap.status } }));
        } catch {
          if (!cancelled) setProgress((p) => ({ ...p, [c.curve]: null }));
        }
      }
    };
    void Promise.all([worker(), worker()]);
    return () => {
      cancelled = true;
    };
  }, [shown]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">{t("radarTitle")}</h2>
        <button
          type="button"
          onClick={() => {
            requested.current.clear();
            setProgress({});
            onRetry();
          }}
          aria-label={t("retry")}
          title={t("retry")}
          className="grid size-8 place-items-center rounded-full border border-line text-mute hover:border-accent/60 hover:text-accent"
        >
          <RefreshCw className={`size-4 ${state === "loading" ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 focus-within:border-accent/70">
        <Search className="size-4 text-mute" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("radarSearch")}
          aria-label={t("radarSearch")}
          spellCheck={false}
          className="h-full w-full bg-transparent text-sm outline-none"
        />
      </div>

      {state === "loading" && <StatusBanner status={{ kind: "loading", message: t("radarLoading") }} />}
      {state === "error" && (
        <StatusBanner
          status={{ kind: "error", message: t("radarError"), hint: t("radarErrorHint"), detail: explain(error).detail }}
        />
      )}
      {state === "ready" && (
        <p className="num text-xs text-mute">{t("scanned", { count: curves.length, blocks: scannedBlocks.toString() })}</p>
      )}
      {state === "ready" && shown.length === 0 && <p className="text-sm text-mute">{t("radarEmpty")}</p>}

      <ul className="-mx-1 max-h-[34rem] space-y-1 overflow-y-auto px-1">
        {shown.map((c) => {
          const meta = metas[c.token.toLowerCase()];
          const p = progress[c.curve];
          const pct = p ? p.bps / 100 : null;
          const active = selected?.toLowerCase() === c.curve.toLowerCase();
          return (
            <li key={c.curve}>
              <button
                type="button"
                onClick={() => onSelect(c.curve)}
                aria-pressed={active}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  active ? "border-accent/70 bg-accent/10" : "border-transparent hover:border-line hover:bg-panel"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{meta?.name ?? shortAddress(c.token)}</span>
                  <span className="num shrink-0 text-xs text-mute">{formatAge(head > c.creationBlock ? head - c.creationBlock : 0n)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="num text-xs text-mute">{meta?.symbol ?? ""}</span>
                  <span className="num text-xs text-text">
                    {p?.status === 3 ? "100%" : pct === null ? "…" : `${pct.toFixed(pct >= 10 ? 0 : 1)}%`}
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full ${p?.status === 3 ? "bg-sky" : "bg-accent"}`}
                    style={{ width: `${p?.status === 3 ? 100 : Math.min(pct ?? 0, 100)}%` }}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {canScanOlder && state === "ready" && (
        <Button variant="ghost" className="h-9 text-xs" onClick={onScanOlder}>
          {t("scanOlder")}
        </Button>
      )}
    </div>
  );
}
