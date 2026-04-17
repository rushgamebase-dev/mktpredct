"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { MarketSummary, WsGlobalMessage } from "@rush/shared";
import { formatEth, timeAgo } from "@/lib/format";
import { heroEntrance } from "@/lib/animations";
import { Clock, TrendingUp, Zap, ArrowRight } from "lucide-react";

interface HeroMarketProps {
  market: MarketSummary;
  lastWsBet: WsGlobalMessage | null;
}

export default function HeroMarket({ market, lastWsBet }: HeroMarketProps) {
  const router = useRouter();

  const isBinary = market.outcomeCount === 2;
  const yesIdx = 0;
  const noIdx = 1;
  const yesOdds = Math.round(market.odds[yesIdx] ?? 50);
  const noOdds = Math.round(market.odds[noIdx] ?? 50);
  const yesLabel = market.labels[yesIdx] ?? "Yes";
  const noLabel = market.labels[noIdx] ?? "No";

  const deadline = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const diff = market.deadline - now;
    if (diff <= 0) return { text: "Ended", urgent: true };
    if (diff < 3600) return { text: `${Math.floor(diff / 60)}m left`, urgent: true };
    if (diff < 21600) return { text: `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m left`, urgent: true };
    if (diff < 86400) return { text: `${Math.floor(diff / 3600)}h left`, urgent: false };
    return { text: `${Math.floor(diff / 86400)}d left`, urgent: false };
  }, [market.deadline]);

  const lastBet = useMemo(() => {
    if (!lastWsBet || lastWsBet.type !== "bet") return null;
    if (lastWsBet.marketAddress !== market.address) return null;
    const d = lastWsBet.data as { amount: string; outcomeIndex: number; timestamp: number };
    const label = market.labels[d.outcomeIndex] ?? `#${d.outcomeIndex}`;
    return { amount: formatEth(d.amount), label, time: timeAgo(d.timestamp) };
  }, [lastWsBet, market]);

  const navigate = (outcomeIdx: number) => {
    router.push(`/markets/${market.address}?outcome=${outcomeIdx}`);
  };

  const isOpen = market.status === "open";
  const poolFormatted = formatEth(market.totalPool);

  return (
    <motion.div
      {...heroEntrance}
      className="hero-market-glow rounded-2xl p-5 sm:p-6 lg:p-8"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, var(--surface) 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Question */}
      <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-white leading-tight mb-3 lg:mb-4">
        {market.question}
      </h2>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-2 mb-5 lg:mb-6">
        {isOpen && (
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase"
            style={{ background: "rgba(0,255,136,0.1)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.2)" }}
          >
            <span className="live-dot-green" style={{ width: 5, height: 5 }} />
            LIVE
          </span>
        )}
        {deadline.urgent && isOpen && (
          <span className="badge-ending">
            <Clock className="h-3 w-3" />
            {deadline.text}
          </span>
        )}
        {!deadline.urgent && (
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <Clock className="h-3 w-3" />
            {deadline.text}
          </span>
        )}
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <TrendingUp className="h-3 w-3" />
          {poolFormatted} pool
        </span>
      </div>

      {/* YES vs NO split */}
      {isBinary ? (
        <div className="flex items-center justify-center gap-4 sm:gap-6 lg:gap-10 mb-5 lg:mb-6">
          {/* YES side */}
          <div className="flex-1 text-center">
            <div className="text-xs sm:text-sm font-bold uppercase tracking-wider mb-1" style={{ color: "#00ff88" }}>
              {yesLabel}
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={yesOdds}
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.25 }}
                className="text-4xl sm:text-5xl lg:text-6xl font-black tabular"
                style={{ color: "#00ff88", textShadow: "0 0 30px rgba(0,255,136,0.3)" }}
              >
                {yesOdds}%
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Divider */}
          <div className="odds-vs-divider min-h-[60px] sm:min-h-[80px]" />

          {/* NO side */}
          <div className="flex-1 text-center">
            <div className="text-xs sm:text-sm font-bold uppercase tracking-wider mb-1" style={{ color: "#EF4444" }}>
              {noLabel}
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={noOdds}
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.25 }}
                className="text-4xl sm:text-5xl lg:text-6xl font-black tabular"
                style={{ color: "#EF4444", textShadow: "0 0 30px rgba(239,68,68,0.3)" }}
              >
                {noOdds}%
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      ) : (
        /* Multi-outcome: show top 2 */
        <div className="flex items-center justify-center gap-4 mb-5 text-center">
          {market.labels.slice(0, 2).map((label, i) => (
            <div key={i} className="flex-1">
              <div className="text-xs font-bold uppercase tracking-wider mb-1 text-gray-400">{label}</div>
              <div className="text-3xl sm:text-4xl font-black tabular text-white">
                {Math.round(market.odds[i] ?? 0)}%
              </div>
            </div>
          ))}
          {market.outcomeCount > 2 && (
            <button
              onClick={() => router.push(`/markets/${market.address}`)}
              className="text-[10px] font-bold text-gray-500 hover:text-gray-300"
            >
              +{market.outcomeCount - 2} more <ArrowRight className="inline h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Progress bar */}
      {isBinary && (
        <div className="h-1.5 rounded-full overflow-hidden mb-5 flex" style={{ background: "rgba(255,255,255,0.06)" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${yesOdds}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-l-full"
            style={{ background: "linear-gradient(90deg, rgba(0,255,136,0.6), rgba(0,255,136,0.3))" }}
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${noOdds}%` }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
            className="h-full rounded-r-full"
            style={{ background: "linear-gradient(90deg, rgba(239,68,68,0.3), rgba(239,68,68,0.6))" }}
          />
        </div>
      )}

      {/* BIG YES/NO buttons */}
      {isOpen && (
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => navigate(yesIdx)}
            className="btn-hero-yes flex-1 flex items-center justify-center gap-2 rounded-xl min-h-[56px] sm:min-h-[60px] lg:min-h-[64px] text-base sm:text-lg cursor-pointer"
          >
            <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
            Bet {yesLabel} {yesOdds}%
          </button>
          <button
            onClick={() => navigate(noIdx)}
            className="btn-hero-no flex-1 flex items-center justify-center gap-2 rounded-xl min-h-[56px] sm:min-h-[60px] lg:min-h-[64px] text-base sm:text-lg cursor-pointer"
          >
            <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
            Bet {noLabel} {noOdds}%
          </button>
        </div>
      )}

      {/* Last bet indicator */}
      <AnimatePresence>
        {lastBet && (
          <motion.div
            key={`${lastBet.amount}-${lastBet.time}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-3 text-center text-xs text-gray-500"
          >
            <span className="font-bold text-gray-300">{lastBet.amount}</span>
            {" on "}
            <span className="font-bold" style={{ color: lastBet.label.toLowerCase().includes("yes") || lastBet.label === market.labels[0] ? "#00ff88" : "#EF4444" }}>
              {lastBet.label}
            </span>
            {" · "}
            <span>{lastBet.time}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
