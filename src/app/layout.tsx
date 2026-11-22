import type { Metadata, Viewport } from "next";
import "@fontsource-variable/instrument-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Curvelab — bonding-curve terminal on GIWA Sepolia",
  description:
    "A trading terminal for Ammora launch curves on GIWA Sepolia: live depth chart from on-chain quotes, one-click buys with ETH, portfolio and token launches. Built with @ammora-protocol/sdk 0.3.9 and viem.",
};

export const viewport: Viewport = {
  themeColor: "#0f1216",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
