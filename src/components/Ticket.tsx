"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUnits, type Address } from "viem";
import {
  executeMigrate,
  executeTrade,
  minimumOut,
  quoteTrade,
  readBalance,
  type MarketStats,
  type TokenMeta,
  type TradeQuote,
  type TradeSide,
} from "@/lib/lab";
import { WETH } from "@/lib/chain";
import { formatAmount, formatSig, parseAmount } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useWallet } from "@/lib/wallet";
import { Button, Panel, Stat, StatusBanner, type Status } from "./ui";

const SLIPPAGE = [50, 100, 300];
const GAS_RESERVE = 500_000_000_000_000n; // 0.0005 ETH stays in the wallet when "Max" spends ETH

type Props = {
  curve: Address;
  token: Address;
  meta: TokenMeta;
  stats: MarketStats | null;
  /** Lets the portfolio jump straight to a sell. */
  sideHint: { side: TradeSide; nonce: number } | null;
  onTraded: () => void;
};

export function Ticket({ curve, token, meta, stats, sideHint, onTraded }: Props) {
  const { t, explain } = useI18n();
  const wallet = useWallet();

  const [side, setSide] = useState<TradeSide>("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(100);
  const [payWithEth, setPayWithEth] = useState(true);
  const [receiveEth, setReceiveEth] = useState(true);
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<Status>({ kind: "idle" });
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [balances, setBalances] = useState<{ token: bigint; weth: bigint } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (sideHint) {
      setSide(sideHint.side);
      setAmount("");
    }
  }, [sideHint]);

  useEffect(() => {
    setAmount("");
    setQuote(null);
    setStatus({ kind: "idle" });
  }, [curve]);

  const status0 = stats?.snap.status;
  const live = status0 === 1;
  const inDecimals = side === "buy" ? 18 : meta.decimals;
  const outDecimals = side === "buy" ? meta.decimals : 18;
  const inSymbol = side === "buy" ? (payWithEth ? "ETH" : "WETH") : meta.symbol;
  const outSymbol = side === "buy" ? meta.symbol : receiveEth ? "ETH" : "WETH";
  const amountRaw = parseAmount(amount, inDecimals);
  const busy = status.kind === "loading" || status.kind === "wallet" || status.kind === "pending";

  /* balances */
  useEffect(() => {
    if (!wallet.account) {
      setBalances(null);
      return;
    }
    let cancelled = false;
    Promise.all([readBalance(token, wallet.account), readBalance(WETH, wallet.account)])
      .then(([tokenBal, wethBal]) => {
        if (!cancelled) setBalances({ token: tokenBal, weth: wethBal });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [wallet.account, token, tick]);

  /* debounced quote */
  useEffect(() => {
    if (!live || !amountRaw) {
      setQuote(null);
      setQuoteStatus({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setQuoteStatus({ kind: "loading", message: t("quoting") });
    const timer = window.setTimeout(async () => {
      try {
        const result = await quoteTrade(curve, side, amountRaw);
        if (cancelled) return;
        setQuote(result);
        setQuoteStatus({ kind: "idle" });
      } catch (error) {
        if (cancelled) return;
        setQuote(null);
        setQuoteStatus({ kind: "error", ...explain(error) });
      }
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // `t`/`explain` only change with the language; re-quoting for that would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curve, live, side, amountRaw, tick]);

  const ethBalance = wallet.balance ?? 0n;
  const buyBudget = balances
    ? payWithEth
      ? balances.weth + (ethBalance > GAS_RESERVE ? ethBalance - GAS_RESERVE : 0n)
      : balances.weth
    : 0n;
  const available = side === "buy" ? buyBudget : (balances?.token ?? 0n);
  const insufficient = !!(balances && amountRaw && amountRaw > available);

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
    void wallet.refreshBalance();
    onTraded();
  }, [wallet, onTraded]);

  const useMax = () => {
    if (!balances) return;
    setAmount(formatUnits(available, inDecimals));
  };

  const submit = async () => {
    if (!amountRaw) return;
    try {
      const { account, walletClient } = await wallet.ensureReady();
      setStatus({ kind: "loading", message: t("stepVerify") });
      const result = await executeTrade({
        walletClient,
        account,
        curve,
        side,
        amountIn: amountRaw,
        slippageBps: slippage,
        payWithEth,
        receiveEth,
        onStep: (step, hash) => {
          if (step === "wrap") setStatus({ kind: "wallet", message: t("stepWrap") });
          else if (step === "approve") setStatus({ kind: "wallet", message: t("stepApprove") });
          else if (step === "sign") setStatus({ kind: "wallet", message: t("stepSign") });
          else if (step === "unwrap") setStatus({ kind: "pending", message: t("stepUnwrap") });
          else setStatus({ kind: "pending", message: t("stepConfirm"), hash });
        },
      });
      setStatus({ kind: "success", message: t("tradeDone"), hash: result.hash });
      setAmount("");
      refresh();
    } catch (error) {
      setStatus({ kind: "error", ...explain(error) });
    }
  };

  const graduate = async () => {
    try {
      const { account, walletClient } = await wallet.ensureReady();
      setStatus({ kind: "wallet", message: t("stepSign") });
      const { hash } = await executeMigrate({
        walletClient,
        account,
        curve,
        onStep: (step, h) => {
          if (step === "sign") setStatus({ kind: "wallet", message: t("stepSign") });
          else setStatus({ kind: "pending", message: t("stepConfirm"), hash: h });
        },
      });
      setStatus({ kind: "success", message: t("graduateDone"), hash });
      refresh();
    } catch (error) {
      setStatus({ kind: "error", ...explain(error) });
    }
  };

  const spot = stats?.price ?? null;
  const impact =
    quote && amountRaw && spot && quote.amountOut > 0n && side === "buy"
      ? (Number(formatUnits(quote.amountIn - quote.amountLeft, 18)) /
          Number(formatUnits(quote.amountOut, meta.decimals)) /
          Number(formatUnits(spot, 18)) -
          1) *
        100
      : null;

  const action = !wallet.account
    ? { label: t("btnConnect"), disabled: false, connect: true }
    : !amountRaw
      ? { label: t("btnEnter"), disabled: true, connect: false }
      : insufficient
        ? { label: t("insufficient", { symbol: inSymbol }), disabled: true, connect: false }
        : {
            label: side === "buy" ? t("btnBuy", { symbol: meta.symbol }) : t("btnSell", { symbol: meta.symbol }),
            disabled: !quote,
            connect: false,
          };

  return (
    <Panel className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-line p-1" role="group">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => {
              setSide(s);
              setAmount("");
              setQuote(null);
            }}
            className={`h-10 rounded-lg text-sm font-semibold transition-colors ${
              side === s ? (s === "buy" ? "bg-up text-[#03231a]" : "bg-down text-[#2b0509]") : "text-mute hover:text-text"
            }`}
          >
            {t(s)}
          </button>
        ))}
      </div>

      {status0 === 3 && <p className="text-sm text-mute">{t("migratedNote")}</p>}
      {status0 === 0 && <p className="text-sm text-mute">{t("notTrading")}</p>}
      {status0 === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-mute">{t("readyToGraduate")}</p>
          <Button variant="sky" busy={busy} disabled={!wallet.account} onClick={() => void graduate()}>
            {t("btnMigrate")}
          </Button>
        </div>
      )}

      {live && (
        <>
          <div className="rounded-xl border border-line bg-bg/50 p-4">
            <div className="mb-2 flex items-center justify-between text-xs text-mute">
              <span>{t("youPay")}</span>
              <span className="flex items-center gap-2">
                {balances && (
                  <span className="num">
                    {t("balance")}: {formatAmount(available, inDecimals, 5)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={useMax}
                  disabled={!balances}
                  className="rounded-md border border-line px-2 py-0.5 text-accent hover:border-accent/60 disabled:opacity-40"
                >
                  {t("max")}
                </button>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                aria-label={t("youPay")}
                className="num h-11 w-full min-w-0 bg-transparent text-2xl outline-none"
              />
              <span className="num shrink-0 rounded-lg bg-panel-2 px-3 py-1.5 text-sm font-semibold">{inSymbol}</span>
            </div>
          </div>

          {side === "buy" ? (
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={payWithEth}
                onChange={(e) => setPayWithEth(e.target.checked)}
                className="mt-1 size-4 accent-[#ffb547]"
              />
              <span>
                {t("payWithEth")}
                <span className="block text-xs text-mute">{t("payWithEthHint")}</span>
              </span>
            </label>
          ) : (
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={receiveEth}
                onChange={(e) => setReceiveEth(e.target.checked)}
                className="mt-1 size-4 accent-[#ffb547]"
              />
              <span>
                {t("receiveEth")}
                <span className="block text-xs text-mute">{t("receiveEthHint")}</span>
              </span>
            </label>
          )}

          <div className="rounded-xl border border-line bg-bg/40 p-4">
            {quote && amountRaw ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Stat label={t("youReceive")} value={`${formatAmount(quote.amountOut, outDecimals, 5)} ${outSymbol}`} />
                <Stat
                  label={t("minReceive")}
                  value={`${formatAmount(minimumOut(quote.amountOut, slippage), outDecimals, 5)} ${outSymbol}`}
                />
                <Stat label={t("curveFee")} value={`${formatSig(quote.fee, inDecimals, 3)} ${inSymbol}`} />
                {impact !== null && (
                  <Stat label={t("priceImpact")} value={`${impact >= 0 ? "+" : ""}${impact.toFixed(2)}%`} />
                )}
              </dl>
            ) : quoteStatus.kind === "idle" ? (
              <p className="text-sm text-mute">{t("noQuote")}</p>
            ) : (
              <StatusBanner status={quoteStatus} />
            )}
            {quote?.kind === "graduation-boundary" && <p className="mt-3 text-sm text-accent">{t("boundaryNote")}</p>}
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-mute">{t("slippage")}</span>
            <div className="flex gap-2" role="group" aria-label={t("slippage")}>
              {SLIPPAGE.map((bps) => (
                <button
                  key={bps}
                  type="button"
                  aria-pressed={slippage === bps}
                  onClick={() => setSlippage(bps)}
                  className={`num h-8 rounded-full border px-4 text-sm transition-colors ${
                    slippage === bps ? "border-accent bg-accent/15 text-accent" : "border-line text-mute hover:text-text"
                  }`}
                >
                  {bps / 100}%
                </button>
              ))}
            </div>
          </div>

          <Button
            variant={side === "buy" ? "up" : "down"}
            className="w-full"
            busy={busy}
            disabled={action.disabled}
            onClick={() => (action.connect ? void wallet.connect() : void submit())}
          >
            {action.label}
          </Button>
        </>
      )}
      <StatusBanner status={status} />
    </Panel>
  );
}
