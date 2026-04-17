"use client";

import React, { useRef, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useMarkets } from "@/hooks/useMarkets";
import { useGlobalFeed } from "@/hooks/useGlobalFeed";
import HeroMarket from "@/components/home/HeroMarket";
import SocialProofBar from "@/components/home/SocialProofBar";
import LiveActivityFeed from "@/components/home/LiveActivityFeed";
import MarketFeedCard from "@/components/home/MarketFeedCard";
import { MarketFeedCardSkeletonGrid } from "@/components/market/MarketCardSkeleton";
import NewsHeadlines from "@/components/home/NewsHeadlines";
import { staggerContainer, tabContent } from "@/lib/animations";
import { TrendingUp, CheckCircle, LayoutGrid, Activity, Zap, Lightbulb } from "lucide-react";
import { formatEth } from "@/lib/format";
import type { MarketsListQuery, WsGlobalMessage } from "@rush/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusFilter = "all" | "open" | "resolved";

const TABS: { key: StatusFilter; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "All Markets", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { key: "open", label: "Open", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { key: "resolved", label: "Resolved", icon: <CheckCircle className="h-3.5 w-3.5" /> },
];

// ---------------------------------------------------------------------------
// Stagger section animation variants
// ---------------------------------------------------------------------------

const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
};

// ---------------------------------------------------------------------------
// HomePage
// ---------------------------------------------------------------------------

export default function HomePage() {
  const queryClient = useQueryClient();

  // Status filter & pagination
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  // Last WS bet event (passed to HeroMarket + LiveActivityFeed)
  const [lastWsBet, setLastWsBet] = useState<WsGlobalMessage | null>(null);

  // Track recent bet count (bets in last 60s from WS)
  const recentBetTimesRef = useRef<number[]>([]);
  const [recentBetCount, setRecentBetCount] = useState(0);

  const queryParams: MarketsListQuery = {
    page,
    pageSize: 20,
    status: status === "all" ? "all" : status,
  };

  const { data, isLoading, error } = useMarkets(queryParams);
  const markets = data?.markets ?? [];

  // ---------------------------------------------------------------------------
  // Global WS — real-time updates for home page
  // ---------------------------------------------------------------------------
  const handleGlobalMessage = useCallback((msg: WsGlobalMessage) => {
    const addr = msg.marketAddress;
    if (!addr) return;

    switch (msg.type) {
      case "bet":
        setLastWsBet(msg);
        // Track bets-per-minute for social proof
        recentBetTimesRef.current.push(Date.now());
        recentBetTimesRef.current = recentBetTimesRef.current.filter((t) => Date.now() - t < 60_000);
        setRecentBetCount(recentBetTimesRef.current.length);
        break;
      case "odds_update":
        queryClient.setQueryData(["markets", page, 20, status === "all" ? "all" : status], (old: any) => {
          if (!old?.markets) return old;
          return {
            ...old,
            markets: old.markets.map((m: any) =>
              m.address === addr
                ? { ...m, totalPool: msg.data.totalPool, totalPerOutcome: msg.data.totalPerOutcome, odds: msg.data.odds }
                : m
            ),
          };
        });
        break;
      case "status_change":
        queryClient.setQueryData(["markets", page, 20, status === "all" ? "all" : status], (old: any) => {
          if (!old?.markets) return old;
          return {
            ...old,
            markets: old.markets.map((m: any) =>
              m.address === addr
                ? { ...m, status: msg.data.status, winningOutcome: msg.data.winningOutcome }
                : m
            ),
          };
        });
        break;
    }
  }, [queryClient, page, status]);

  const handleGlobalReconnect = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["markets"] });
  }, [queryClient]);

  useGlobalFeed(handleGlobalMessage, handleGlobalReconnect);

  // Hero: counter markets first, then by pool, pick the hottest
  const heroMarkets = useMemo(() => {
    const open = markets.filter((m) => m.status === "open");
    const counters = open.filter((m) => m.marketType === "counter");
    const rest = open
      .filter((m) => m.marketType !== "counter")
      .sort((a, b) => {
        const poolA = BigInt(a.totalPool);
        const poolB = BigInt(b.totalPool);
        return poolB > poolA ? 1 : poolB < poolA ? -1 : 0;
      });
    return [...counters, ...rest].slice(0, 5);
  }, [markets]);

  const heroMarket = heroMarkets[0] ?? null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div>
      {/* ---- Section 0: Live Pulse Header ---- */}
      <motion.div
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        custom={0}
        className="mb-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <Activity className="h-6 w-6" style={{ color: "#00ff88" }} />
              Live Markets
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              The first prediction market focused on the Base ecosystem
            </p>
          </div>
          {heroMarkets.length > 0 && (
            <div className="hidden sm:flex items-center gap-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.15)" }}>
                <span className="live-dot-green" style={{ width: 6, height: 6 }} />
                <span className="text-xs font-bold" style={{ color: "#00ff88" }}>{heroMarkets.length} live</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,200,40,0.06)", border: "1px solid rgba(255,200,40,0.15)" }}>
                <Zap className="h-3.5 w-3.5" style={{ color: "#ffc828" }} />
                <span className="text-xs font-bold" style={{ color: "#ffc828" }}>
                  {formatEth(heroMarkets.reduce((sum, m) => sum + BigInt(m.totalPool), 0n).toString())} total pool
                </span>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ---- Section 1: HERO MARKET ---- */}
      <motion.div
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        custom={1}
        className="mb-5"
      >
        {heroMarket ? (
          <HeroMarket market={heroMarket} lastWsBet={lastWsBet} recentBetCount={recentBetCount} />
        ) : isLoading ? (
          <div className="skeleton h-[280px] sm:h-[320px] rounded-2xl" />
        ) : null}
      </motion.div>

      {/* ---- Social Proof Bar ---- */}
      {markets.length > 0 && (
        <div className="mb-4">
          <SocialProofBar markets={markets} recentBetCount={recentBetCount} />
        </div>
      )}

      {/* ---- Section 2: LIVE ACTIVITY FEED ---- */}
      <motion.div
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        custom={2}
        className="mb-6"
      >
        {markets.length > 0 ? (
          <LiveActivityFeed markets={markets} lastWsBet={lastWsBet} />
        ) : isLoading ? (
          <div className="skeleton h-[200px] rounded-xl" />
        ) : null}
      </motion.div>

      {/* ---- Divider ---- */}
      <div className="mb-6" style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

      {/* ---- "All Markets" heading ---- */}
      <motion.div
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        custom={3}
        className="mb-4 flex items-center justify-between"
      >
        <h2 className="text-lg font-bold text-white">All Markets</h2>
      </motion.div>

      {/* ---- Status filter tabs ---- */}
      <motion.div
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        custom={4}
        className="mb-6"
      >
        <div
          className="inline-flex gap-1 rounded-lg p-1"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setStatus(tab.key); setPage(1); }}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all"
              style={
                status === tab.key
                  ? { background: "rgba(0,255,136,0.1)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.2)" }
                  : { background: "transparent", color: "#666", border: "1px solid transparent" }
              }
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* ---- Loading ---- */}
      {isLoading && <MarketFeedCardSkeletonGrid count={6} />}

      {/* ---- Error ---- */}
      {error && (
        <div
          className="rounded-lg p-6 text-center"
          style={{ background: "rgba(255,68,68,0.05)", border: "1px solid rgba(255,68,68,0.15)" }}
        >
          <p className="text-sm text-red-400">Failed to load markets</p>
          <p className="mt-1 text-xs text-gray-600">
            {error instanceof Error ? error.message : "Please try again later"}
          </p>
        </div>
      )}

      {/* ---- Market Feed (2 cols desktop, 1 col mobile) ---- */}
      {data && data.markets.length > 0 && (
        <AnimatePresence mode="wait">
          <motion.div key="market-feed" {...tabContent}>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 gap-4 lg:grid-cols-2"
            >
              {data.markets.map((market, i) => (
                <MarketFeedCard key={market.address} market={market} index={i} />
              ))}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* ---- Empty ---- */}
      {data && data.markets.length === 0 && !isLoading && (
        <div
          className="rounded-xl p-12 text-center"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "rgba(0,255,136,0.1)" }}
          >
            <LayoutGrid className="h-6 w-6" style={{ color: "var(--primary)" }} />
          </div>
          <p className="text-sm font-semibold text-gray-300">No markets found</p>
          <p className="mt-1 text-xs text-gray-600">
            {status === "all" ? "No markets have been created yet." : `No ${status} markets right now.`}
          </p>
        </div>
      )}

      {/* ---- Pagination ---- */}
      {data && data.total > data.pageSize && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-30"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Previous
          </button>
          <span className="text-xs text-gray-500 tabular">
            Page {page} of {Math.ceil(data.total / data.pageSize)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(data.total / data.pageSize)}
            className="rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-30"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Next
          </button>
        </div>
      )}

      {/* ---- Headlines (secondary, at bottom) ---- */}
      <div className="mt-6">
        <NewsHeadlines />
      </div>

      {/* ---- Propose CTA ---- */}
      <div
        className="mt-8 rounded-2xl p-6 text-center"
        style={{
          background: "linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(0,255,136,0.04) 100%)",
          border: "1px solid rgba(59,130,246,0.12)",
        }}
      >
        <Lightbulb className="mx-auto mb-2 h-6 w-6" style={{ color: "#3B82F6" }} />
        <h3 className="text-sm font-bold text-white mb-1">Got a prediction?</h3>
        <p className="text-xs text-gray-400 mb-3">
          Propose a market and earn <span style={{ color: "#00ff88" }} className="font-bold">4% of every bet</span> if approved.
        </p>
        <a
          href="/propose"
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-xs font-bold transition-all hover:scale-105"
          style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#3B82F6" }}
        >
          <Zap className="h-3.5 w-3.5" />
          Propose a Market
        </a>
      </div>
    </div>
  );
}
