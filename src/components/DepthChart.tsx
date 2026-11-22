"use client";

import { useId, useState } from "react";
import { formatUnits } from "viem";
import type { LadderPoint } from "@/lib/lab";
import { formatAmount, formatSig } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type Props = {
  points: LadderPoint[] | null;
  /** WETH wei per whole token at a tiny probe size: the "spot" the impact is measured against. */
  spot: bigint | null;
  symbol: string;
  decimals: number;
};

const W = 600;
const H = 250;
const PAD = { l: 64, r: 18, t: 18, b: 34 };

const num = (v: bigint) => Number(formatUnits(v, 18));

/** The curve as a draftsman would plot it: average price paid against how much you spend (log scale). */
export function DepthChart({ points, spot, symbol, decimals }: Props) {
  const { t } = useI18n();
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  if (points === null) return <div className="grid h-60 place-items-center text-sm text-mute">{t("chartLoading")}</div>;
  if (points.length < 2) return <div className="grid h-60 place-items-center text-sm text-mute">{t("chartEmpty")}</div>;

  const xs = points.map((p) => Math.log10(num(p.spend)));
  const ys = points.map((p) => num(p.avgPrice));
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yLow = Math.min(...ys);
  const yHigh = Math.max(...ys);
  const yMin = yLow - (yHigh - yLow) * 0.15 - (yHigh === yLow ? yLow * 0.1 : 0);
  const yMax = yHigh + (yHigh - yLow) * 0.15 + (yHigh === yLow ? yHigh * 0.1 : 0);

  const px = (x: number) => PAD.l + ((x - xMin) / (xMax - xMin || 1)) * (W - PAD.l - PAD.r);
  const py = (y: number) => H - PAD.b - ((y - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);

  const line = points.map((_, i) => `${i === 0 ? "M" : "L"}${px(xs[i]).toFixed(1)} ${py(ys[i]).toFixed(1)}`).join(" ");
  const area = `${line} L${px(xs[xs.length - 1]).toFixed(1)} ${H - PAD.b} L${px(xs[0]).toFixed(1)} ${H - PAD.b} Z`;
  const gridValues = [0, 1, 2, 3].map((i) => yMin + ((yMax - yMin) * i) / 3);

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * W;
    let best = 0;
    let bestDistance = Infinity;
    xs.forEach((value, i) => {
      const distance = Math.abs(px(value) - x);
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    });
    setHover(best);
  };

  const active = hover === null ? points.length - 1 : hover;
  const point = points[active];
  const impact = spot && spot > 0n ? (num(point.avgPrice) / num(spot) - 1) * 100 : null;

  return (
    <div>
      <p className="num mb-3 min-h-[1.5rem] text-sm" aria-live="polite">
        <span className="text-mute">{t("chartSpend")} </span>
        {formatSig(point.spend, 18, 3)} WETH
        <span className="text-mute"> → {t("chartGet")} </span>
        {formatAmount(point.out, decimals, 2)} {symbol}
        <span className="text-mute"> · {t("chartAvg")} </span>
        {formatSig(point.avgPrice, 18, 3)}
        {impact !== null && (
          <>
            <span className="text-mute"> · {t("chartImpact")} </span>
            <span className={impact > 0.05 ? "text-down" : "text-up"}>
              {impact >= 0 ? "+" : ""}
              {impact.toFixed(1)}%
            </span>
          </>
        )}
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label={t("chartTitle")}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb547" stopOpacity="0.28" />
            <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridValues.map((value) => (
          <g key={value}>
            <line x1={PAD.l} x2={W - PAD.r} y1={py(value)} y2={py(value)} stroke="#2a313b" strokeDasharray="3 5" />
            <text x={PAD.l - 8} y={py(value) + 3.5} textAnchor="end" fontSize="10" fill="#8b95a5" fontFamily="var(--font-mono)">
              {value.toLocaleString("en-US", { maximumSignificantDigits: 3, maximumFractionDigits: 20 })}
            </text>
          </g>
        ))}

        {points.map((p, i) => (
          <text
            key={p.spend.toString()}
            x={px(xs[i])}
            y={H - 12}
            textAnchor="middle"
            fontSize="10"
            fill={i === active ? "#ffb547" : "#8b95a5"}
            fontFamily="var(--font-mono)"
          >
            {formatSig(p.spend, 18, 2)}
          </text>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="#3a434f" />

        <path d={area} fill={`url(#${id}-area)`} />
        <path d={line} fill="none" stroke="#ffb547" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" className="curve-draw" />

        <line x1={px(xs[active])} x2={px(xs[active])} y1={PAD.t} y2={H - PAD.b} stroke="#5bc8ff" strokeOpacity="0.5" strokeDasharray="2 4" />
        {points.map((p, i) => (
          <circle
            key={p.spend.toString()}
            cx={px(xs[i])}
            cy={py(ys[i])}
            r={i === active ? 5 : 3}
            fill="#0f1216"
            stroke={i === active ? "#5bc8ff" : "#ffb547"}
            strokeWidth="2"
          />
        ))}
      </svg>
      <p className="mt-1 flex justify-between text-xs text-mute">
        <span>{t("chartBody")}</span>
      </p>
    </div>
  );
}
