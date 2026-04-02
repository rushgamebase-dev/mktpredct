"use client";

import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { BetEvent, WsServerMessage } from "@rush/shared";
import { OUTCOME_COLORS } from "@rush/shared";
import { useActivity } from "@/hooks/useActivity";
import { useMarketFeed } from "@/hooks/useMarketFeed";
import { formatEth, formatAddress, timeAgo } from "@/lib/format";
import { Activity, Pause, Play, ArrowUpRight, Zap } from "lucide-react";

type FilterType = "all" | "large";

// Large bet threshold in wei (0.1 ETH)
const LARGE_BET_WEI = BigInt("100000000000000000");

interface ActivityFeedProps {
  marketAddress: string;
  labels: string[];
}

interface FeedItem {
  id: string;
  user: string;
  outcomeIndex: number;
  amount: string;
  timestamp: number;
  isNew?: boolean;
}

export default function ActivityFeed({ marketAddress, labels }: ActivityFeedProps) {
  const { data: activity } = useActivity(marketAddress);
  const [liveBets, setLiveBets] = useState<FeedItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [newBetCount, setNewBetCount] = useState(0);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  // Buffer for bets that arrive while paused
  const pauseBufferRef = useRef<FeedItem[]>([]);

  // WebSocket handler for real-time updates
  const handleWsMessage = useCallback((msg: WsServerMessage) => {
    if (msg.type === "bet") {
      const newItem: FeedItem = {
        id: `ws-${msg.data.txHash}-${Date.now()}`,
        user: msg.data.user,
        outcomeIndex: msg.data.outcomeIndex,
        amount: msg.data.amount,
        timestamp: msg.data.timestamp,
        isNew: true,
      };

      if (isPaused) {
        pauseBufferRef.current = [newItem, ...pauseBufferRef.current].slice(0, 50);
      } else {
        setLiveBets((prev) => [newItem, ...prev].slice(0, 50));
      }

      // Track new bets when scrolled down
      if (!isAutoScroll) {
        setNewBetCount((prev) => prev + 1);
      }
    }
  }, [isPaused, isAutoScroll]);

  useMarketFeed(marketAddress, handleWsMessage);

  // Handle pause/resume
  const togglePause = () => {
    if (isPaused) {
      // Resume: flush buffered bets
      setLiveBets((prev) => [...pauseBufferRef.current, ...prev].slice(0, 50));
      pauseBufferRef.current = [];
    }
    setIsPaused(!isPaused);
  };

  // Scroll handling for "new bets" banner
  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop } = containerRef.current;
      setIsAutoScroll(scrollTop < 10);
      if (scrollTop < 10) {
        setNewBetCount(0);
      }
    }
  };

  const scrollToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setNewBetCount(0);
    setIsAutoScroll(true);
  };

  // Merge live bets with historical bets, deduplicating
  const historicalBets: FeedItem[] = (activity?.bets ?? []).map((b: BetEvent) => ({
    id: `hist-${b.id}`,
    user: b.user,
    outcomeIndex: b.outcomeIndex,
    amount: b.amount,
    timestamp: b.timestamp,
  }));

  const liveTxHashes = new Set(liveBets.map((b) => b.id));
  let deduped = [
    ...liveBets,
    ...historicalBets.filter((b) => !liveTxHashes.has(b.id)),
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 30);

  // Apply filter
  if (filter === "large") {
    deduped = deduped.filter((item) => {
      try {
        return BigInt(item.amount) >= LARGE_BET_WEI;
      } catch {
        return false;
      }
    });
  }

  const filters: { id: FilterType; label: string }[] = [
    { id: "all", label: "All" },
    { id: "large", label: "Large" },
  ];

  return (
    <div className="card overflow-hidden">
      {/* Header with pause/play and filters */}
      <div className="p-4 pb-2">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-gray-300">
            <Activity className="h-4 w-4" />
            Recent Activity
            {liveBets.length > 0 && !isPaused && (
              <span className="live-dot" />
            )}
            {isPaused && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-yellow-500">PAUSED</span>
            )}
          </h3>
          <button
            onClick={togglePause}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
            title={isPaused ? "Resume" : "Pause"}
            style={isPaused ? { background: "rgba(255,200,40,0.1)", color: "#ffc828" } : { color: "#666" }}
          >
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all"
              style={
                filter === f.id
                  ? { background: "rgba(0,255,136,0.1)", color: "#00ff88" }
                  : { color: "#666" }
              }
            >
              {f.id === "large" && <Zap className="h-3 w-3" />}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* "X new bets" banner */}
      <AnimatePresence>
        {newBetCount > 0 && !isAutoScroll && (
          <motion.button
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onClick={scrollToTop}
            className="flex w-full items-center justify-center gap-1.5 py-1.5 text-xs font-bold transition-colors hover:bg-opacity-20"
            style={{ background: "rgba(0,255,136,0.08)", color: "#00ff88" }}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            {newBetCount} new bet{newBetCount !== 1 ? "s" : ""}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Activity list */}
      <div className="px-4 pb-4">
        {deduped.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-600">
            No activity yet
          </p>
        ) : (
          <div ref={containerRef} onScroll={handleScroll} className="max-h-[320px] overflow-y-auto space-y-1">
            <AnimatePresence initial={false}>
              {deduped.map((item) => {
                const color = OUTCOME_COLORS[item.outcomeIndex % OUTCOME_COLORS.length];
                const outcomeLabel = labels[item.outcomeIndex] ?? `#${item.outcomeIndex}`;

                return (
                  <motion.div
                    key={item.id}
                    initial={item.isNew ? { opacity: 0, x: -12, height: 0 } : false}
                    animate={{ opacity: 1, x: 0, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 ${item.isNew ? "bet-flash" : ""}`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="text-[11px] font-mono text-gray-500 shrink-0">
                        {formatAddress(item.user)}
                      </span>
                      <span className="text-[11px] text-gray-600">bet</span>
                      <span
                        className="text-[11px] font-bold truncate"
                        style={{ color }}
                      >
                        {outcomeLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-bold tabular text-gray-300">
                        {formatEth(item.amount)}
                      </span>
                      <span className="text-[10px] text-gray-600 tabular">
                        {timeAgo(item.timestamp)}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
