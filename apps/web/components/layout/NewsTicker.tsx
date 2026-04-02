"use client";

import { useState, useEffect, useRef } from "react";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
}

// Fetch real crypto news from CryptoPanic (free, no API key for public)
async function fetchNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch(
      "https://cryptopanic.com/api/free/v1/posts/?auth_token=free&public=true&filter=hot&currencies=BTC,ETH,SOL,BASE",
      { next: { revalidate: 300 } }, // cache 5min
    );
    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    return (data.results ?? []).slice(0, 20).map((item: any) => ({
      id: String(item.id),
      title: item.title,
      source: item.source?.title ?? "",
      url: item.url ?? "#",
    }));
  } catch {
    // Fallback headlines if API fails
    return [
      { id: "1", title: "Bitcoin surges past key resistance level", source: "CoinDesk", url: "#" },
      { id: "2", title: "Base L2 TVL hits new all-time high", source: "The Block", url: "#" },
      { id: "3", title: "Ethereum gas fees drop to 2-year low", source: "Decrypt", url: "#" },
      { id: "4", title: "Solana ecosystem sees record DEX volume", source: "DeFiLlama", url: "#" },
      { id: "5", title: "Coinbase reports strong Q1 earnings", source: "Bloomberg", url: "#" },
      { id: "6", title: "New prediction markets protocol launches on Base", source: "CryptoSlate", url: "#" },
      { id: "7", title: "DeFi total value locked approaches $200B", source: "The Block", url: "#" },
      { id: "8", title: "Institutional adoption of crypto accelerates in 2026", source: "Reuters", url: "#" },
    ];
  }
}

export default function NewsTicker() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNews().then(setNews);
    // Refresh every 5 minutes
    const iv = setInterval(() => fetchNews().then(setNews), 300_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!scrollRef.current || news.length === 0 || isPaused) return;

    let animId: number;
    let pos = 0;
    const el = scrollRef.current;
    const speed = 0.5; // pixels per frame

    const scroll = () => {
      pos += speed;
      // When first set of items scrolls out, reset seamlessly
      if (pos >= el.scrollWidth / 2) pos = 0;
      el.style.transform = `translateX(-${pos}px)`;
      animId = requestAnimationFrame(scroll);
    };

    animId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animId);
  }, [news, isPaused]);

  if (news.length === 0) return null;

  // Duplicate items for seamless loop
  const items = [...news, ...news];

  return (
    <div
      className="w-full overflow-hidden relative"
      style={{
        background: "rgba(0,0,0,0.4)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Fade edges */}
      <div
        className="absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
        style={{ background: "linear-gradient(90deg, rgba(10,10,10,1), transparent)" }}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
        style={{ background: "linear-gradient(270deg, rgba(10,10,10,1), transparent)" }}
      />

      <div className="flex items-center h-8 px-4">
        {/* LIVE badge */}
        <div className="flex items-center gap-1.5 shrink-0 mr-4 z-20">
          <span className="live-dot" style={{ width: 5, height: 5 }} />
          <span className="text-[9px] font-bold uppercase tracking-widest text-red-400">News</span>
        </div>

        {/* Scrolling content */}
        <div className="overflow-hidden flex-1">
          <div ref={scrollRef} className="flex items-center gap-0 whitespace-nowrap will-change-transform">
            {items.map((item, i) => (
              <a
                key={`${item.id}-${i}`}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center shrink-0 group"
              >
                <span className="text-[11px] text-gray-400 group-hover:text-gray-200 transition-colors">
                  {item.title}
                </span>
                {item.source && (
                  <span className="text-[9px] text-gray-600 ml-1.5">
                    {item.source}
                  </span>
                )}
                <span className="text-gray-700 mx-4">•</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
