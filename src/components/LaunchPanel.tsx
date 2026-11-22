"use client";

import { useEffect, useState } from "react";
import { Rocket } from "lucide-react";
import { formatEther } from "viem";
import { DEFAULT_CONFIG_ID, launchToken, readConfig, type ConfigOption } from "@/lib/lab";
import { formatAmount, parseAmount } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useWallet } from "@/lib/wallet";
import { AddressLink, Button, Field, Panel, StatusBanner, type Status } from "./ui";

const DEFAULT_URI = "https://example.com/ammora/token.json";

type Props = {
  onLaunched: (token: string, curve: string | undefined) => void;
  onOpen: (curve: string) => void;
};

export function LaunchPanel({ onLaunched, onOpen }: Props) {
  const { t, explain } = useI18n();
  const wallet = useWallet();

  const [config, setConfig] = useState<ConfigOption | null>(null);
  const [configStatus, setConfigStatus] = useState<Status>({ kind: "loading", message: t("cfgLoading") });
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [uri, setUri] = useState(DEFAULT_URI);
  const [firstBuy, setFirstBuy] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    readConfig(DEFAULT_CONFIG_ID)
      .then((c) => {
        if (cancelled) return;
        setConfig(c);
        setConfigStatus({ kind: "idle" });
      })
      .catch((e) => {
        if (!cancelled) setConfigStatus({ kind: "error", message: t("cfgError"), detail: explain(e).detail });
      });
    return () => {
      cancelled = true;
    };
    // The config is read once; messages for it are not re-translated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buyRaw = firstBuy.trim() === "" ? 0n : parseAmount(firstBuy, 18);
  const buyInvalid = firstBuy.trim() !== "" && buyRaw === null;
  const busy = status.kind === "loading" || status.kind === "wallet" || status.kind === "pending";

  const submit = async () => {
    if (!config) return;
    if (!(name.trim() && symbol.trim() && uri.trim())) {
      setStatus({ kind: "error", message: t("invalidForm") });
      return;
    }
    if (buyRaw === null) {
      setStatus({ kind: "error", message: t("invalidBuy") });
      return;
    }
    try {
      setStatus({ kind: "loading", message: t("stepVerify") });
      const { account, walletClient } = await wallet.ensureReady();
      const result = await launchToken({
        walletClient,
        account,
        config,
        name: name.trim(),
        symbol: symbol.trim(),
        uri: uri.trim(),
        firstBuyRaw: buyRaw,
        payWithEth: true,
        onStep: (step, hash) => {
          if (step === "verify") setStatus({ kind: "loading", message: t("stepVerify") });
          else if (step === "wrap") setStatus({ kind: "wallet", message: t("stepWrap") });
          else if (step === "approve") setStatus({ kind: "wallet", message: t("stepApprove") });
          else if (step === "sign") setStatus({ kind: "wallet", message: t("stepSign") });
          else if (step === "wait") setStatus({ kind: "pending", message: t("stepWait") });
          else setStatus({ kind: "pending", message: t("stepConfirm"), hash });
        },
      });
      setStatus({
        kind: "success",
        message: t("launchedTitle"),
        hash: result.hash,
        children: (
          <div className="space-y-2 pt-1">
            <p className="text-mute">{t("launchedBody", { name: name.trim(), symbol: symbol.trim() })}</p>
            {result.token && (
              <p className="text-xs text-mute">
                {t("tokenAddr")} <AddressLink address={result.token} />
                {result.curve && (
                  <>
                    {" · "}
                    {t("curveAddr")} <AddressLink address={result.curve} />
                  </>
                )}
              </p>
            )}
            {result.curve && (
              <Button variant="primary" className="mt-1 h-10" onClick={() => onOpen(result.curve as string)}>
                {t("openTerminal")}
              </Button>
            )}
          </div>
        ),
      });
      if (result.token) onLaunched(result.token, result.curve);
      setName("");
      setSymbol("");
      setFirstBuy("");
      void wallet.refreshBalance();
    } catch (error) {
      setStatus({ kind: "error", ...explain(error) });
    }
  };

  return (
    <Panel className="mx-auto max-w-2xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{t("launchTitle")}</h2>
        <p className="mt-1 text-sm text-mute">{t("launchBody")}</p>
      </div>

      <StatusBanner status={configStatus} />
      {config && (
        <p className="num rounded-xl border border-line bg-bg/40 px-4 py-3 text-xs text-mute">
          {t("cfgLine", {
            id: config.id.toString(),
            supply: formatAmount(config.totalSupply, config.tokenDecimals, 0),
            threshold: formatAmount(config.quoteThreshold, 18, 4),
            fee: formatEther(config.poolCreationFee),
          })}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("fName")} value={name} maxLength={32} placeholder="Giwa Cat" onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <Field
          label={t("fSymbol")}
          value={symbol}
          maxLength={10}
          mono
          placeholder="GCAT"
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          autoComplete="off"
        />
      </div>
      <Field label={t("fUri")} hint={t("fUriHint")} value={uri} mono onChange={(e) => setUri(e.target.value)} autoComplete="off" spellCheck={false} />
      <Field
        label={t("fFirstBuy")}
        hint={t("fFirstBuyHint")}
        inputMode="decimal"
        mono
        placeholder="0.001"
        suffix="ETH"
        invalid={buyInvalid}
        value={firstBuy}
        onChange={(e) => setFirstBuy(e.target.value)}
      />

      <Button className="w-full" busy={busy} disabled={!config || !wallet.account || buyInvalid} onClick={() => void submit()}>
        <Rocket className="size-4" />
        {buyRaw ? t("btnLaunchBuy") : t("btnLaunch")}
      </Button>
      {!wallet.account && <p className="text-sm text-mute">{t("needWallet")}</p>}
      <StatusBanner status={status} />
    </Panel>
  );
}
