"use client";

import { AlertTriangle, ExternalLink, Wallet } from "lucide-react";
import { formatAmount, shortAddress } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useWallet } from "@/lib/wallet";
import { explorerAddress } from "@/lib/chain";

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#161a20" stroke="#2a313b" />
      <path d="M6 25 H26 M6 25 V7" stroke="#3a434f" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M8 23 C14 22.5, 18 20, 21 14 S25 9, 26 8" fill="none" stroke="#ffb547" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="21" cy="14" r="2.4" fill="#0f1216" stroke="#5bc8ff" strokeWidth="1.8" />
    </svg>
  );
}

export function Header() {
  const { t, lang, setLang } = useI18n();
  const wallet = useWallet();

  return (
    <header className="border-b border-line/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="leading-tight">
            <p className="text-lg font-semibold tracking-tight">Curvelab</p>
            <p className="hidden text-xs text-mute sm:block">{t("tagline")}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="inline-flex rounded-full border border-line p-0.5 text-xs" role="group" aria-label="Language">
            {(["en", "vi"] as const).map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={lang === code}
                onClick={() => setLang(code)}
                className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                  lang === code ? "bg-panel-2 text-text" : "text-mute hover:text-text"
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>

          {wallet.account && !wallet.onGiwa ? (
            <button
              type="button"
              onClick={() => void wallet.switchToGiwa()}
              disabled={wallet.switching}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-amber/50 bg-amber/10 px-3.5 text-sm text-amber hover:bg-amber/20 disabled:opacity-60"
            >
              <AlertTriangle className="size-4" />
              {wallet.switching ? t("switching") : t("switchNetwork")}
            </button>
          ) : (
            <span className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3.5 text-sm text-mute">
              <span className={`size-2 rounded-full ${wallet.onGiwa ? "bg-accent" : "bg-mute/60"}`} />
              {t("network")}
            </span>
          )}

          {wallet.account ? (
            <a
              href={explorerAddress(wallet.account)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2.5 rounded-full border border-line bg-panel px-3.5 text-sm hover:border-accent/60"
              title={wallet.account}
            >
              <span className="font-mono text-xs text-accent">
                {wallet.balance === null ? "…" : `${formatAmount(wallet.balance, 18, 4)} ETH`}
              </span>
              <span className="font-mono text-xs">{shortAddress(wallet.account)}</span>
              <ExternalLink className="size-3 text-mute" />
            </a>
          ) : wallet.hasProvider ? (
            <button
              type="button"
              onClick={() => void wallet.connect()}
              disabled={wallet.connecting}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-[#1c1300] hover:bg-[#ffc978] disabled:opacity-60"
            >
              <Wallet className="size-4" />
              {wallet.connecting ? t("connecting") : t("connect")}
            </button>
          ) : (
            <a
              href="https://metamask.io/download"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-4 text-sm hover:border-accent/60 hover:text-accent"
            >
              <Wallet className="size-4" />
              {t("noWallet")}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
