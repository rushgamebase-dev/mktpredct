"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import type { MarketSummary, ActivityResponse, WsGlobalMessage } from "@rush/shared";
import { OUTCOME_COLORS } from "@rush/shared";
import { apiGet } from "@/lib/api";
import { formatEth, formatAddress, timeAgo } from "@/lib/format";
import { Zap } from "lucide-react";

interface LiveActivityFeedProps {
  markets: MarketSummary[];
  lastWsBet?: WsGlobalMessage | null;
}

interface MergedBet {
  user: string;
  outcomeIndex: number;
  amount: string;
  txHash: string;
  timestamp: number;
  marketAddress: string;
  marketQuestion: string;
  outcomeLabel: string;
  isNew?: boolean;
}

function shortQuestion(q: string): string {
  const words = q.split(/\s+/).slice(0, 3).join(" ");
  return words.length > 22 ? words.slice(0, 22) + "..." : words;
}

const LARGE_THRESHOLD = BigInt("100000000000000000"); // 0.1 ETH
const MAX_ITEMS = 10;

const itemVariants = {
  initial: { opacity: 0, x: -16, height: 0 },
  animate: { opacity: 1, x: 0, height: "auto", transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  exit: { opacity: 0, x: 16, height: 0, transition: { duration: 0.2 } },
};

export default function LiveActivityFeed({ markets, lastWsBet }: LiveActivityFeedProps) {
  const [bets, setBets] = useState<MergedBet[]>([]);
  const [filter, setFilter] = useState<"all" | "whales">("all");
  const [loading, setLoading] = useState(true);

  // Initial fetch
  useEffect(() => {
    if (markets.length === 0) return;
    (async () => {
      const merged: MergedBet[] = [];
      const results = await Promise.allSettled(
        markets.slice(0, 8).map(async (m, mIdx) => {
          try {
            const resp = await apiGet<ActivityResponse>(`/api/markets/${m.address}/activity`);
            return resp.bets.slice(0, 5).map((b) => ({
              ...b,
              marketAddress: m.address,
              marketQuestion: m.question,
              outcomeLabel: m.labels[b.outcomeIndex] ?? `#${b.outcomeIndex}`,
            }));
          } catch { return []; }
        }),
      );
      for (const r of results) {
        if (r.status === "fulfilled") merged.push(...r.value);
      }
      merged.sort((a, b) => b.timestamp - a.timestamp);
      setBets(merged.slice(0, MAX_ITEMS));
      setLoading(false);
    })();
  }, [markets]);

  // WS: prepend new bets
  useEffect(() => {
    if (!lastWsBet || lastWsBet.type !== "bet") return;
    const d = lastWsBet.data as { user: string; outcomeIndex: number; amount: string; txHash: string; timestamp: number };
    const m = markets.find((mk) => mk.address === lastWsBet.marketAddress);
    const newBet: MergedBet = {
      user: d.user,
      outcomeIndex: d.outcomeIndex,
      amount: d.amount,
      txHash: d.txHash,
      timestamp: d.timestamp,
      marketAddress: lastWsBet.marketAddress,
      marketQuestion: m?.question ?? lastWsBet.marketAddress.slice(0, 10),
      outcomeLabel: m?.labels[d.outcomeIndex] ?? `#${d.outcomeIndex}`,
      isNew: true,
    };
    setBets((prev) => [newBet, ...prev].slice(0, MAX_ITEMS));
    setLoading(false);
  }, [lastWsBet, markets]);

  const filtered = filter === "whales"
    ? bets.filter((b) => { try { return BigInt(b.amount) >= LARGE_THRESHOLD; } catch { return false; } })
    : bets;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "#00ff88" }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "#00ff88" }} />
          </span>
          <span className="text-sm font-bold uppercase tracking-wider text-gray-200">Live Bets</span>
        </div>
        <div className="flex gap-1">
          {(["all", "whales"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-full transition-colors uppercase"
              style={
                filter === f
                  ? { background: "rgba(0,255,136,0.1)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.2)" }
                  : { background: "transparent", color: "#666", border: "1px solid transparent" }
              }
            >
              {f === "whales" && <Zap className="h-2.5 w-2.5" />}
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="px-3 py-2" style={{ maxHeight: 360 }}>
        {loading ? (
          <div className="space-y-2 py-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-6">
            {filter === "whales" ? "No whale bets yet" : "Waiting for first bet..."}
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((bet) => {
              const color = OUTCOME_COLORS[bet.outcomeIndex % OUTCOME_COLORS.length];
              const isYesLike = bet.outcomeIndex === 0;
              return (
                <motion.div
                  key={`${bet.txHash}-${bet.timestamp}`}
                  variants={itemVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  layout
                  className={`flex items-center gap-2.5 py-2.5 px-2 rounded-lg ${bet.isNew ? (isYesLike ? "activity-flash-yes" : "activity-flash-no") : ""}`}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-sm font-bold text-gray-200 tabular shrink-0">{formatEth(bet.amount)}</span>
                  <span className="text-xs text-gray-600">on</span>
                  <span className="text-sm font-bold shrink-0" style={{ color }}>{bet.outcomeLabel}</span>
                  <Link
                    href={`/markets/${bet.marketAddress}`}
                    className="text-xs text-gray-500 truncate hover:text-gray-300 transition-colors min-w-0"
                  >
                    {shortQuestion(bet.marketQuestion)}
                  </Link>
                  <span className="text-[10px] text-gray-600 tabular shrink-0 ml-auto">{timeAgo(bet.timestamp)}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
