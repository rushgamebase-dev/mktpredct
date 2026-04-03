"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { MarketSummary } from "@rush/shared";
import { OUTCOME_COLORS } from "@rush/shared";
import { formatEth } from "@/lib/format";

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function extractEmoji(text: string): string {
  const emojiRegex = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/u;
  const match = text.match(emojiRegex);
  if (match) return match[0];

  const t = text.toLowerCase();
  if (/bitcoin|btc/.test(t)) return "₿";
  if (/ethereum|eth/.test(t)) return "⟠";
  if (/base/.test(t) && /solana/.test(t)) return "🏁";
  if (/base/.test(t)) return "🔵";
  if (/solana|sol/.test(t)) return "☀️";
  if (/tweet|aixbt|twitter/.test(t)) return "🐦";
  if (/coinbase/.test(t)) return "🏦";
  if (/dex|volume/.test(t)) return "📊";
  if (/wallet/.test(t)) return "👛";
  if (/gas|gwei/.test(t)) return "⛽";
  if (/tvl/.test(t)) return "💰";
  if (/token|market cap/.test(t)) return "🎯";
  if (/election|president|vote/.test(t)) return "🗳️";
  if (/volatility/.test(t)) return "⚡";
  if (/price|reach|\$/.test(t)) return "📈";
  if (/transaction/.test(t)) return "🔄";
  return "📊";
}

function formatRelativeDeadline(deadline: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = deadline - now;
  if (diff <= 0) return "Ended";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ------------------------------------------------------------
// Animation variants
// ------------------------------------------------------------

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.35,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
};

// ------------------------------------------------------------
// MarketCard — Polymarket style
// ------------------------------------------------------------

interface MarketCardProps {
  market: MarketSummary;
  index: number;
}

export default function MarketCard({ market, index }: MarketCardProps) {
  const emoji = React.useMemo(() => extractEmoji(market.question), [market.question]);
  const isOpen = market.status === "open";
  const isResolved = market.status === "resolved";

  // Show top 3 outcomes max
  const visibleOutcomes = market.labels.slice(0, 3).map((label, i) => ({
    label,
    odds: Math.round(market.odds[i] ?? 0),
    color: OUTCOME_COLORS[i % OUTCOME_COLORS.length],
  }));

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={index}
      whileHover={{ y: -2 }}
      className="group"
    >
      <Link
        href={`/markets/${market.address}`}
        className="block outline-none focus-visible:ring-2 focus-visible:ring-[#00ff88]"
      >
        <div
          className="rounded-xl p-4 transition-all duration-150 market-card-glow"
          style={{
            background: "var(--surface, #111)",
            border: "1px solid var(--border, rgba(255,255,255,0.08))",
          }}
        >
          {/* Row 1: Emoji + Title + Badge */}
          <div className="flex items-start gap-2.5 mb-3">
            <span className="text-xl shrink-0 mt-0.5">{emoji}</span>
            <h3 className="text-sm font-semibold leading-snug text-gray-100 line-clamp-2 flex-1">
              {market.question}
            </h3>
            {isOpen && (
              <span className="flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
                style={{ background: "rgba(0,255,136,0.1)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.2)" }}>
                <span className="live-dot-green" style={{ width: 4, height: 4 }} />
                Live
              </span>
            )}
            {isResolved && (
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
                style={{ background: "rgba(80,120,255,0.1)", color: "#5078ff", border: "1px solid rgba(80,120,255,0.2)" }}>
                Resolved
              </span>
            )}
          </div>

          {/* Row 2: Outcome rows with Yes/No buttons */}
          <div className="space-y-1.5 mb-3">
            {visibleOutcomes.map((outcome, i) => (
              <div key={i} className="flex items-center gap-2">
                {/* Outcome name + odds */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span
                    className="inline-block h-2 w-2 rounded-full shrink-0"
                    style={{ background: outcome.color }}
                  />
                  <span className="text-xs text-gray-400 truncate">{outcome.label}</span>
                </div>
                <span className="text-xs font-bold tabular text-gray-200 shrink-0 w-10 text-right">
                  {outcome.odds}%
                </span>
                {/* Yes / No buttons */}
                <div className="flex gap-1 shrink-0" onClick={(e) => e.preventDefault()}>
                  <button
                    className="px-2 py-0.5 rounded text-[10px] font-bold transition-all hover:scale-110"
                    style={{
                      background: "rgba(16,185,129,0.1)",
                      color: "#10B981",
                      border: "1px solid rgba(16,185,129,0.25)",
                    }}
                  >
                    Yes
                  </button>
                  <button
                    className="px-2 py-0.5 rounded text-[10px] font-bold transition-all hover:scale-110"
                    style={{
                      background: "rgba(239,68,68,0.1)",
                      color: "#EF4444",
                      border: "1px solid rgba(239,68,68,0.25)",
                    }}
                  >
                    No
                  </button>
                </div>
              </div>
            ))}
            {market.labels.length > 3 && (
              <div className="text-[10px] text-gray-600 pl-5">
                +{market.labels.length - 3} more outcomes
              </div>
            )}
          </div>

          {/* Row 3: Footer */}
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span className="font-bold text-gray-400">{formatEth(market.totalPool)} Vol</span>
            <span className="opacity-30">·</span>
            <span>{market.outcomeCount} outcomes</span>
            <span className="opacity-30">·</span>
            <span>{formatRelativeDeadline(market.deadline)}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
