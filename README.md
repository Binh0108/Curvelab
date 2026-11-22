# Curvelab — bonding-curve terminal on GIWA Sepolia

Next.js (App Router) + TypeScript + Tailwind CSS + `@ammora-protocol/sdk@0.3.9` + `viem`.
Chain: GIWA Sepolia (91342) · RPC `https://sepolia-rpc.giwa.io` · Explorer `https://sepolia-explorer.giwa.io`

| English | Tiếng Việt |
| --- | --- |
| **Radar**: `discoverAmmoraPools` finds every Ammora launch curve from factory logs (no indexer needed) and the SDK reads each curve's graduation progress | **Radar**: `discoverAmmoraPools` tìm mọi đường cong phát hành Ammora từ log của factory (không cần indexer), SDK đọc tiến độ tốt nghiệp của từng đường cong |
| **Depth chart**: `AmmoraV4LaunchCurveClient.quoteExactInput` is called for eight buy sizes and plotted as the average price you would pay (price impact), with a hover readout | **Biểu đồ độ sâu**: gọi `AmmoraV4LaunchCurveClient.quoteExactInput` cho tám mức mua và vẽ thành giá trung bình bạn sẽ trả (tác động giá), có đọc số khi rê chuột |
| **Ticket**: buy with plain ETH (auto-wrap to WETH), sell and receive ETH (auto-unwrap), exact approvals, slippage, graduation via `planMigrateAtBlock` | **Ticket**: mua bằng ETH thường (tự wrap sang WETH), bán và nhận ETH (tự unwrap), approve đúng số lượng, trượt giá, tốt nghiệp qua `planMigrateAtBlock` |
| **Portfolio**: balances of all discovered tokens, valued by a live sell quote of the whole balance | **Danh mục**: số dư của mọi token tìm được, định giá bằng báo giá bán toàn bộ số dư theo thời gian thực |
| **Launch**: `buildCreateAmmoraV4Launch`, or token + first buy in one transaction via `planExistingConfigAtomicFirstBuy` (ETH for the first buy is wrapped automatically) | **Tạo token**: `buildCreateAmmoraV4Launch`, hoặc tạo token + mua đầu trong một giao dịch qua `planExistingConfigAtomicFirstBuy` (ETH cho lệnh mua đầu được wrap tự động) |
| **Run locally**: `npm install`, then `npm run dev`, open http://localhost:3000 | **Chạy local**: `npm install`, sau đó `npm run dev`, mở http://localhost:3000 |
| **Check the build**: `npm run lint` and `npm run build` | **Kiểm tra build**: `npm run lint` và `npm run build` |
| **Deploy**: push to GitHub, import the repo on vercel.com, keep the default Next.js settings, Deploy. No environment variables needed | **Deploy**: đẩy lên GitHub, import repo trên vercel.com, giữ cài đặt Next.js mặc định, bấm Deploy. Không cần biến môi trường |
