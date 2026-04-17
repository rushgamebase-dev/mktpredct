import type { Metadata } from "next";

// Server-side metadata generation — safe to use production URLs directly.
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  "https://rush-api-production.up.railway.app";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://markets.rushgame.vip";

interface MarketMeta {
  question: string;
  labels: string[];
  odds: number[];
  deadline: number;
  totalPool: string;
  status: string;
  proposerAddress?: string | null;
}

function formatPool(weiStr: string): string {
  const wei = BigInt(weiStr);
  if (wei === 0n) return "";
  const eth = Number(wei) / 1e18;
  if (eth >= 1) return `${eth.toFixed(2)} ETH`;
  if (eth >= 0.01) return `${eth.toFixed(3)} ETH`;
  return "";
}

function formatDeadline(ts: number): string {
  const diff = ts - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "Ended";
  if (diff < 3600) return `${Math.floor(diff / 60)}m left`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h left`;
  return `${Math.floor(diff / 86400)}d left`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;

  let market: MarketMeta | null = null;
  try {
    const res = await fetch(`${API_URL}/api/markets/${address}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) market = await res.json();
  } catch {}

  if (!market) {
    return { title: "Market Not Found | Rush Markets" };
  }

  const yesLabel = market.labels[0] ?? "Yes";
  const noLabel = market.labels[1] ?? "No";
  const yesOdds = Math.round(market.odds[0] ?? 50);
  const noOdds = Math.round(market.odds[1] ?? 50);
  const pool = formatPool(market.totalPool);
  const timer = formatDeadline(market.deadline);

  const title = `${market.question} | Rush Markets`;
  const description = `${yesLabel} ${yesOdds}% vs ${noLabel} ${noOdds}%${pool ? ` · ${pool} pool` : ""}${timer !== "Ended" ? ` · ${timer}` : ""} — Bet now on Rush`;
  const ogImageUrl = `${SITE_URL}/api/og/${address}`;
  const marketUrl = `${SITE_URL}/markets/${address}`;

  return {
    title,
    description,
    openGraph: {
      title: market.question,
      description,
      url: marketUrl,
      siteName: "Rush Markets",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: market.question }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: market.question,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return children;
}
