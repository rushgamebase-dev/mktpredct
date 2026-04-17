"use client";

import { useState, useCallback } from "react";
import { Share2, Check, Copy } from "lucide-react";
import type { MarketSummary } from "@rush/shared";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://markets.rushgame.vip";

interface ShareButtonProps {
  market: MarketSummary;
  variant?: "icon" | "full";
  className?: string;
}

function buildShareText(market: MarketSummary): string {
  const yesLabel = market.labels[0] ?? "Yes";
  const noLabel = market.labels[1] ?? "No";
  const yesOdds = Math.round(market.odds[0] ?? 50);
  const noOdds = Math.round(market.odds[1] ?? 50);

  const lines = [
    market.question,
    "",
    `${yesLabel} ${yesOdds}% vs ${noLabel} ${noOdds}%`,
    "",
    "Take a side 👇",
  ];

  return lines.join("\n");
}

function buildMarketUrl(market: MarketSummary): string {
  return `${SITE_URL}/markets/${market.address}`;
}

export default function ShareButton({ market, variant = "icon", className = "" }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const shareOnX = useCallback(() => {
    const text = buildShareText(market);
    const url = buildMarketUrl(market);
    const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(tweetUrl, "_blank", "noopener,noreferrer,width=550,height=420");
  }, [market]);

  const copyLink = useCallback(async () => {
    const url = buildMarketUrl(market);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [market]);

  if (variant === "full") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); shareOnX(); }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all hover:scale-105"
          style={{
            background: "rgba(29,155,240,0.1)",
            border: "1px solid rgba(29,155,240,0.25)",
            color: "#1DA1F2",
          }}
        >
          <Share2 className="h-3.5 w-3.5" />
          Share on X
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyLink(); }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all hover:bg-white/5"
          style={{ color: copied ? "#00ff88" : "#666" }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); shareOnX(); }}
      className={`flex items-center justify-center rounded-lg p-2 text-gray-500 transition-colors hover:text-[#1DA1F2] hover:bg-[rgba(29,155,240,0.08)] ${className}`}
      title="Share on X"
    >
      <Share2 className="h-4 w-4" />
    </button>
  );
}
