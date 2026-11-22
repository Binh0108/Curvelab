import {
  AmmoraPortableLifecyclePlanner,
  AmmoraV4LaunchCurveClient,
  assertAmmoraPortableBlockCanonical,
  buildCreateAmmoraV4Launch,
  classifyAmmoraV4ExactInputFill,
  discoverAmmoraPools,
  getAmmoraV4ConfigAtBlock,
  getAmmoraV4NextConfigId,
  giwaSepoliaAtomicLaunchDeployment,
  giwaSepoliaAtomicLaunchTargets,
  giwaSepoliaAutoRoute,
  parseAmmoraV4LaunchCreatedReceipt,
  verifyAmmoraPortableDeploymentAtBlock,
  verifyAmmoraV4CoreAtBlock,
} from "@ammora-protocol/sdk";
import {
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { chain, CORE, publicClient, WETH } from "./chain";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The SDK asks every caller to pick an explicit confirmed block instead of "latest".
 * A few blocks of depth (GIWA blocks are ~1s) keeps public-RPC reads consistent.
 */
const CONFIRMATION_DEPTH = 3n;

export async function confirmedBlock(): Promise<bigint> {
  const head = await publicClient.getBlockNumber();
  return head > CONFIRMATION_DEPTH ? head - CONFIRMATION_DEPTH : head;
}

async function waitForConfirmedBlock(minimum: bigint, timeoutMs = 45_000): Promise<bigint> {
  const started = Date.now();
  for (;;) {
    const block = await confirmedBlock();
    if (block >= minimum) return block;
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for the next confirmed block");
    await sleep(1000);
  }
}

const deadlineIn = (seconds: number) => BigInt(Math.floor(Date.now() / 1000) + seconds);

/* ------------------------------------------------------------------ */
/* Token metadata                                                      */
/* ------------------------------------------------------------------ */

export type TokenMeta = { name: string; symbol: string; decimals: number };

const metaCache = new Map<string, TokenMeta>();

export async function readTokenMeta(addresses: Address[]): Promise<Record<string, TokenMeta>> {
  const missing = Array.from(new Set(addresses.map((a) => a.toLowerCase()))).filter((a) => !metaCache.has(a));
  if (missing.length > 0) {
    const calls = missing.flatMap((address) => [
      { address: address as Address, abi: erc20Abi, functionName: "name" as const },
      { address: address as Address, abi: erc20Abi, functionName: "symbol" as const },
      { address: address as Address, abi: erc20Abi, functionName: "decimals" as const },
    ]);
    const results = await publicClient.multicall({ contracts: calls, allowFailure: true });
    missing.forEach((address, index) => {
      const name = results[index * 3];
      const symbol = results[index * 3 + 1];
      const decimals = results[index * 3 + 2];
      metaCache.set(address, {
        name: name.status === "success" ? String(name.result) : "Unnamed token",
        symbol: symbol.status === "success" ? String(symbol.result) : "???",
        decimals: decimals.status === "success" ? Number(decimals.result) : 18,
      });
    });
  }
  const out: Record<string, TokenMeta> = {};
  for (const address of addresses) out[address.toLowerCase()] = metaCache.get(address.toLowerCase())!;
  return out;
}

export async function readBalance(token: Address, owner: Address): Promise<bigint> {
  return publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
}

/* ------------------------------------------------------------------ */
/* Bonding curve reads                                                 */
/* ------------------------------------------------------------------ */

export const curveClient = (curve: Address) =>
  new AmmoraV4LaunchCurveClient(publicClient, curve, {
    launchFactory: CORE.launchFactory,
    feePolicy: CORE.feePolicy,
  });

/** 0 uninitialised · 1 active · 2 ready to migrate · 3 migrated */
export type CurveSnapshot = {
  status: number;
  baseToken: Address;
  quoteToken: Address;
  baseReserve: bigint;
  quoteReserve: bigint;
  current: bigint;
  target: bigint;
  progressBps: number;
  canonicalPool: Address;
  asOfBlock: bigint;
};

export async function readCurve(curve: Address): Promise<CurveSnapshot> {
  const client = curveClient(curve);
  const block = await confirmedBlock();
  const [state, progress] = await Promise.all([
    client.getStateAtBlock(block),
    client.getMigrationProgressAtBlock(block),
  ]);
  return {
    status: state.status,
    baseToken: state.baseToken,
    quoteToken: state.quoteToken,
    baseReserve: state.baseReserve,
    quoteReserve: state.quoteReserve,
    current: progress.current,
    target: progress.target,
    progressBps: progress.progressBps,
    canonicalPool: progress.canonicalPool,
    asOfBlock: block,
  };
}

/* ------------------------------------------------------------------ */
/* Trading                                                             */
/* ------------------------------------------------------------------ */

export type TradeSide = "buy" | "sell";

export type TradeQuote = {
  amountIn: bigint;
  amountOut: bigint;
  amountLeft: bigint;
  fee: bigint;
  kind: "full" | "graduation-boundary" | "terminal-dust" | "partial";
  asOfBlock: bigint;
};

export const minimumOut = (amountOut: bigint, slippageBps: number) =>
  (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

export async function quoteTrade(curve: Address, side: TradeSide, amountIn: bigint): Promise<TradeQuote> {
  const baseForQuote = side === "sell";
  const quote = await curveClient(curve).quoteExactInput(amountIn, baseForQuote);
  const fill = classifyAmmoraV4ExactInputFill(quote, baseForQuote);
  return {
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    amountLeft: quote.amountLeft,
    fee: quote.fee,
    kind: fill.kind,
    asOfBlock: quote.asOfBlock,
  };
}

export type StepHandler = (step: "wrap" | "approve" | "sign" | "confirm" | "wait" | "unwrap", hash?: Hex) => void;

type Tx = { to: Address; data: Hex; value?: bigint };

/** Simulates first so reverts and missing gas show up before the wallet pops up, then sends and waits. */
export async function sendTx(
  walletClient: WalletClient,
  account: Address,
  tx: Tx,
  onStep?: StepHandler,
): Promise<{ hash: Hex; receipt: TransactionReceipt }> {
  await publicClient.estimateGas({ account, to: tx.to, data: tx.data, value: tx.value });
  onStep?.("sign");
  const hash = await walletClient.sendTransaction({
    account,
    chain,
    to: tx.to,
    data: tx.data,
    value: tx.value,
  });
  onStep?.("confirm", hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error("The transaction was mined but reverted");
  return { hash, receipt };
}

async function approveExact(
  walletClient: WalletClient,
  account: Address,
  requirement: { token: Address; spender: Address; amount: bigint; resetToZero?: boolean },
  onStep?: StepHandler,
) {
  const current = await publicClient.readContract({
    address: requirement.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account, requirement.spender],
  });
  if (current >= requirement.amount) return;
  onStep?.("approve");
  if (requirement.resetToZero && current > 0n) {
    await sendTx(walletClient, account, {
      to: requirement.token,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [requirement.spender, 0n] }),
    });
  }
  await sendTx(
    walletClient,
    account,
    {
      to: requirement.token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [requirement.spender, requirement.amount],
      }),
    },
    onStep,
  );
}

async function waitForBalance(token: Address, owner: Address, minimum: bigint, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if ((await readBalance(token, owner)) >= minimum) return;
    await sleep(800);
  }
}

/**
 * Buy: optionally wraps the missing ETH into WETH first ("pay with ETH").
 * Sell: optionally unwraps the WETH that arrived ("receive ETH").
 */
export async function executeTrade(args: {
  walletClient: WalletClient;
  account: Address;
  curve: Address;
  side: TradeSide;
  amountIn: bigint;
  slippageBps: number;
  payWithEth?: boolean;
  receiveEth?: boolean;
  onStep?: StepHandler;
}): Promise<{ hash: Hex; quote: TradeQuote; minimumAmountOut: bigint }> {
  const { walletClient, account, curve, side, amountIn, slippageBps, payWithEth, receiveEth, onStep } = args;
  const baseForQuote = side === "sell";
  const client = curveClient(curve);

  const state = await client.getState();
  const spendToken = baseForQuote ? state.baseToken : state.quoteToken;
  const balance = await readBalance(spendToken, account);
  if (balance < amountIn) {
    if (baseForQuote || !payWithEth) {
      throw Object.assign(new Error("insufficient token balance for this trade"), { code: "weth" });
    }
    const missing = amountIn - balance;
    if ((await publicClient.getBalance({ address: account })) < missing) {
      throw Object.assign(new Error("insufficient funds to wrap the ETH"), { code: "gas" });
    }
    onStep?.("wrap");
    await wrapEth(walletClient, account, missing, onStep);
    await waitForBalance(spendToken, account, amountIn);
  }

  // Fresh quote right before signing; only a terminal Graduation buy may fill partially.
  const quote = await quoteTrade(curve, side, amountIn);
  if (quote.kind === "terminal-dust" || quote.kind === "partial") {
    throw new Error("This size cannot be filled as a normal trade right now. Try a different amount.");
  }
  const plan = await client.planSwapExactInput({
    includedAmountIn: amountIn,
    baseForQuote,
    allowPartialFill: quote.kind === "graduation-boundary",
    slippageBps,
    recipient: account,
    deadline: deadlineIn(20 * 60),
  });

  const wethBefore = baseForQuote && receiveEth ? await readBalance(WETH, account) : 0n;
  for (const requirement of plan.approvalRequirements) {
    await approveExact(walletClient, account, requirement, onStep);
  }
  const { hash } = await sendTx(walletClient, account, plan.transaction as Tx, onStep);

  if (baseForQuote && receiveEth) {
    await waitForBalance(WETH, account, wethBefore + 1n, 8_000);
    const received = (await readBalance(WETH, account)) - wethBefore;
    if (received > 0n) {
      onStep?.("unwrap");
      await unwrapWeth(walletClient, account, received, onStep);
    }
  }
  return { hash, quote, minimumAmountOut: plan.quote.minimumAmountOut };
}

export async function executeMigrate(args: {
  walletClient: WalletClient;
  account: Address;
  curve: Address;
  onStep?: StepHandler;
}) {
  const block = await confirmedBlock();
  const plan = await curveClient(args.curve).planMigrateAtBlock(block);
  return sendTx(args.walletClient, args.account, plan.transaction as Tx, args.onStep);
}

/* ------------------------------------------------------------------ */
/* WETH wrap / unwrap (quote asset on GIWA is WETH, gas is native ETH) */
/* ------------------------------------------------------------------ */

const wethAbi = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "wad", type: "uint256" }], outputs: [] },
] as const;

export async function wrapEth(walletClient: WalletClient, account: Address, amount: bigint, onStep?: StepHandler) {
  return sendTx(
    walletClient,
    account,
    { to: WETH, data: encodeFunctionData({ abi: wethAbi, functionName: "deposit" }), value: amount },
    onStep,
  );
}

export async function unwrapWeth(walletClient: WalletClient, account: Address, amount: bigint, onStep?: StepHandler) {
  return sendTx(
    walletClient,
    account,
    { to: WETH, data: encodeFunctionData({ abi: wethAbi, functionName: "withdraw", args: [amount] }) },
    onStep,
  );
}

/* ------------------------------------------------------------------ */
/* Launch configs and token creation                                   */
/* ------------------------------------------------------------------ */

export type ConfigOption = {
  id: bigint;
  hash: Hex;
  enabled: boolean;
  tokenDecimals: number;
  poolCreationFee: bigint;
  quoteThreshold: bigint;
  totalSupply: bigint;
  cliffFeeBps: number;
  segments: number;
};

/** The reviewed GIWA template; it is the default and the safest starting point. */
export const DEFAULT_CONFIG_ID = 6n;

export async function listConfigs(): Promise<ConfigOption[]> {
  const block = await confirmedBlock();
  const next = await getAmmoraV4NextConfigId(publicClient, CORE.configRegistry, block);
  const last = next > 17n ? 16n : next - 1n;
  const ids: bigint[] = [];
  for (let id = 1n; id <= last; id += 1n) ids.push(id);

  const out: ConfigOption[] = [];
  // Small batches keep the public RPC happy.
  for (let i = 0; i < ids.length; i += 3) {
    const batch = await Promise.all(
      ids.slice(i, i + 3).map(async (id) => {
        try {
          const entry = await getAmmoraV4ConfigAtBlock(publicClient, CORE.configRegistry, id, block);
          return {
            id,
            hash: entry.configHash,
            enabled: entry.enabled,
            tokenDecimals: Number(entry.config.tokenDecimals),
            poolCreationFee: entry.config.poolCreationFee,
            quoteThreshold: entry.config.migrationQuoteThreshold,
            totalSupply: entry.config.totalSupply,
            cliffFeeBps: Number(entry.config.cliffFeeBps),
            segments: entry.segments.length,
          } satisfies ConfigOption;
        } catch {
          return null;
        }
      }),
    );
    for (const item of batch) if (item && item.enabled) out.push(item);
  }
  return out;
}

export type LaunchProgress = "verify" | "wrap" | "unwrap" | "approve" | "sign" | "confirm" | "wait";

export type LaunchResult = {
  hash: Hex;
  token?: Address;
  curve?: Address;
  firstBuy: boolean;
};

async function maxFeePerGas(): Promise<bigint> {
  try {
    const fees = await publicClient.estimateFeesPerGas();
    if (fees.maxFeePerGas) return fees.maxFeePerGas * 2n;
  } catch {
    /* fall through to gas price */
  }
  return (await publicClient.getGasPrice()) * 2n;
}

function parseLaunch(receipt: TransactionReceipt) {
  try {
    const created = parseAmmoraV4LaunchCreatedReceipt(receipt, CORE.launchFactory);
    return { token: created.token as Address, curve: created.curve as Address };
  } catch {
    return {};
  }
}

export async function launchToken(args: {
  walletClient: WalletClient;
  account: Address;
  config: ConfigOption;
  name: string;
  symbol: string;
  uri: string;
  /** WETH raw amount for the atomic first buy; 0n creates the token without buying. */
  firstBuyRaw: bigint;
  /** Wrap the missing ETH into WETH automatically for the first buy. */
  payWithEth?: boolean;
  onStep?: (step: LaunchProgress, hash?: Hex) => void;
}): Promise<LaunchResult> {
  const { walletClient, account, config, name, symbol, uri, firstBuyRaw, payWithEth, onStep } = args;
  const launch = {
    name,
    symbol,
    metadataURI: uri,
    creatorMetadataURI: uri,
    tokenDecimals: config.tokenDecimals,
  };

  onStep?.("verify");
  const nativeBalance = await publicClient.getBalance({ address: account });
  if (nativeBalance < config.poolCreationFee) {
    throw Object.assign(new Error("insufficient funds for the pool creation fee"), { code: "gas" });
  }

  // ---- Path A: create the token only, on the selected immutable Config ----
  if (firstBuyRaw === 0n) {
    const block = await confirmedBlock();
    await verifyAmmoraV4CoreAtBlock(publicClient, CORE, block);
    const entry = await getAmmoraV4ConfigAtBlock(publicClient, CORE.configRegistry, config.id, block);
    if (!entry.enabled) throw new Error(`Config #${config.id} is disabled`);
    if (entry.configHash !== config.hash) throw new Error("Config changed since it was loaded; reload and retry");
    const tx = buildCreateAmmoraV4Launch(launch, config.id, entry.config.poolCreationFee);
    const { hash, receipt } = await sendTx(
      walletClient,
      account,
      { to: CORE.launchFactory, data: tx.data, value: tx.value },
      (step, h) => onStep?.(step === "approve" ? "approve" : step, h),
    );
    return { hash, firstBuy: false, ...parseLaunch(receipt) };
  }

  // ---- Path B: token + first buy in ONE transaction (GIWA FirstBuyExecutor, SDK 0.3.9) ----
  const wethBalance = await readBalance(WETH, account);
  if (wethBalance < firstBuyRaw) {
    if (!payWithEth) throw Object.assign(new Error("insufficient WETH for the first buy"), { code: "weth" });
    const missing = firstBuyRaw - wethBalance;
    if (nativeBalance < config.poolCreationFee + missing) {
      throw Object.assign(new Error("insufficient funds to wrap the first-buy ETH"), { code: "gas" });
    }
    onStep?.("wrap");
    await wrapEth(walletClient, account, missing, (step, h) => onStep?.(step === "wrap" ? "wrap" : (step as LaunchProgress), h));
    await waitForBalance(WETH, account, firstBuyRaw);
  }

  const plan = async () => {
    const block = await confirmedBlock();
    const context = await verifyAmmoraPortableDeploymentAtBlock(
      publicClient,
      giwaSepoliaAtomicLaunchDeployment,
      block,
    );
    const planner = new AmmoraPortableLifecyclePlanner(context, giwaSepoliaAtomicLaunchTargets);
    const result = await planner.planExistingConfigAtomicFirstBuy({
      account,
      configId: config.id,
      expectedConfigHash: config.hash,
      launch,
      // The token does not exist until this very transaction, so nobody can trade ahead of the
      // creator; a positive minimum is still required by the planner.
      firstBuys: [
        {
          includedQuoteAmountRaw: firstBuyRaw,
          minimumBaseAmountOutRaw: 1n,
          allowPartialFill: false,
          recipient: account,
        },
      ],
      deadline: deadlineIn(20 * 60),
      gas: { maxFeePerGasNativeRaw: await maxFeePerGas(), safetyMarginBps: 2000n },
      allowancePolicy: "prepare-approval",
    });
    await assertAmmoraPortableBlockCanonical(context);
    return result;
  };

  let current = await plan();
  if (current.status === "APPROVAL_REQUIRED") {
    onStep?.("approve");
    const approval = await sendTx(walletClient, account, current.transaction as Tx, (step, h) =>
      onStep?.(step === "approve" ? "approve" : step, h),
    );
    // The planner reads allowance at a confirmed block: wait until that block includes the approval.
    onStep?.("wait");
    await waitForConfirmedBlock(approval.receipt.blockNumber);
    current = await plan();
    if (current.status === "APPROVAL_REQUIRED") {
      throw new Error("The WETH approval is not visible on-chain yet. Please try again in a few seconds.");
    }
  }

  const { hash, receipt } = await sendTx(walletClient, account, current.transaction as Tx, (step, h) =>
    onStep?.(step === "approve" ? "approve" : step, h),
  );
  return { hash, firstBuy: true, ...parseLaunch(receipt) };
}

/* ------------------------------------------------------------------ */
/* Curve discovery (straight from factory logs, no indexer)            */
/* ------------------------------------------------------------------ */

export type CurveInfo = { curve: Address; token: Address; creationBlock: bigint };

export const LOOKBACK_STEPS = [150_000n, 900_000n] as const;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function discoverCurves(lookback: bigint): Promise<{ curves: CurveInfo[]; head: bigint; from: bigint }> {
  const head = await publicClient.getBlockNumber();
  const dbcFactories = giwaSepoliaAutoRoute.factories.filter((f) => f.kind === "dbc");
  const floor = dbcFactories.reduce((low, f) => (f.startBlock < low ? f.startBlock : low), dbcFactories[0].startBlock);
  const from = head > lookback + floor ? head - lookback : floor;
  const pools = await discoverAmmoraPools({
    clients: [publicClient],
    deployment: { ...giwaSepoliaAutoRoute, factories: dbcFactories } as typeof giwaSepoliaAutoRoute,
    fromBlock: from,
    toBlock: head - 12n,
    initialWindow: 1000n,
    maximumWindow: 1000n,
  });
  const curves = pools
    .filter((p) => same(p.quoteToken, WETH))
    .map((p) => ({ curve: p.pool as Address, token: p.baseToken as Address, creationBlock: p.creationBlock }))
    .sort((a, b) => (a.creationBlock === b.creationBlock ? 0 : a.creationBlock > b.creationBlock ? -1 : 1));
  return { curves, head, from };
}

/* ------------------------------------------------------------------ */
/* Market stats and the depth ladder                                   */
/* ------------------------------------------------------------------ */

export type MarketStats = {
  snap: CurveSnapshot;
  /** WETH wei per one whole token, from a tiny probe buy. Null when the curve cannot be bought from. */
  price: bigint | null;
  totalSupply: bigint;
};

const PROBE = 100_000_000_000_000n; // 0.0001 WETH

const pricePerToken = (spent: bigint, out: bigint, decimals: number) =>
  out > 0n ? (spent * 10n ** BigInt(decimals)) / out : 0n;

export async function readMarket(curve: Address, decimals: number): Promise<MarketStats> {
  const snap = await readCurve(curve);
  const [totalSupply, probe] = await Promise.all([
    publicClient.readContract({ address: snap.baseToken, abi: erc20Abi, functionName: "totalSupply" }),
    curveClient(curve)
      .quoteExactInput(PROBE, false)
      .catch(() => null),
  ]);
  const price = probe && probe.amountOut > 0n ? pricePerToken(PROBE - probe.amountLeft, probe.amountOut, decimals) : null;
  return { snap, price, totalSupply };
}

/** Buy sizes in WETH wei used to draw the depth chart. */
export const LADDER: readonly bigint[] = [
  500_000_000_000_000n,
  1_000_000_000_000_000n,
  2_500_000_000_000_000n,
  5_000_000_000_000_000n,
  10_000_000_000_000_000n,
  25_000_000_000_000_000n,
  50_000_000_000_000_000n,
  100_000_000_000_000_000n,
];

export type LadderPoint = { spend: bigint; out: bigint; avgPrice: bigint };

export async function readLadder(curve: Address, decimals: number): Promise<LadderPoint[]> {
  const client = curveClient(curve);
  const results = await Promise.allSettled(LADDER.map((size) => client.quoteExactInput(size, false)));
  const points: LadderPoint[] = [];
  results.forEach((result, index) => {
    if (result.status !== "fulfilled" || result.value.amountOut <= 0n) return;
    const spend = LADDER[index] - result.value.amountLeft;
    if (spend <= 0n) return;
    points.push({ spend, out: result.value.amountOut, avgPrice: pricePerToken(spend, result.value.amountOut, decimals) });
  });
  return points;
}

/* ------------------------------------------------------------------ */
/* Portfolio                                                           */
/* ------------------------------------------------------------------ */

export type Holding = { curve: Address; token: Address; balance: bigint; valueWeth: bigint | null };

export async function readHoldings(curves: CurveInfo[], owner: Address): Promise<Holding[]> {
  const found: Holding[] = [];
  for (let i = 0; i < curves.length; i += 40) {
    const chunk = curves.slice(i, i + 40);
    const balances = await publicClient.multicall({
      contracts: chunk.map((c) => ({ address: c.token, abi: erc20Abi, functionName: "balanceOf" as const, args: [owner] as const })),
      allowFailure: true,
    });
    chunk.forEach((c, index) => {
      const result = balances[index];
      if (result.status === "success" && result.result > 0n) {
        found.push({ curve: c.curve, token: c.token, balance: result.result, valueWeth: null });
      }
    });
  }
  // What you would receive today: a live sell quote for the whole balance.
  const quotes = await Promise.allSettled(found.map((h) => curveClient(h.curve).quoteExactInput(h.balance, true)));
  quotes.forEach((q, index) => {
    if (q.status === "fulfilled") found[index].valueWeth = q.value.amountOut;
  });
  return found;
}

/* ------------------------------------------------------------------ */
/* Single launch config                                                */
/* ------------------------------------------------------------------ */

export async function readConfig(id: bigint): Promise<ConfigOption> {
  const block = await confirmedBlock();
  const entry = await getAmmoraV4ConfigAtBlock(publicClient, CORE.configRegistry, id, block);
  if (!entry.enabled) throw new Error(`Config #${id} is disabled`);
  return {
    id,
    hash: entry.configHash,
    enabled: entry.enabled,
    tokenDecimals: Number(entry.config.tokenDecimals),
    poolCreationFee: entry.config.poolCreationFee,
    quoteThreshold: entry.config.migrationQuoteThreshold,
    totalSupply: entry.config.totalSupply,
    cliffFeeBps: Number(entry.config.cliffFeeBps),
    segments: entry.segments.length,
  };
}
