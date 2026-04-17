"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { MarketSummary } from "@rush/shared";
import { cardVariants } from "@/lib/animations";
import { formatEth } from "@/lib/format";
import { Clock, Zap, TrendingUp } from "lucide-react";

interface MarketFeedCardProps {
  market: MarketSummary;
  index: number;
}

const HOT_THRESHOLD = BigInt("50000000000000000"); // 0.05 ETH

function getEmoji(q: string): string {
  const lower = q.toLowerCase();
  if (lower.includes("bitcoin") || lower.includes("btc")) return "₿";
  if (lower.includes("ethereum") || lower.includes("eth")) return "⟠";
  if (lower.includes("solana") || lower.includes("sol")) return "◎";
  if (lower.includes("base")) return "🔵";
  if (lower.includes("tweet") || lower.includes("twitter") || lower.includes("@")) return "🐦";
  if (lower.includes("price") || lower.includes("hit") || lower.includes("reach")) return "📈";
  if (lower.includes("election") || lower.includes("president") || lower.includes("vote")) return "🗳️";
  return "🔮";
}

export default function MarketFeedCard({ market, index }: MarketFeedCardProps) {
  const router = useRouter();

  const isBinary = market.outcomeCount === 2;
  const yesOdds = Math.round(market.odds[0] ?? 50);
  const noOdds = Math.round(market.odds[1] ?? 50);
  const yesLabel = market.labels[0] ?? "Yes";
  const noLabel = market.labels[1] ?? "No";

  const isOpen = market.status === "open";
  const now = Math.floor(Date.now() / 1000);
  const remaining = market.deadline - now;

  const isHot = useMemo(() => {
    try { return BigInt(market.totalPool) >= HOT_THRESHOLD; } catch { return false; }
  }, [market.totalPool]);
  const isEnding = remaining > 0 && remaining < 3600 && isOpen;

  const deadlineText = useMemo(() => {
    if (remaining <= 0) return "Ended";
    if (remaining < 3600) return `${Math.floor(remaining / 60)}m left`;
    if (remaining < 86400) return `${Math.floor(remaining / 3600)}h left`;
    return `${Math.floor(remaining / 86400)}d left`;
  }, [remaining]);

  const emoji = useMemo(() => getEmoji(market.question), [market.question]);

  return (
    <motion.div
      variants={cardVariants}
      custom={index}
      whileHover={{ y: -2 }}
      className="rounded-xl p-4 sm:p-5 cursor-pointer transition-colors"
      style={{
        background: "var(--surface)",
        border: `1px solid ${isEnding ? "rgba(249,115,22,0.2)" : isHot ? "rgba(0,255,136,0.1)" : "var(--border)"}`,
      }}
      onClick={() => router.push(`/markets/${market.address}`)}
    >
      {/* Top: question + badges */}
      <div className="flex items-start gap-2.5 mb-3">
        <span className="text-lg shrink-0 mt-0.5">{emoji}</span>
        <h3 className="flex-1 text-sm sm:text-base font-semibold text-gray-100 leading-snug line-clamp-2">
          {market.question}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {isOpen && (
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
              style={{ background: "rgba(0,255,136,0.1)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.2)" }}
            >
              <span className="live-dot-green" style={{ width: 4, height: 4 }} />
              Live
            </span>
          )}
          {isHot && (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
              style={{ background: "rgba(255,200,40,0.1)", color: "#ffc828", border: "1px solid rgba(255,200,40,0.2)" }}
            >
              Hot
            </span>
          )}
          {isEnding && <span className="badge-ending">Ending</span>}
          {market.status === "resolved" && (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
              style={{ background: "rgba(80,120,255,0.1)", color: "#5078ff", border: "1px solid rgba(80,120,255,0.2)" }}
            >
              Resolved
            </span>
          )}
        </div>
      </div>

      {/* Middle: odds + meta */}
      {isBinary ? (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-black tabular" style={{ color: "#00ff88" }}>
              {yesLabel} {yesOdds}%
            </span>
            <span className="text-xs text-gray-600">vs</span>
            <span className="text-lg font-black tabular" style={{ color: "#EF4444" }}>
              {noLabel} {noOdds}%
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {formatEth(market.totalPool)}
            </span>
            <span className="flex items-center gap-1" style={isEnding ? { color: "#F97316" } : {}}>
              <Clock className="h-3 w-3" />
              {deadlineText}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-3 text-xs text-gray-400 flex-wrap">
          {market.labels.slice(0, 3).map((l, i) => (
            <span key={i} className="font-bold tabular" style={{ color: i === 0 ? "#00ff88" : i === 1 ? "#EF4444" : "#ffc828" }}>
              {l} {Math.round(market.odds[i] ?? 0)}%
            </span>
          ))}
          {market.outcomeCount > 3 && <span className="text-gray-600">+{market.outcomeCount - 3}</span>}
          <span className="ml-auto text-[10px] text-gray-500">{formatEth(market.totalPool)} · {deadlineText}</span>
        </div>
      )}

      {/* Progress bar */}
      {isBinary && (
        <div className="h-1 rounded-full overflow-hidden mb-3 flex" style={{ background: "rgba(255,255,255,0.04)" }}>
          <div className="h-full" style={{ width: `${yesOdds}%`, background: "rgba(0,255,136,0.4)" }} />
          <div className="h-full" style={{ width: `${noOdds}%`, background: "rgba(239,68,68,0.4)" }} />
        </div>
      )}

      {/* YES/NO buttons */}
      {isOpen && isBinary && (
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/markets/${market.address}?outcome=0`); }}
            className="btn-feed-yes flex-1 flex items-center justify-center gap-1.5 rounded-lg min-h-[44px] text-sm cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5" />
            Yes {yesOdds}%
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/markets/${market.address}?outcome=1`); }}
            className="btn-feed-no flex-1 flex items-center justify-center gap-1.5 rounded-lg min-h-[44px] text-sm cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5" />
            No {noOdds}%
          </button>
        </div>
      )}
    </motion.div>
  );
}
