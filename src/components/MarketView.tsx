"use client";

import type { CurveInfo, LadderPoint, MarketStats, TokenMeta } from "@/lib/lab";
import { formatAmount, formatSig } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { DepthChart } from "./DepthChart";
import { AddressLink, Panel, Stat } from "./ui";

type Props = {
  info: CurveInfo | null;
  meta: TokenMeta | null;
  stats: MarketStats | null;
  ladder: LadderPoint[] | null;
};

export function MarketView({ info, meta, stats, ladder }: Props) {
  const { t } = useI18n();

  if (!info || !meta) {
    return (
      <Panel className="grid min-h-[22rem] place-items-center text-center text-sm text-mute">{t("pickToken")}</Panel>
    );
  }

  const progress = stats ? stats.snap.progressBps / 100 : null;
  const status = stats ? (stats.snap.status as 0 | 1 | 2 | 3) : null;
  // Fully diluted value: spot price times total supply.
  const fdv =
    stats && stats.price !== null ? (stats.price * stats.totalSupply) / 10n ** BigInt(meta.decimals) : null;

  return (
    <Panel className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <h2 className="truncate text-2xl font-semibold tracking-tight">{meta.name}</h2>
            <span className="num text-sm text-mute">{meta.symbol}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
            <span>
              {t("tokenAddr")} <AddressLink address={info.token} />
            </span>
            <span>
              {t("curveAddr")} <AddressLink address={info.curve} />
            </span>
          </div>
        </div>
        {status !== null && (
          <span
            className={`rounded-full border px-3 py-1 text-xs ${
              status === 1
                ? "border-up/50 text-up"
                : status === 3
                  ? "border-sky/50 text-sky"
                  : "border-accent/50 text-accent"
            }`}
          >
            {t(`status${status}` as "status1")}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Stat
          label={t("statPrice")}
          value={stats ? (stats.price === null ? "—" : `${formatSig(stats.price, 18, 4)} WETH`) : "…"}
        />
        <Stat label={t("statFdv")} value={stats ? (fdv === null ? "—" : `${formatSig(fdv, 18, 4)} WETH`) : "…"} />
        <Stat
          label={t("statRaised")}
          value={stats ? `${formatAmount(stats.snap.current, 18, 4)} WETH` : "…"}
        />
        <Stat
          label={t("statProgress")}
          value={progress === null ? "…" : `${progress.toFixed(progress >= 10 ? 1 : 2)}%`}
        />
      </dl>

      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-700"
            style={{ width: `${Math.min(progress ?? 0, 100)}%` }}
          />
        </div>
        {stats && (
          <p className="num mt-1 text-xs text-mute">
            {formatAmount(stats.snap.current, 18, 4)} / {formatAmount(stats.snap.target, 18, 4)} WETH
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold">{t("chartTitle")}</h3>
        <DepthChart points={ladder} spot={stats?.price ?? null} symbol={meta.symbol} decimals={meta.decimals} />
      </div>
    </Panel>
  );
}
