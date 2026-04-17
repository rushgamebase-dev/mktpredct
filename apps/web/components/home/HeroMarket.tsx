"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { MarketSummary, WsGlobalMessage } from "@rush/shared";
import { formatEth, timeAgo } from "@/lib/format";
import { heroEntrance } from "@/lib/animations";
import { Clock, Flame, TrendingUp, Zap, ArrowRight, Activity } from "lucide-react";
import ShareButton from "@/components/market/ShareButton";

interface HeroMarketProps {
  market: MarketSummary;
  lastWsBet: WsGlobalMessage | null;
  recentBetCount: number;
}

export default function HeroMarket({ market, lastWsBet, recentBetCount }: HeroMarketProps) {
  const router = useRouter();

  const isBinary = market.outcomeCount === 2;
  const yesIdx = 0;
  const noIdx = 1;
  const yesOdds = Math.round(market.odds[yesIdx] ?? 50);
  const noOdds = Math.round(market.odds[noIdx] ?? 50);
  const yesLabel = market.labels[yesIdx] ?? "Yes";
  const noLabel = market.labels[noIdx] ?? "No";

  // Live ticking countdown — updates every second
  const [countdown, setCountdown] = useState("");
  const [countdownUrgent, setCountdownUrgent] = useState(false);
  useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = market.deadline - now;
      if (diff <= 0) { setCountdown("Ended"); setCountdownUrgent(true); return; }
      const d = Math.floor(diff / 86400);
      const h = Math.floor((diff % 86400) / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setCountdownUrgent(diff < 3600);
      if (d > 0) setCountdown(`${d}d ${h}h ${m}m`);
      else if (h > 0) setCountdown(`${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`);
      else setCountdown(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [market.deadline]);

  // FOMO trigger detection
  const fomoTag = useMemo(() => {
    if (recentBetCount >= 5) return { text: "High activity", color: "#ffc828", icon: Activity };
    const spread = Math.abs(yesOdds - noOdds);
    if (spread < 15) return { text: "Momentum shift", color: "#3B82F6", icon: TrendingUp };
    if (yesOdds < 25 || noOdds < 25) return { text: "Underdog play", color: "#F97316", icon: Flame };
    return null;
  }, [recentBetCount, yesOdds, noOdds]);

  // Last bet on THIS market
  const lastBet = useMemo(() => {
    if (!lastWsBet || lastWsBet.type !== "bet") return null;
    if (lastWsBet.marketAddress !== market.address) return null;
    const d = lastWsBet.data as { amount: string; outcomeIndex: number; timestamp: number };
    const label = market.labels[d.outcomeIndex] ?? `#${d.outcomeIndex}`;
    return { amount: formatEth(d.amount), label, time: timeAgo(d.timestamp), isYes: d.outcomeIndex === 0 };
  }, [lastWsBet, market]);

  // Odds flash — brief glow when odds change
  const [oddsFlash, setOddsFlash] = useState(false);
  const prevOddsRef = useRef(yesOdds);
  useEffect(() => {
    if (yesOdds !== prevOddsRef.current) {
      setOddsFlash(true);
      prevOddsRef.current = yesOdds;
      const t = setTimeout(() => setOddsFlash(false), 800);
      return () => clearTimeout(t);
    }
  }, [yesOdds]);

  const navigate = useCallback((outcomeIdx: number) => {
    router.push(`/markets/${market.address}?outcome=${outcomeIdx}`);
  }, [router, market.address]);

  const isOpen = market.status === "open";

  return (
    <motion.div
      {...heroEntrance}
      className="hero-market-glow rounded-2xl p-5 sm:p-6 lg:p-8 relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, var(--surface) 100%)",
        border: `1px solid ${oddsFlash ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)"}`,
        transition: "border-color 0.3s",
      }}
    >
      {/* Top badges row */}
      <div className="flex flex-wrap items-center gap-2 mb-3 justify-center sm:justify-start">
        {isOpen && (
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase"
            style={{ background: "rgba(0,255,136,0.1)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.2)" }}
          >
            <span className="live-dot-green" style={{ width: 5, height: 5 }} />
            LIVE
          </span>
        )}
        <span
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase"
          style={{ background: "rgba(255,200,40,0.08)", color: "#ffc828", border: "1px solid rgba(255,200,40,0.2)" }}
        >
          <Flame className="h-3 w-3" />
          Trending Market
        </span>
        {fomoTag && (
          <span
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase"
            style={{ background: `${fomoTag.color}12`, color: fomoTag.color, border: `1px solid ${fomoTag.color}30` }}
          >
            <fomoTag.icon className="h-3 w-3" />
            {fomoTag.text}
          </span>
        )}
        {countdownUrgent && isOpen ? (
          <span className="badge-ending">
            <Clock className="h-3 w-3" />
            {countdown}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] text-gray-500 tabular">
            <Clock className="h-3 w-3" />
            {countdown}
          </span>
        )}
      </div>

      {/* Question */}
      <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-tight mb-1 text-center sm:text-left">
        {market.question}
      </h2>

      {/* Micro social proof */}
      <div className="flex flex-wrap items-center gap-3 mb-5 lg:mb-6 justify-center sm:justify-start text-[10px] text-gray-500">
        {recentBetCount > 0 && (
          <span className="flex items-center gap-1 font-bold" style={{ color: recentBetCount >= 3 ? "#ffc828" : "#888" }}>
            <Zap className="h-3 w-3" />
            {recentBetCount} bet{recentBetCount !== 1 ? "s" : ""} in last 60s
          </span>
        )}
        {BigInt(market.totalPool) >= BigInt("10000000000000000") && (
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            {formatEth(market.totalPool)} pool
          </span>
        )}
      </div>

      {/* YES vs NO split with pulse */}
      {isBinary ? (
        <div className="flex items-center justify-center gap-4 sm:gap-6 lg:gap-10 mb-5 lg:mb-6">
          <div className="flex-1 text-center">
            <div className="text-xs sm:text-sm font-bold uppercase tracking-wider mb-1" style={{ color: "#00ff88" }}>
              {yesLabel}
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={yesOdds}
                initial={{ opacity: 0, y: -12, scale: 1.1 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.25 }}
                className="text-4xl sm:text-5xl lg:text-6xl font-black tabular odds-pulse-green"
                style={{ color: "#00ff88", textShadow: oddsFlash ? "0 0 50px rgba(0,255,136,0.5)" : "0 0 30px rgba(0,255,136,0.3)" }}
              >
                {yesOdds}%
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="odds-vs-divider min-h-[60px] sm:min-h-[80px]" />
          <div className="flex-1 text-center">
            <div className="text-xs sm:text-sm font-bold uppercase tracking-wider mb-1" style={{ color: "#EF4444" }}>
              {noLabel}
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={noOdds}
                initial={{ opacity: 0, y: -12, scale: 1.1 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.25 }}
                className="text-4xl sm:text-5xl lg:text-6xl font-black tabular odds-pulse-red"
                style={{ color: "#EF4444", textShadow: oddsFlash ? "0 0 50px rgba(239,68,68,0.5)" : "0 0 30px rgba(239,68,68,0.3)" }}
              >
                {noOdds}%
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      ) : (
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
            <button onClick={() => router.push(`/markets/${market.address}`)} className="text-[10px] font-bold text-gray-500 hover:text-gray-300">
              +{market.outcomeCount - 2} more <ArrowRight className="inline h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Animated progress bar */}
      {isBinary && (
        <div className="h-2 rounded-full overflow-hidden mb-5 flex" style={{ background: "rgba(255,255,255,0.06)" }}>
          <motion.div
            animate={{ width: `${yesOdds}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="h-full rounded-l-full"
            style={{ background: "linear-gradient(90deg, rgba(0,255,136,0.7), rgba(0,255,136,0.35))" }}
          />
          <motion.div
            animate={{ width: `${noOdds}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="h-full rounded-r-full"
            style={{ background: "linear-gradient(90deg, rgba(239,68,68,0.35), rgba(239,68,68,0.7))" }}
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

      {/* Share + last bet */}
      <div className="mt-4 flex flex-col items-center gap-2">
        <ShareButton market={market} variant="full" />
        <AnimatePresence>
          {lastBet && (
            <motion.div
              key={`${lastBet.amount}-${lastBet.time}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-gray-500"
            >
              Last bet: <span className="font-bold text-gray-300">{lastBet.amount}</span>
              {" on "}
              <span className="font-bold" style={{ color: lastBet.isYes ? "#00ff88" : "#EF4444" }}>{lastBet.label}</span>
              {" · "}{lastBet.time}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
