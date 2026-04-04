"use client";

import React from "react";
import { useRouter } from "next/navigation";
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

function getDeadlineInfo(deadline: number): { text: string; color: string; urgent: boolean } {
  const now = Math.floor(Date.now() / 1000);
  const diff = deadline - now;
  if (diff <= 0) return { text: "Ended", color: "#666", urgent: false };
  if (diff < 3600) return { text: `${Math.floor(diff / 60)}m left`, color: "#EF4444", urgent: true };
  if (diff < 21600) return { text: `${Math.floor(diff / 3600)}h left`, color: "#F97316", urgent: true };
  if (diff < 86400) return { text: `${Math.floor(diff / 3600)}h left`, color: "#ffc828", urgent: false };
  return { text: `${Math.floor(diff / 86400)}d left`, color: "#666", urgent: false };
}

function getSocialProof(market: MarketSummary): string | null {
  const pool = BigInt(market.totalPool);
  if (pool === 0n) return null;

  const primary = market.odds[0] ?? 50;
  const label = market.labels[0] ?? "Yes";

  if (primary > 65) return `Most betting ${label}`;
  if (primary < 35) return `Heavy action on ${market.labels[1] ?? "No"}`;

  const poolEth = Number(pool) / 1e18;
  if (poolEth >= 0.01) return `${formatEth(market.totalPool)} at stake`;

  return null;
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
  const router = useRouter();
  const emoji = React.useMemo(() => extractEmoji(market.question), [market.question]);
  const isOpen = market.status === "open";
  const isResolved = market.status === "resolved";
  const deadline = getDeadlineInfo(market.deadline);
  const socialProof = getSocialProof(market);

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
      <div
        className="rounded-xl p-4 transition-all duration-150 market-card-glow cursor-pointer"
        style={{
          background: "var(--surface, #111)",
          border: "1px solid var(--border, rgba(255,255,255,0.08))",
        }}
        onClick={() => router.push(`/markets/${market.address}`)}
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
              {/* Yes / No buttons — bigger, punchier */}
              <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => router.push(`/markets/${market.address}?outcome=${i}`)}
                  className="px-3 py-1.5 rounded text-[11px] font-bold transition-all hover:scale-110 active:scale-95"
                  style={{
                    background: "rgba(16,185,129,0.15)",
                    color: "#10B981",
                    border: "1px solid rgba(16,185,129,0.3)",
                    boxShadow: "0 0 8px rgba(16,185,129,0.1)",
                  }}
                >
                  Yes ↑
                </button>
                <button
                  onClick={() => {
                    const noIdx = i === 0 && market.labels.length > 1 ? 1 : 0;
                    router.push(`/markets/${market.address}?outcome=${noIdx}`);
                  }}
                  className="px-3 py-1.5 rounded text-[11px] font-bold transition-all hover:scale-110 active:scale-95"
                  style={{
                    background: "rgba(239,68,68,0.15)",
                    color: "#EF4444",
                    border: "1px solid rgba(239,68,68,0.3)",
                    boxShadow: "0 0 8px rgba(239,68,68,0.1)",
                  }}
                >
                  No ↓
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

        {/* Social proof line */}
        {socialProof && (
          <div className="mb-2 text-[10px] font-bold" style={{ color: "#ffc828" }}>
            {socialProof}
          </div>
        )}

        {/* Row 3: Footer with urgency */}
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span className="font-bold text-gray-400">{formatEth(market.totalPool)} Vol</span>
          <span className="opacity-30">·</span>
          <span>{market.outcomeCount} outcomes</span>
          <span className="opacity-30">·</span>
          <span
            className={deadline.urgent ? "font-bold animate-pulse" : ""}
            style={{ color: deadline.color }}
          >
            {deadline.urgent && "⚡ "}{deadline.text}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
