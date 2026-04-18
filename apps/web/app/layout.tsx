import "./globals.css";
import Providers from "./providers";
import Header from "@/components/layout/Header";
import NewsTicker from "@/components/layout/NewsTicker";

export const metadata = {
  title: "Rush Markets — Prediction Markets on Base",
  description: "On-chain prediction markets on Base. Bet on the future with real ETH.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://markets.rushgame.vip"),
  openGraph: {
    title: "Rush Markets — Prediction Markets on Base",
    description: "Bet on the future with real ETH. Propose markets & earn 4% of the pool.",
    siteName: "Rush Markets",
    type: "website",
  },
  twitter: {
    card: "summary_large_image" as const,
    title: "Rush Markets — Prediction Markets on Base",
    description: "Bet on the future with real ETH. Propose markets & earn 4% of the pool.",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          <Header />
          <NewsTicker />
          <main className="mx-auto max-w-7xl px-4 py-3 sm:py-6">
            {children}
          </main>
          <footer className="mx-auto max-w-7xl px-4 py-6 mt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] text-gray-600">
              <div className="flex items-center gap-3">
                <a href="/terms" className="hover:text-gray-400 transition-colors">Terms of Service</a>
                <span>·</span>
                <a href="/proposals" className="hover:text-gray-400 transition-colors">Proposals</a>
                <span>·</span>
                <a href="/propose" className="hover:text-gray-400 transition-colors">Propose a Market</a>
                <span>·</span>
                <a href="/agents/dashboard" className="hover:text-gray-400 transition-colors">Agent Dashboard</a>
              </div>
              <p>Prediction markets are speculative. You may lose 100% of your bet. 18+</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
