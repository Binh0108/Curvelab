"use client";

import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, PenLine } from "lucide-react";
import { explorerAddress, explorerTx } from "@/lib/chain";
import { shortAddress } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/* ---------- Status banner ---------- */

export type Status =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "wallet"; message: string }
  | { kind: "pending"; message: string; hash?: string }
  | { kind: "success"; message: string; hash?: string; children?: ReactNode }
  | { kind: "error"; message: string; hint?: string; detail?: string };

export function StatusBanner({ status }: { status: Status }) {
  const { t } = useI18n();
  if (status.kind === "idle") return null;

  const tone = {
    loading: { icon: <Loader2 className="size-4 animate-spin" />, cls: "border-line bg-panel-2 text-text" },
    wallet: { icon: <PenLine className="size-4" />, cls: "border-sky/40 bg-sky/10 text-text" },
    pending: { icon: <Loader2 className="size-4 animate-spin" />, cls: "border-accent/30 bg-accent/10 text-text" },
    success: { icon: <CheckCircle2 className="size-4 text-accent" />, cls: "border-accent/40 bg-accent/10 text-text" },
    error: { icon: <AlertTriangle className="size-4 text-rose" />, cls: "border-rose/40 bg-rose/10 text-text" },
  }[status.kind];

  return (
    <div role={status.kind === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${tone.cls}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{tone.icon}</span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium leading-snug">{status.message}</p>
          {status.kind === "error" && status.hint && <p className="text-mute">{status.hint}</p>}
          {status.kind === "error" && status.detail && (
            <p className="break-words font-mono text-xs text-mute/80">{status.detail}</p>
          )}
          {"hash" in status && status.hash && (
            <a
              href={explorerTx(status.hash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline"
            >
              {t("viewTx")} {shortAddress(status.hash)} <ExternalLink className="size-3" />
            </a>
          )}
          {status.kind === "success" && status.children}
        </div>
      </div>
    </div>
  );
}

/* ---------- Buttons & fields ---------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "sky" | "up" | "down" | "ghost";
  busy?: boolean;
};

export function Button({ variant = "primary", busy, className = "", children, disabled, ...rest }: ButtonProps) {
  const styles = {
    primary: "bg-accent text-[#1c1300] hover:bg-[#ffc978] disabled:bg-accent/25 disabled:text-text/50",
    sky: "bg-sky text-[#04202e] hover:bg-[#8bd8ff] disabled:bg-sky/25 disabled:text-text/50",
    up: "bg-up text-[#03231a] hover:bg-[#6ae8b2] disabled:bg-up/25 disabled:text-text/50",
    down: "bg-down text-[#2b0509] hover:bg-[#ff8d99] disabled:bg-down/25 disabled:text-text/50",
    ghost: "border border-line bg-transparent text-text hover:border-accent/60 hover:text-accent disabled:opacity-40",
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  suffix?: ReactNode;
  mono?: boolean;
  invalid?: boolean;
};

export function Field({ label, hint, suffix, mono, invalid, className = "", ...rest }: FieldProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <div
        className={`flex items-center rounded-xl border bg-bg/60 px-3 transition-colors focus-within:border-accent/70 ${
          invalid ? "border-rose/60" : "border-line"
        }`}
      >
        <input
          id={id}
          {...rest}
          className={`h-11 w-full min-w-0 bg-transparent text-sm outline-none ${mono ? "font-mono" : ""} ${className}`}
        />
        {suffix && <span className="ml-2 shrink-0 text-sm text-mute">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-mute">{hint}</p>}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-panel p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function Stat({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-mute">{label}</dt>
      <dd className={`mt-0.5 truncate text-sm ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

export function AddressLink({ address, label }: { address: string; label?: string }) {
  return (
    <a
      href={explorerAddress(address)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-mute hover:text-accent"
      title={address}
    >
      {label ?? shortAddress(address)} <ExternalLink className="size-3" />
    </a>
  );
}

/* ---------- The one signature element: the bonding curve ---------- */

/**
 * A bonding curve drawn as a path. The part the market has already "climbed" (progress toward
 * Graduation) is filled and stroked in accent; the remaining curve stays muted.
 */
export function CurveMark({
  progress,
  className = "",
  animate = false,
}: {
  progress: number | null;
  className?: string;
  animate?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const p = progress === null ? 0 : Math.max(0, Math.min(1, progress));
  const path = "M2 58 C 40 56, 74 50, 100 34 S 142 8, 158 4";
  const fillPath = `${path} L158 62 L2 62 Z`;
  return (
    <svg viewBox="0 0 160 64" className={className} role="img" aria-label={progress === null ? "Curve progress unknown" : `Curve progress ${Math.round(p * 100)}%`}>
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect x="0" y="0" width={2 + p * 156} height="64" />
        </clipPath>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb547" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="62.5" x2="160" y2="62.5" stroke="#2a313b" strokeWidth="1" />
      <path d={path} fill="none" stroke="#3a434f" strokeWidth="2" strokeLinecap="round" />
      <g clipPath={`url(#${id}-clip)`}>
        <path d={fillPath} fill={`url(#${id}-fill)`} />
        <path d={path} fill="none" stroke="#ffb547" strokeWidth="2.5" strokeLinecap="round" className={animate ? "curve-draw" : ""} />
      </g>
      {progress !== null && p > 0 && p < 1 && (
        <circle cx={2 + p * 156} cy={curveY(p)} r="3.5" fill="#0f1216" stroke="#ffb547" strokeWidth="2" />
      )}
    </svg>
  );
}

// Approximate y on the drawn path for a given x-progress (good enough for the marker dot).
function curveY(p: number) {
  const points: Array<[number, number]> = [
    [0, 58],
    [0.25, 55],
    [0.5, 48],
    [0.62, 34],
    [0.8, 17],
    [1, 4],
  ];
  for (let i = 1; i < points.length; i += 1) {
    if (p <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + ((p - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 4;
}
