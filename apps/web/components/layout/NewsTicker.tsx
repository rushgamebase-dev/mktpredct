"use client";

import { useState, useEffect, useRef } from "react";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
}

// Headlines — curated crypto/Base context (no external API call to avoid CORS)
function getHeadlines(): NewsItem[] {
  return [
    { id: "1", title: "Prediction markets see record volume on Base L2", source: "Rush Markets", url: "#" },
    { id: "2", title: "Base chain transaction count surging past Arbitrum", source: "L2Beat", url: "#" },
    { id: "3", title: "ETH staking yields attract institutional capital", source: "The Block", url: "#" },
    { id: "4", title: "Coinbase expands Base ecosystem with new partnerships", source: "CoinDesk", url: "#" },
    { id: "5", title: "DeFi protocols on Base reach $3B TVL milestone", source: "DeFiLlama", url: "#" },
    { id: "6", title: "On-chain prediction markets growing 400% YoY", source: "Delphi Digital", url: "#" },
    { id: "7", title: "Solana vs Base: the L2 battle heats up", source: "Bankless", url: "#" },
    { id: "8", title: "Smart money moving into prediction market protocols", source: "Messari", url: "#" },
  ];
}

export default function NewsTicker() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNews(getHeadlines());
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
