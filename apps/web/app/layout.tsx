import "./globals.css";
import Providers from "./providers";
import Header from "@/components/layout/Header";
import NewsTicker from "@/components/layout/NewsTicker";

export const metadata = {
  title: "Rush Markets -- Prediction Markets on Base",
  description: "On-chain prediction markets on Base. Bet on the future.",
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
        </Providers>
      </body>
    </html>
  );
}
