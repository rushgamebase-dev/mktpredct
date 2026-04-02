"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MarketSummary, BetEvent, ActivityResponse } from "@rush/shared";
import { OUTCOME_COLORS } from "@rush/shared";
import { apiGet } from "@/lib/api";
import { formatEth, formatAddress, timeAgo } from "@/lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveActivitySidebarProps {
  markets: MarketSummary[];
}

type FilterMode = "all" | "large";

interface MergedBet extends BetEvent {
  marketQuestion: string;
  marketColor: string;
  outcomeLabel: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortQuestion(q: string, maxWords = 2): string {
  const words = q.split(/\s+/).slice(0, maxWords).join(" ");
  return words.length > 18 ? words.slice(0, 18) + "..." : words;
}

const LARGE_THRESHOLD = "100000000000000000"; // 0.1 ETH in wei

function isLargeBet(amount: string): boolean {
  try {
    return BigInt(amount) >= BigInt(LARGE_THRESHOLD);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Simulated fake bet generator
// ---------------------------------------------------------------------------

let fakeIdCounter = 900000;

function generateFakeBet(markets: MarketSummary[]): MergedBet | null {
  if (markets.length === 0) return null;
  const mIdx = Math.floor(Math.random() * markets.length);
  const m = markets[mIdx];
  const outcomeIdx = Math.floor(Math.random() * m.outcomeCount);
  const ethAmount = 0.01 + Math.random() * 0.49;
  const weiAmount = BigInt(Math.floor(ethAmount * 1e18)).toString();

  fakeIdCounter += 1;
  return {
    id: fakeIdCounter,
    marketAddress: m.address,
    user: `0x${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}${"0".repeat(24)}`,
    outcomeIndex: outcomeIdx,
    amount: weiAmount,
    txHash: `0x${Math.random().toString(16).slice(2, 66)}`,
    blockNumber: 0,
    timestamp: Math.floor(Date.now() / 1000),
    marketQuestion: m.question,
    marketColor: OUTCOME_COLORS[mIdx % OUTCOME_COLORS.length],
    outcomeLabel: m.labels[outcomeIdx] ?? `Outcome ${outcomeIdx}`,
  };
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const itemVariants = {
  initial: { opacity: 0, x: 20, height: 0 },
  animate: {
    opacity: 1,
    x: 0,
    height: "auto",
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
  exit: {
    opacity: 0,
    x: -20,
    height: 0,
    transition: { duration: 0.2 },
  },
};

// ---------------------------------------------------------------------------
// LiveActivitySidebar
// ---------------------------------------------------------------------------

export default function LiveActivitySidebar({ markets }: LiveActivitySidebarProps) {
  const [bets, setBets] = useState<MergedBet[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Fetch real bets from all markets on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (fetchedRef.current || markets.length === 0) return;
    fetchedRef.current = true;

    const fetchAll = async () => {
      setLoading(true);
      const merged: MergedBet[] = [];

      // Fetch in parallel, swallow individual errors
      const results = await Promise.allSettled(
        markets.map(async (m, mIdx) => {
          try {
            const resp = await apiGet<ActivityResponse>(
              `/api/markets/${m.address}/activity`,
            );
            return resp.bets.map((b) => ({
              ...b,
              marketQuestion: m.question,
              marketColor: OUTCOME_COLORS[mIdx % OUTCOME_COLORS.length],
              outcomeLabel: m.labels[b.outcomeIndex] ?? `Outcome ${b.outcomeIndex}`,
            }));
          } catch {
            return [];
          }
        }),
      );

      results.forEach((r) => {
        if (r.status === "fulfilled") merged.push(...r.value);
      });

      // Sort by timestamp DESC, take top 15
      merged.sort((a, b) => b.timestamp - a.timestamp);
      setBets(merged.slice(0, 15));
      setLoading(false);
    };

    fetchAll();
  }, [markets]);

  // ---------------------------------------------------------------------------
  // Simulated new bets every 3-5s
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (markets.length === 0) return;
    const schedule = () => {
      const delay = 3000 + Math.random() * 2000;
      return setTimeout(() => {
        const fake = generateFakeBet(markets);
        if (fake) {
          setBets((prev) => [fake, ...prev].slice(0, 15));
        }
        timerRef.current = schedule();
      }, delay);
    };
    const timerRef = { current: schedule() };
    return () => clearTimeout(timerRef.current);
  }, [markets]);

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------
  const filteredBets =
    filter === "large" ? bets.filter((b) => isLargeBet(b.amount)) : bets;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        background: "var(--surface, #111)",
        border: "1px solid var(--border, rgba(255,255,255,0.08))",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: "#00ff88" }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "#00ff88" }} />
          </span>
          <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
            Live Activity
          </span>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1">
          {(["all", "large"] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className="px-2 py-0.5 text-[10px] font-bold rounded transition-all uppercase"
              style={
                filter === mode
                  ? { background: "rgba(0,255,136,0.15)", color: "#00ff88" }
                  : { background: "transparent", color: "#555" }
              }
            >
              {mode === "all" ? "All" : "Large"}
            </button>
          ))}
        </div>
      </div>

      {/* Activity list */}
      <div
        className="overflow-y-auto"
        style={{
          maxHeight: 440,
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.1) transparent",
        }}
      >
        {loading && (
          <div className="px-4 py-8 text-center">
            <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-[#00ff88]" />
            <p className="mt-2 text-[10px] text-gray-600">Loading activity...</p>
          </div>
        )}

        {!loading && filteredBets.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-gray-600">
            {filter === "large" ? "No large bets yet" : "No activity yet"}
          </div>
        )}

        <AnimatePresence initial={false}>
          {filteredBets.map((bet) => (
            <motion.div
              key={`${bet.id}-${bet.timestamp}`}
              variants={itemVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              layout
              className="px-4 py-2.5 border-b"
              style={{ borderColor: "rgba(255,255,255,0.04)" }}
            >
              <div className="flex items-center gap-2 text-xs">
                {/* Colored dot */}
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: bet.marketColor }}
                />
                {/* Amount */}
                <span className="font-bold text-white shrink-0">
                  {formatEth(bet.amount)}
                </span>
                {/* Action */}
                <span className="text-gray-500">bet</span>
                {/* Outcome */}
                <span
                  className="font-semibold shrink-0"
                  style={{
                    color:
                      OUTCOME_COLORS[bet.outcomeIndex % OUTCOME_COLORS.length],
                  }}
                >
                  {bet.outcomeLabel}
                </span>
                {/* "on" */}
                <span className="text-gray-600">on</span>
                {/* Market name */}
                <span className="text-gray-400 truncate" title={bet.marketQuestion}>
                  {shortQuestion(bet.marketQuestion)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-600">
                <span>{formatAddress(bet.user)}</span>
                <span>&middot;</span>
                <span>{timeAgo(bet.timestamp)}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
