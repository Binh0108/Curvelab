"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { classifyError } from "./format";

const en = {
  tagline: "Bonding-curve terminal for GIWA Sepolia",
  connect: "Connect wallet",
  connecting: "Connecting…",
  noWallet: "Install a wallet",
  switchNetwork: "Switch to GIWA Sepolia",
  switching: "Switching…",
  network: "GIWA Sepolia",
  tabTerminal: "Terminal",
  tabPortfolio: "Portfolio",
  tabLaunch: "Launch",
  heroTitle: "See the curve before you trade it",
  heroBody:
    "Curvelab reads Ammora launch curves straight from GIWA Sepolia, draws the real price impact from live on-chain quotes, and lets you buy with plain ETH in one click.",

  radarTitle: "Radar",
  radarSearch: "Search name, symbol or address",
  radarEmpty: "No launch curves found in this range.",
  radarLoading: "Scanning GIWA Sepolia for launch curves…",
  radarError: "Could not scan the chain.",
  radarErrorHint: "The public RPC may be busy. Try again in a moment.",
  retry: "Retry",
  scanOlder: "Scan older launches",
  scanned: "{count} curves · last {blocks} blocks",
  pickToken: "Pick a launch from the radar to start.",

  statPrice: "Price",
  statFdv: "Fully diluted value",
  statProgress: "Graduation",
  statRaised: "Raised",
  statStatus: "Status",
  status0: "Not started",
  status1: "Live",
  status2: "Ready to graduate",
  status3: "Graduated",
  tokenAddr: "Token",
  curveAddr: "Curve",

  chartTitle: "Depth: what each buy size costs",
  chartBody: "Average price you would pay, from live on-chain quotes. Hover the chart to read a point.",
  chartLoading: "Quoting buy sizes…",
  chartEmpty: "This curve cannot be bought from right now.",
  chartSpend: "Spend",
  chartGet: "Get",
  chartAvg: "Avg price",
  chartImpact: "Impact",

  buy: "Buy",
  sell: "Sell",
  youPay: "You pay",
  youReceive: "You receive (est.)",
  minReceive: "Minimum received",
  slippage: "Slippage",
  curveFee: "Curve fee",
  priceImpact: "Impact vs spot",
  balance: "Balance",
  max: "Max",
  payWithEth: "Pay with ETH (auto-wrap)",
  payWithEthHint: "Wraps the missing ETH into WETH first, then buys.",
  receiveEth: "Receive ETH (auto-unwrap)",
  receiveEthHint: "Unwraps the WETH you get back into ETH.",
  noQuote: "Enter an amount to see a quote.",
  quoting: "Getting a quote…",
  btnBuy: "Buy {symbol}",
  btnSell: "Sell {symbol}",
  btnConnect: "Connect wallet",
  btnEnter: "Enter an amount",
  insufficient: "Not enough {symbol}",
  boundaryNote:
    "This buy reaches the graduation threshold. Only the amount the curve can fill is used; the rest stays in your wallet.",
  notTrading: "This curve is not trading right now.",
  readyToGraduate: "The curve is full. Anyone can now create its AMM pool.",
  btnMigrate: "Graduate to pool",
  migratedNote: "This token has graduated to an AMM pool and no longer trades on the curve.",

  stepVerify: "Checking the deployment on-chain…",
  stepWrap: "Wrapping ETH: confirm in your wallet…",
  stepApprove: "Approve the token in your wallet…",
  stepSign: "Confirm the transaction in your wallet…",
  stepConfirm: "Waiting for on-chain confirmation…",
  stepWait: "Waiting for the approval to confirm…",
  stepUnwrap: "Unwrapping WETH back to ETH…",
  tradeDone: "Trade confirmed",
  graduateDone: "Pool created",

  pfTitle: "Your holdings",
  pfBody: "Value is what you would receive today by selling the whole balance on the curve.",
  pfEmpty: "No curve tokens in this wallet yet.",
  pfLoading: "Reading your balances…",
  pfConnect: "Connect your wallet to see your holdings.",
  pfTotal: "Total value",
  colToken: "Token",
  colBalance: "Balance",
  colValue: "Value (WETH)",
  pfSell: "Sell",

  launchTitle: "Launch a token",
  launchBody:
    "Creates a token on the reviewed Ammora config and, if you want, buys the first tokens in the same transaction.",
  fName: "Token name",
  fSymbol: "Symbol",
  fUri: "Metadata URL",
  fUriHint: "A link to the token's JSON metadata. A working default is filled in so you can test fast.",
  fFirstBuy: "First buy (optional)",
  fFirstBuyHint: "WETH used to buy the first tokens in the same transaction. Leave empty to only create the token.",
  cfgLoading: "Reading the launch config…",
  cfgError: "Could not read the launch config.",
  cfgLine: "Config #{id} · supply {supply} · graduates at {threshold} WETH · creation fee {fee} ETH",
  btnLaunch: "Launch token",
  btnLaunchBuy: "Launch and buy",
  launchedTitle: "Token launched",
  launchedBody: "{name} ({symbol}) is now live on the curve.",
  openTerminal: "Open in terminal",
  invalidForm: "Enter a token name, a symbol and a metadata URL.",
  invalidBuy: "The first buy amount is not a valid number.",

  needWallet: "Connect your wallet to continue.",
  viewTx: "View transaction",
  errRejected: "Request cancelled in your wallet.",
  errGas: "Not enough ETH for the amount plus gas on GIWA Sepolia.",
  errGasHint: "Get testnet ETH from the GIWA faucet or bridge, then try again.",
  errWeth: "Not enough balance for this amount.",
  errWethHint: "Lower the amount, or turn on “Pay with ETH” to wrap automatically.",
  errChain: "Wrong network. Switch your wallet to GIWA Sepolia (chain 91342).",
  errSlippage: "The price moved more than your slippage setting.",
  errSlippageHint: "Raise slippage a little or try a smaller amount.",
  errLiquidity: "The curve cannot fill this trade right now.",
  errLiquidityHint: "Try a different amount, or check that the curve is still live.",
  errOther: "Something went wrong.",
  footer: "Built with @ammora-protocol/sdk 0.3.9 and viem · GIWA Sepolia testnet (chain 91342) · Testnet only, tokens have no real value.",
} as const;

type Key = keyof typeof en;

const vi: Record<Key, string> = {
  tagline: "Terminal giao dịch đường cong cho GIWA Sepolia",
  connect: "Kết nối ví",
  connecting: "Đang kết nối…",
  noWallet: "Cài đặt ví",
  switchNetwork: "Chuyển sang GIWA Sepolia",
  switching: "Đang chuyển mạng…",
  network: "GIWA Sepolia",
  tabTerminal: "Terminal",
  tabPortfolio: "Danh mục",
  tabLaunch: "Tạo token",
  heroTitle: "Nhìn thấy đường cong trước khi giao dịch",
  heroBody:
    "Curvelab đọc các đường cong phát hành của Ammora trực tiếp từ GIWA Sepolia, vẽ tác động giá thật từ báo giá on-chain, và cho phép mua bằng ETH chỉ với một lần bấm.",

  radarTitle: "Radar",
  radarSearch: "Tìm theo tên, ký hiệu hoặc địa chỉ",
  radarEmpty: "Không tìm thấy đường cong nào trong khoảng này.",
  radarLoading: "Đang quét GIWA Sepolia để tìm các đường cong…",
  radarError: "Không quét được blockchain.",
  radarErrorHint: "RPC công khai có thể đang bận. Hãy thử lại sau giây lát.",
  retry: "Thử lại",
  scanOlder: "Quét các dự án cũ hơn",
  scanned: "{count} đường cong · {blocks} block gần nhất",
  pickToken: "Hãy chọn một dự án trong Radar để bắt đầu.",

  statPrice: "Giá",
  statFdv: "Giá trị pha loãng hoàn toàn",
  statProgress: "Tiến độ tốt nghiệp",
  statRaised: "Đã huy động",
  statStatus: "Trạng thái",
  status0: "Chưa bắt đầu",
  status1: "Đang mở bán",
  status2: "Sẵn sàng tốt nghiệp",
  status3: "Đã tốt nghiệp",
  tokenAddr: "Token",
  curveAddr: "Đường cong",

  chartTitle: "Độ sâu: mỗi mức mua tốn bao nhiêu",
  chartBody: "Giá trung bình bạn sẽ trả, lấy từ báo giá on-chain trực tiếp. Rê chuột lên biểu đồ để đọc từng điểm.",
  chartLoading: "Đang báo giá các mức mua…",
  chartEmpty: "Hiện chưa mua được đường cong này.",
  chartSpend: "Chi",
  chartGet: "Nhận",
  chartAvg: "Giá TB",
  chartImpact: "Tác động",

  buy: "Mua",
  sell: "Bán",
  youPay: "Bạn trả",
  youReceive: "Bạn nhận (ước tính)",
  minReceive: "Tối thiểu nhận được",
  slippage: "Trượt giá",
  curveFee: "Phí đường cong",
  priceImpact: "Lệch so với giá gốc",
  balance: "Số dư",
  max: "Tối đa",
  payWithEth: "Trả bằng ETH (tự wrap)",
  payWithEthHint: "Tự wrap phần ETH còn thiếu thành WETH trước, rồi mới mua.",
  receiveEth: "Nhận ETH (tự unwrap)",
  receiveEthHint: "Tự unwrap số WETH nhận về thành ETH.",
  noQuote: "Nhập số lượng để xem báo giá.",
  quoting: "Đang báo giá…",
  btnBuy: "Mua {symbol}",
  btnSell: "Bán {symbol}",
  btnConnect: "Kết nối ví",
  btnEnter: "Nhập số lượng",
  insufficient: "Không đủ {symbol}",
  boundaryNote:
    "Lệnh mua này chạm ngưỡng tốt nghiệp. Chỉ phần mà đường cong khớp được mới bị dùng; phần còn lại vẫn ở trong ví của bạn.",
  notTrading: "Đường cong này hiện không giao dịch.",
  readyToGraduate: "Đường cong đã đầy. Bây giờ bất kỳ ai cũng có thể tạo pool AMM cho token này.",
  btnMigrate: "Tốt nghiệp sang pool",
  migratedNote: "Token này đã tốt nghiệp sang pool AMM và không còn giao dịch trên đường cong.",

  stepVerify: "Đang kiểm tra hợp đồng on-chain…",
  stepWrap: "Đang wrap ETH: hãy xác nhận trong ví…",
  stepApprove: "Hãy phê duyệt token trong ví…",
  stepSign: "Hãy xác nhận giao dịch trong ví…",
  stepConfirm: "Đang chờ giao dịch được xác nhận…",
  stepWait: "Đang chờ lệnh phê duyệt được xác nhận…",
  stepUnwrap: "Đang unwrap WETH về ETH…",
  tradeDone: "Giao dịch đã xác nhận",
  graduateDone: "Đã tạo pool",

  pfTitle: "Tài sản của bạn",
  pfBody: "Giá trị là số tiền bạn nhận được hôm nay nếu bán toàn bộ số dư trên đường cong.",
  pfEmpty: "Ví này chưa có token đường cong nào.",
  pfLoading: "Đang đọc số dư của bạn…",
  pfConnect: "Hãy kết nối ví để xem tài sản của bạn.",
  pfTotal: "Tổng giá trị",
  colToken: "Token",
  colBalance: "Số dư",
  colValue: "Giá trị (WETH)",
  pfSell: "Bán",

  launchTitle: "Tạo token mới",
  launchBody:
    "Tạo token trên cấu hình Ammora đã được review và, nếu muốn, mua luôn những token đầu tiên trong cùng một giao dịch.",
  fName: "Tên token",
  fSymbol: "Ký hiệu",
  fUri: "URL metadata",
  fUriHint: "Liên kết tới file JSON metadata của token. Đã điền sẵn giá trị hợp lệ để bạn thử nhanh.",
  fFirstBuy: "Mua đầu tiên (tùy chọn)",
  fFirstBuyHint: "Số WETH dùng để mua những token đầu tiên ngay trong giao dịch tạo token. Để trống nếu chỉ muốn tạo token.",
  cfgLoading: "Đang đọc cấu hình phát hành…",
  cfgError: "Không đọc được cấu hình phát hành.",
  cfgLine: "Cấu hình #{id} · tổng cung {supply} · tốt nghiệp ở {threshold} WETH · phí tạo {fee} ETH",
  btnLaunch: "Tạo token",
  btnLaunchBuy: "Tạo token và mua",
  launchedTitle: "Đã tạo token",
  launchedBody: "{name} ({symbol}) đã lên đường cong và sẵn sàng giao dịch.",
  openTerminal: "Mở trong terminal",
  invalidForm: "Hãy nhập tên token, ký hiệu và URL metadata.",
  invalidBuy: "Số lượng mua đầu tiên không hợp lệ.",

  needWallet: "Hãy kết nối ví để tiếp tục.",
  viewTx: "Xem giao dịch",
  errRejected: "Bạn đã hủy yêu cầu trong ví.",
  errGas: "Không đủ ETH cho số lượng cộng phí gas trên GIWA Sepolia.",
  errGasHint: "Hãy lấy ETH testnet từ faucet/bridge của GIWA rồi thử lại.",
  errWeth: "Số dư không đủ cho số lượng này.",
  errWethHint: "Hãy giảm số lượng, hoặc bật “Trả bằng ETH” để tự wrap.",
  errChain: "Sai mạng. Hãy chuyển ví sang GIWA Sepolia (chain 91342).",
  errSlippage: "Giá đã biến động vượt mức trượt giá bạn đặt.",
  errSlippageHint: "Hãy tăng trượt giá một chút hoặc giảm số lượng.",
  errLiquidity: "Đường cong hiện không khớp được lệnh này.",
  errLiquidityHint: "Hãy thử số lượng khác, hoặc kiểm tra xem đường cong còn mở không.",
  errOther: "Đã xảy ra lỗi.",
  footer: "Xây dựng bằng @ammora-protocol/sdk 0.3.9 và viem · GIWA Sepolia testnet (chain 91342) · Chỉ dùng testnet, token không có giá trị thật.",
};

type Lang = "en" | "vi";
const dictionaries: Record<Lang, Record<Key, string>> = { en, vi };

type I18n = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: Key, params?: Record<string, string | number>) => string;
  /** Turns any thrown error into a short message plus an optional hint in the current language. */
  explain: (error: unknown) => { message: string; hint?: string; detail?: string };
};

const I18nContext = createContext<I18n | null>(null);

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // Restore a saved choice, otherwise follow the browser language.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("curvelab-lang");
      if (saved === "en" || saved === "vi") {
        setLangState(saved);
        return;
      }
    } catch {
      /* storage can be blocked; fall back to the browser language below */
    }
    if (navigator.language?.toLowerCase().startsWith("vi")) setLangState("vi");
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem("curvelab-lang", next);
    } catch {
      /* non-fatal */
    }
  }, []);

  const t = useCallback<I18n["t"]>(
    (key, params) => {
      let text = dictionaries[lang][key];
      if (params) for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
      return text;
    },
    [lang],
  );

  const explain = useCallback<I18n["explain"]>(
    (error) => {
      const code = (error as { code?: unknown })?.code;
      if (code === "gas") return { message: t("errGas"), hint: t("errGasHint") };
      if (code === "weth") return { message: t("errWeth"), hint: t("errWethHint") };
      if (code === "chain") return { message: t("errChain") };
      const { kind, detail } = classifyError(error);
      switch (kind) {
        case "rejected":
          return { message: t("errRejected") };
        case "gas":
          return { message: t("errGas"), hint: t("errGasHint") };
        case "wrongChain":
          return { message: t("errChain") };
        case "slippage":
          return { message: t("errSlippage"), hint: t("errSlippageHint"), detail };
        case "liquidity":
          return { message: t("errLiquidity"), hint: t("errLiquidityHint"), detail };
        default:
          return { message: t("errOther"), detail };
      }
    },
    [t],
  );

  const value = useMemo(() => ({ lang, setLang, t, explain }), [lang, setLang, t, explain]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
