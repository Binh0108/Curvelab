"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { LaunchPanel } from "@/components/LaunchPanel";
import { MarketView } from "@/components/MarketView";
import { Portfolio } from "@/components/Portfolio";
import { Radar } from "@/components/Radar";
import { Ticket } from "@/components/Ticket";
import { discoverCurves, LOOKBACK_STEPS, readTokenMeta, type CurveInfo, type TokenMeta, type TradeSide } from "@/lib/lab";
import { useI18n } from "@/lib/i18n";
import { useMarket } from "@/lib/useMarket";

type Tab = "terminal" | "portfolio" | "launch";

export default function Home() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("terminal");

  const [curves, setCurves] = useState<CurveInfo[]>([]);
  const [metas, setMetas] = useState<Record<string, TokenMeta>>({});
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<unknown>(null);
  const [depth, setDepth] = useState(0);
  const [head, setHead] = useState(0n);
  const [from, setFrom] = useState(0n);
  const [selected, setSelected] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [sideHint, setSideHint] = useState<{ side: TradeSide; nonce: number } | null>(null);
  const run = useRef(0);

  const loadMetas = useCallback(async (list: CurveInfo[]) => {
    for (let i = 0; i < list.length; i += 25) {
      try {
        const chunk = await readTokenMeta(list.slice(i, i + 25).map((c) => c.token));
        setMetas((m) => ({ ...m, ...chunk }));
      } catch {
        /* names are a nicety: rows still work with addresses */
      }
    }
  }, []);

  const load = useCallback(
    async (index: number) => {
      const ticket = ++run.current;
      setState("loading");
      try {
        const found = await discoverCurves(LOOKBACK_STEPS[index]);
        if (ticket !== run.current) return;
        setCurves(found.curves);
        setHead(found.head);
        setFrom(found.from);
        setDepth(index);
        setState("ready");
        setError(null);
        setSelected((current) => current ?? found.curves[0]?.curve ?? null);
        void loadMetas(found.curves);
      } catch (e) {
        if (ticket !== run.current) return;
        setError(e);
        setState("error");
      }
    },
    [loadMetas],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const info = useMemo(
    () => curves.find((c) => c.curve.toLowerCase() === selected?.toLowerCase()) ?? null,
    [curves, selected],
  );
  const meta = info ? (metas[info.token.toLowerCase()] ?? null) : null;
  const market = useMarket(info?.curve ?? null, meta?.decimals ?? null, tick);

  const open = useCallback((curve: string, side?: TradeSide) => {
    setSelected(curve);
    setTab("terminal");
    if (side) setSideHint((h) => ({ side, nonce: (h?.nonce ?? 0) + 1 }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // A fresh launch is shown at once; the radar picks it up from the chain on the next scan.
  const onLaunched = useCallback(
    (token: string, curve: string | undefined) => {
      if (!curve) return;
      const entry: CurveInfo = { curve: curve as CurveInfo["curve"], token: token as CurveInfo["token"], creationBlock: head };
      setCurves((list) => (list.some((c) => c.curve.toLowerCase() === curve.toLowerCase()) ? list : [entry, ...list]));
      void loadMetas([entry]);
    },
    [head, loadMetas],
  );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "terminal", label: t("tabTerminal") },
    { id: "portfolio", label: t("tabPortfolio") },
    { id: "launch", label: t("tabLaunch") },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-8 sm:px-6">
        <section className="mb-8 max-w-3xl space-y-2">
          <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">{t("heroTitle")}</h1>
          <p className="text-[15px] leading-relaxed text-mute">{t("heroBody")}</p>
        </section>

        <nav className="mb-6 flex gap-1 border-b border-line" role="tablist" aria-label="Sections">
          {tabs.map((item) => (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`-mb-px h-11 border-b-2 px-4 text-sm font-medium transition-colors ${
                tab === item.id ? "border-accent text-text" : "border-transparent text-mute hover:text-text"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {tab === "terminal" && (
          <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)_21rem]">
            <aside className="order-3 lg:order-1">
              <Radar
                state={state}
                error={error}
                curves={curves}
                metas={metas}
                head={head}
                scannedBlocks={head - from}
                selected={selected}
                onSelect={(curve) => setSelected(curve)}
                canScanOlder={depth < LOOKBACK_STEPS.length - 1}
                onScanOlder={() => void load(depth + 1)}
                onRetry={() => void load(depth)}
              />
            </aside>
            <div className="order-1 min-w-0 lg:order-2">
              <MarketView info={info} meta={meta} stats={market.stats} ladder={market.ladder} />
            </div>
            <div className="order-2 lg:order-3">
              {info && meta && (
                <Ticket
                  curve={info.curve}
                  token={info.token}
                  meta={meta}
                  stats={market.stats}
                  sideHint={sideHint}
                  onTraded={() => setTick((n) => n + 1)}
                />
              )}
            </div>
          </div>
        )}

        {tab === "portfolio" && (
          <Portfolio curves={curves} metas={metas} refreshKey={tick} onSell={(curve) => open(curve, "sell")} />
        )}

        {tab === "launch" && <LaunchPanel onLaunched={onLaunched} onOpen={(curve) => open(curve)} />}
      </main>

      <footer className="border-t border-line/70">
        <p className="mx-auto max-w-7xl px-4 py-6 text-xs leading-relaxed text-mute sm:px-6">{t("footer")}</p>
      </footer>
    </div>
  );
}
