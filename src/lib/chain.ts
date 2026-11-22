import { createPublicClient, defineChain, http, type PublicClient } from "viem";
import { giwaSepolia } from "viem/chains";
import { giwaSepoliaAutoRouteDeployment } from "@ammora-protocol/sdk";

export const GIWA_CHAIN_ID = 91342;
export const GIWA_RPC_URL = "https://sepolia-rpc.giwa.io";
export const GIWA_EXPLORER_URL = "https://sepolia-explorer.giwa.io";
export const AMMORA_DATA_API_URL = "https://ammora-giwa-sepolia-data.fly.dev";

/**
 * GIWA Sepolia. viem ships the OP-stack definition (id 91342); we pin the RPC and
 * explorer explicitly so the app never depends on a default changing underneath it.
 */
export const chain = defineChain({
  ...giwaSepolia,
  id: GIWA_CHAIN_ID,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [GIWA_RPC_URL] } },
  blockExplorers: {
    default: { name: "GIWA Explorer", url: GIWA_EXPLORER_URL },
  },
  testnet: true,
});

export const publicClient = createPublicClient({
  chain,
  transport: http(GIWA_RPC_URL, { batch: true, retryCount: 3, retryDelay: 400 }),
}) as unknown as PublicClient;

const launch = giwaSepoliaAutoRouteDeployment.contracts.launch;

/** Ammora V4 "auto-route" generation on GIWA Sepolia, taken straight from the SDK catalog. */
export const CORE = {
  configRegistry: launch.configRegistry,
  launchFactory: launch.factory,
  graduationAdapter: launch.graduationAdapter,
  feePolicy: launch.feePolicy,
} as const;

export const WETH = giwaSepoliaAutoRouteDeployment.contracts.tokens.wrappedNative;

export const explorerTx = (hash: string) => `${GIWA_EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (address: string) => `${GIWA_EXPLORER_URL}/address/${address}`;
