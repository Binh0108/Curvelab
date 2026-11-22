"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createWalletClient,
  custom,
  numberToHex,
  type Address,
  type WalletClient,
} from "viem";
import { chain, GIWA_CHAIN_ID, GIWA_EXPLORER_URL, GIWA_RPC_URL, publicClient } from "./chain";

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

type WalletState = {
  hasProvider: boolean;
  account: Address | null;
  chainId: number | null;
  balance: bigint | null;
  connecting: boolean;
  switching: boolean;
  onGiwa: boolean;
  walletClient: WalletClient | null;
  connect: () => Promise<void>;
  switchToGiwa: () => Promise<boolean>;
  refreshBalance: () => Promise<void>;
  /** Makes sure the wallet is connected and on GIWA Sepolia before a transaction. */
  ensureReady: () => Promise<{ account: Address; walletClient: WalletClient }>;
};

const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside <WalletProvider>");
  return value;
}

const GIWA_PARAMS = {
  chainId: numberToHex(GIWA_CHAIN_ID),
  chainName: "GIWA Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: [GIWA_RPC_URL],
  blockExplorerUrls: [GIWA_EXPLORER_URL],
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [hasProvider, setHasProvider] = useState(false);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const accountRef = useRef<Address | null>(null);

  const provider = useCallback(() => (typeof window === "undefined" ? undefined : window.ethereum), []);

  const refreshBalance = useCallback(async () => {
    const address = accountRef.current;
    if (!address) {
      setBalance(null);
      return;
    }
    try {
      setBalance(await publicClient.getBalance({ address }));
    } catch {
      /* a transient RPC error keeps the previous balance on screen */
    }
  }, []);

  const applyAccounts = useCallback(
    (accounts: unknown) => {
      const next = Array.isArray(accounts) && typeof accounts[0] === "string" ? (accounts[0] as Address) : null;
      accountRef.current = next;
      setAccount(next);
      if (!next) setBalance(null);
      else void refreshBalance();
    },
    [refreshBalance],
  );

  const readChain = useCallback(async () => {
    const eth = provider();
    if (!eth) return;
    try {
      const hex = (await eth.request({ method: "eth_chainId" })) as string;
      setChainId(Number.parseInt(hex, 16));
    } catch {
      setChainId(null);
    }
  }, [provider]);

  // Detect the injected wallet, restore an already-authorised session and follow wallet events.
  useEffect(() => {
    const eth = provider();
    if (!eth) return;
    setHasProvider(true);
    void readChain();
    eth
      .request({ method: "eth_accounts" })
      .then(applyAccounts)
      .catch(() => undefined);
    const onAccounts = (accounts: unknown) => applyAccounts(accounts);
    const onChain = (hex: unknown) => {
      if (typeof hex === "string") setChainId(Number.parseInt(hex, 16));
    };
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [provider, applyAccounts, readChain]);

  useEffect(() => {
    if (!account) return;
    const id = window.setInterval(() => void refreshBalance(), 15_000);
    return () => window.clearInterval(id);
  }, [account, refreshBalance]);

  const switchToGiwa = useCallback(async (): Promise<boolean> => {
    const eth = provider();
    if (!eth) return false;
    setSwitching(true);
    try {
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: GIWA_PARAMS.chainId }] });
      } catch (error) {
        const code = (error as { code?: number })?.code;
        // 4902 = the wallet does not know this chain yet: add it, which also switches to it.
        if (code === 4902 || code === -32603) {
          await eth.request({ method: "wallet_addEthereumChain", params: [GIWA_PARAMS] });
        } else {
          throw error;
        }
      }
      await readChain();
      return true;
    } catch {
      return false;
    } finally {
      setSwitching(false);
    }
  }, [provider, readChain]);

  const connect = useCallback(async () => {
    const eth = provider();
    if (!eth) return;
    setConnecting(true);
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      applyAccounts(accounts);
      await readChain();
      const hex = (await eth.request({ method: "eth_chainId" })) as string;
      if (Number.parseInt(hex, 16) !== GIWA_CHAIN_ID) await switchToGiwa();
    } catch {
      /* the user closed the wallet prompt; the header keeps showing "Connect wallet" */
    } finally {
      setConnecting(false);
    }
  }, [provider, applyAccounts, readChain, switchToGiwa]);

  const walletClient = useMemo<WalletClient | null>(() => {
    if (!hasProvider || !account) return null;
    const eth = provider();
    if (!eth) return null;
    return createWalletClient({ account, chain, transport: custom(eth) });
  }, [hasProvider, account, provider]);

  const ensureReady = useCallback(async () => {
    const eth = provider();
    if (!eth) throw new Error("No injected wallet found");
    let current = accountRef.current;
    if (!current) {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as unknown;
      applyAccounts(accounts);
      current = accountRef.current;
    }
    if (!current) throw new Error("Wallet not connected");
    const hex = (await eth.request({ method: "eth_chainId" })) as string;
    if (Number.parseInt(hex, 16) !== GIWA_CHAIN_ID) {
      const ok = await switchToGiwa();
      if (!ok) throw Object.assign(new Error("Wrong network: switch to GIWA Sepolia (91342)"), { code: "chain" });
    }
    return { account: current, walletClient: createWalletClient({ account: current, chain, transport: custom(eth) }) };
  }, [provider, applyAccounts, switchToGiwa]);

  const value: WalletState = {
    hasProvider,
    account,
    chainId,
    balance,
    connecting,
    switching,
    onGiwa: chainId === GIWA_CHAIN_ID,
    walletClient,
    connect,
    switchToGiwa,
    refreshBalance,
    ensureReady,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
