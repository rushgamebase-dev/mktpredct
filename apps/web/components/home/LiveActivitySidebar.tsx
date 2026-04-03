"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MarketSummary, BetEvent, ActivityResponse } from "@rush/shared";
import { OUTCOME_COLORS } from "@rush/shared";
import { apiGet } from "@/lib/api";
import { formatEth, formatAddress, timeAgo } from "@/lib/format";

interface LiveActivitySidebarProps {
  markets: MarketSummary[];
}

type FilterMode = "all" | "large";

interface MergedBet extends BetEvent {
  marketQuestion: string;
  marketColor: string;
  outcomeLabel: string;
}

function shortQuestion(q: string, maxWords = 2): string {
  const words = q.split(/\s+/).slice(0, maxWords).join(" ");
  return words.length > 18 ? words.slice(0, 18) + "..." : words;
}

const LARGE_THRESHOLD = "100000000000000000"; // 0.1 ETH

function isLargeBet(amount: string): boolean {
  try { return BigInt(amount) >= BigInt(LARGE_THRESHOLD); } catch { return false; }
}

const itemVariants = {
  initial: { opacity: 0, x: 20, height: 0 },
  animate: { opacity: 1, x: 0, height: "auto", transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  exit: { opacity: 0, x: -20, height: 0, transition: { duration: 0.2 } },
};

export default function LiveActivitySidebar({ markets }: LiveActivitySidebarProps) {
  const [bets, setBets] = useState<MergedBet[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  // Fetch real bets from all markets
  useEffect(() => {
    if (fetchedRef.current || markets.length === 0) return;
    fetchedRef.current = true;

    const fetchAll = async () => {
      setLoading(true);
      const merged: MergedBet[] = [];
      const results = await Promise.allSettled(
        markets.map(async (m, mIdx) => {
          try {
            const resp = await apiGet<ActivityResponse>(`/api/markets/${m.address}/activity`);
            return resp.bets.map((b) => ({
              ...b,
              marketQuestion: m.question,
              marketColor: OUTCOME_COLORS[mIdx % OUTCOME_COLORS.length],
              outcomeLabel: m.labels[b.outcomeIndex] ?? `Outcome ${b.outcomeIndex}`,
            }));
          } catch { return []; }
        }),
      );
      results.forEach((r) => { if (r.status === "fulfilled") merged.push(...r.value); });
      merged.sort((a, b) => b.timestamp - a.timestamp);
      setBets(merged.slice(0, 15));
      setLoading(false);
    };
    fetchAll();
  }, [markets]);

  // NO FAKE BETS — only real data from API

  const filteredBets = filter === "large" ? bets.filter((b) => isLargeBet(b.amount)) : bets;

  return (
    <div className="flex flex-col rounded-xl overflow-hidden"
      style={{ background: "var(--surface, #111)", border: "1px solid var(--border, rgba(255,255,255,0.08))" }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "#00ff88" }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "#00ff88" }} />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-300">Live Activity</span>
        </div>
        <div className="flex gap-1">
          {(["all", "large"] as FilterMode[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-2 py-0.5 text-[10px] font-bold rounded transition-colors uppercase"
              style={filter === f
                ? { background: "rgba(0,255,136,0.1)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.2)" }
                : { background: "transparent", color: "#666", border: "1px solid transparent" }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ maxHeight: 420, scrollbarWidth: "thin" }}>
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-12 w-full rounded-lg" />)}</div>
        ) : filteredBets.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-6">
            {filter === "large" ? "No large bets yet" : "Waiting for first bet..."}
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {filteredBets.map((bet) => (
              <motion.div key={`${bet.id}-${bet.txHash}`} variants={itemVariants} initial="initial" animate="animate" exit="exit" layout
                className="flex items-start gap-2 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.03)" }}>
                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: OUTCOME_COLORS[bet.outcomeIndex % OUTCOME_COLORS.length] }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-xs">
                    <span className="font-bold text-gray-300">{formatEth(bet.amount)}</span>
                    <span className="text-gray-500">bet</span>
                    <span className="font-bold" style={{ color: OUTCOME_COLORS[bet.outcomeIndex % OUTCOME_COLORS.length] }}>
                      {bet.outcomeLabel}
                    </span>
                    <span className="text-gray-600">on</span>
                    <span className="text-gray-400 truncate">{shortQuestion(bet.marketQuestion)}</span>
                  </div>
                  <div className="text-[10px] text-gray-600 mt-0.5">
                    {formatAddress(bet.user)} · {timeAgo(bet.timestamp)}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
