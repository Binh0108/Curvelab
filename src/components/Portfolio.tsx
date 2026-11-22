"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { readHoldings, type CurveInfo, type Holding, type TokenMeta } from "@/lib/lab";
import { formatAmount } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useWallet } from "@/lib/wallet";
import { AddressLink, Button, Panel, StatusBanner } from "./ui";

type Props = {
  curves: CurveInfo[];
  metas: Record<string, TokenMeta>;
  refreshKey: number;
  onSell: (curve: string) => void;
};

export function Portfolio({ curves, metas, refreshKey, onSell }: Props) {
  const { t, explain } = useI18n();
  const wallet = useWallet();
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!wallet.account || curves.length === 0) {
      setHoldings(null);
      return;
    }
    let cancelled = false;
    setHoldings(null);
    setError(null);
    readHoldings(curves, wallet.account)
      .then((result) => {
        if (!cancelled) setHoldings(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet.account, curves, refreshKey, tick]);

  const total = (holdings ?? []).reduce((sum, h) => sum + (h.valueWeth ?? 0n), 0n);

  return (
    <Panel className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t("pfTitle")}</h2>
          <p className="mt-1 text-sm text-mute">{t("pfBody")}</p>
        </div>
        <button
          type="button"
          onClick={() => setTick((n) => n + 1)}
          aria-label={t("retry")}
          title={t("retry")}
          className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-mute hover:border-accent/60 hover:text-accent"
        >
          <RefreshCw className={`size-4 ${wallet.account && holdings === null && !error ? "animate-spin" : ""}`} />
        </button>
      </div>

      {!wallet.account && <p className="text-sm text-mute">{t("pfConnect")}</p>}
      {wallet.account && holdings === null && !error && (
        <StatusBanner status={{ kind: "loading", message: t("pfLoading") }} />
      )}
      {error !== null && <StatusBanner status={{ kind: "error", ...explain(error) }} />}
      {holdings && holdings.length === 0 && <p className="text-sm text-mute">{t("pfEmpty")}</p>}

      {holdings && holdings.length > 0 && (
        <>
          <p className="num text-2xl font-medium">
            <span className="mr-2 text-sm font-normal text-mute">{t("pfTotal")}</span>
            {formatAmount(total, 18, 5)} WETH
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="text-xs text-mute">
                <tr>
                  <th className="pb-2 pr-3 font-medium">{t("colToken")}</th>
                  <th className="pb-2 pr-3 text-right font-medium">{t("colBalance")}</th>
                  <th className="pb-2 pr-3 text-right font-medium">{t("colValue")}</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {holdings.map((h) => {
                  const meta = metas[h.token.toLowerCase()];
                  return (
                    <tr key={h.curve}>
                      <td className="py-3 pr-3">
                        <span className="font-semibold">{meta?.symbol ?? "???"}</span>{" "}
                        <AddressLink address={h.token} />
                      </td>
                      <td className="num py-3 pr-3 text-right">{formatAmount(h.balance, meta?.decimals ?? 18, 4)}</td>
                      <td className="num py-3 pr-3 text-right">
                        {h.valueWeth === null ? "—" : formatAmount(h.valueWeth, 18, 6)}
                      </td>
                      <td className="py-3 text-right">
                        <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => onSell(h.curve)}>
                          {t("pfSell")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
