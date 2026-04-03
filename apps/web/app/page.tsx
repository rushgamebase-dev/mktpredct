"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useMarkets } from "@/hooks/useMarkets";
import { useGlobalFeed } from "@/hooks/useGlobalFeed";
import { apiGet } from "@/lib/api";
import MarketCard from "@/components/market/MarketCard";
import { MarketCardSkeletonGrid } from "@/components/market/MarketCardSkeleton";
import HeroChart from "@/components/home/HeroChart";
import MarketSelector from "@/components/home/MarketSelector";
import LiveActivitySidebar from "@/components/home/LiveActivitySidebar";
import NewsSidebar from "@/components/home/NewsSidebar";
import NewsHeadlines from "@/components/home/NewsHeadlines";
import { staggerContainer, tabContent } from "@/lib/animations";
import { TrendingUp, CheckCircle, LayoutGrid, Activity, Zap } from "lucide-react";
import { formatEth } from "@/lib/format";
import type { MarketsListQuery, ChartResponse, OddsPoint, WsGlobalMessage } from "@rush/shared";
import { OUTCOME_COLORS } from "@rush/shared";

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
  const router = useRouter();
  const queryClient = useQueryClient();

  // Market selection / hover
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [hoveredMarket, setHoveredMarket] = useState<string | null>(null);

  // Status filter & pagination
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  // Chart data
  const [chartDataMap, setChartDataMap] = useState<Record<string, OddsPoint[]>>({});

  // Last WS bet event (passed to LiveActivitySidebar for instant prepend)
  const [lastWsBet, setLastWsBet] = useState<WsGlobalMessage | null>(null);

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
        // Pass to LiveActivitySidebar for instant prepend
        setLastWsBet(msg);
        // Refetch chart for this specific market
        setChartDataMap((prev) => {
          const next = { ...prev };
          delete next[addr]; // Force refetch
          return next;
        });
        break;
      case "odds_update":
        // Invalidate the specific market AND the markets list
        queryClient.invalidateQueries({ queryKey: ["market", addr] });
        queryClient.invalidateQueries({ queryKey: ["markets"] });
        break;
      case "status_change":
        queryClient.invalidateQueries({ queryKey: ["markets"] });
        break;
      case "counter_update":
        queryClient.invalidateQueries({ queryKey: ["markets"] });
        break;
    }
  }, [queryClient]);

  useGlobalFeed(handleGlobalMessage);

  // Hero chart: counter markets first (AIXBT etc), then by pool, max 5
  const heroMarkets = useMemo(
    () => {
      const open = markets.filter((m) => m.status === "open");
      // Counter markets first (featured)
      const counters = open.filter((m) => m.marketType === "counter");
      const rest = open
        .filter((m) => m.marketType !== "counter")
        .sort((a, b) => {
          const poolA = BigInt(a.totalPool);
          const poolB = BigInt(b.totalPool);
          return poolB > poolA ? 1 : poolB < poolA ? -1 : 0;
        });
      return [...counters, ...rest].slice(0, 5);
    },
    [markets],
  );

  // ---------------------------------------------------------------------------
  // Fetch chart data — REAL data only, no synthetic
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (heroMarkets.length === 0) return;
    let cancelled = false;

    const fetchCharts = async () => {
      const entries: [string, OddsPoint[]][] = [];

      const results = await Promise.allSettled(
        heroMarkets.map(async (m) => {
          if (chartDataMap[m.address]?.length) return null;
          try {
            const resp = await apiGet<ChartResponse>(`/api/markets/${m.address}/chart`);
            return { address: m.address, points: resp.points };
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;

      results.forEach((r) => {
        if (r.status === "fulfilled" && r.value) {
          entries.push([r.value.address, r.value.points]);
        }
      });

      if (entries.length > 0) {
        setChartDataMap((prev) => {
          const next = { ...prev };
          entries.forEach(([addr, pts]) => {
            next[addr] = pts;
          });
          return next;
        });
      }
    };

    fetchCharts();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroMarkets.map((m) => m.address).join(",")]);

  // ---------------------------------------------------------------------------
  // Selected market info (for quick-bet buttons)
  // ---------------------------------------------------------------------------
  const selectedMarketData = useMemo(() => {
    if (!selectedMarket) return null;
    return markets.find((m) => m.address === selectedMarket) ?? null;
  }, [selectedMarket, markets]);

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
          {/* Tension stats */}
          {heroMarkets.length > 0 && (
            <div className="hidden sm:flex items-center gap-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.15)" }}>
                <span className="live-dot-green" style={{ width: 6, height: 6 }} />
                <span className="text-xs font-bold" style={{ color: "#00ff88" }}>{heroMarkets.length} live</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,200,40,0.06)", border: "1px solid rgba(255,200,40,0.15)" }}>
                <Zap className="h-3.5 w-3.5" style={{ color: "#ffc828" }} />
                <span className="text-xs font-bold" style={{ color: "#ffc828" }}>
                  {formatEth(heroMarkets.reduce((sum, m) => {
                    const pool = BigInt(m.totalPool);
                    return sum + pool;
                  }, BigInt(0)).toString())} total pool
                </span>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ---- Section 1: Market Selector pills ---- */}
      <motion.div
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        custom={1}
        className="mb-4"
      >
        {heroMarkets.length > 0 && (
          <MarketSelector
            markets={heroMarkets}
            selected={selectedMarket}
            onSelect={setSelectedMarket}
            hovered={hoveredMarket}
            onHover={setHoveredMarket}
          />
        )}
      </motion.div>

      {/* ---- Section 2: Hero Chart + Activity Sidebar ---- */}
      <motion.div
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        custom={2}
        className="mb-6 grid grid-cols-1 lg:grid-cols-10 gap-4"
      >
        {/* Chart */}
        <div
          className="lg:col-span-7 rounded-xl overflow-hidden"
          style={{
            background: "var(--surface, #111)",
            border: "1px solid var(--border, rgba(255,255,255,0.08))",
          }}
        >
          {heroMarkets.length > 0 ? (
            <HeroChart
              markets={heroMarkets}
              chartDataMap={chartDataMap}
              selectedMarket={selectedMarket}
              onSelectMarket={setSelectedMarket}
              hoveredMarket={hoveredMarket}
              onHoverMarket={setHoveredMarket}
              height={480}
            />
          ) : (
            <div
              className="flex items-center justify-center animate-pulse"
              style={{ height: 480, background: "rgba(255,255,255,0.02)" }}
            >
              <span className="text-xs text-gray-600">Loading chart...</span>
            </div>
          )}

          {/* Quick-bet buttons (single-market mode) → navigate to market */}
          {selectedMarketData && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-4 pb-4 pt-1 flex gap-2"
            >
              {selectedMarketData.labels.slice(0, 4).map((label, idx) => {
                const color = OUTCOME_COLORS[idx % OUTCOME_COLORS.length];
                const odds = Math.round(selectedMarketData.odds[idx] ?? 0);
                return (
                  <button
                    key={label}
                    onClick={() => router.push(`/markets/${selectedMarket}?outcome=${idx}`)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.97]"
                    style={{
                      background: color + "18",
                      border: `1px solid ${color}40`,
                      color: color,
                      boxShadow: `0 0 12px ${color}15`,
                    }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: color }}
                    />
                    {label} {odds}%
                  </button>
                );
              })}
            </motion.div>
          )}
        </div>

        {/* Activity sidebar -- desktop: full height, mobile: capped */}
        <div className="lg:col-span-3 max-h-[200px] lg:max-h-none">
          {markets.length > 0 ? (
            <LiveActivitySidebar markets={markets} lastWsBet={lastWsBet} />
          ) : (
            <div
              className="rounded-xl animate-pulse h-full"
              style={{
                background: "var(--surface, #111)",
                border: "1px solid var(--border, rgba(255,255,255,0.08))",
                minHeight: 200,
              }}
            />
          )}
        </div>
      </motion.div>

      {/* ---- Divider ---- */}
      <div
        className="mb-6"
        style={{ height: 1, background: "rgba(255,255,255,0.06)" }}
      />

      {/* ---- LIVE TICKER STRIP ---- */}
      <motion.div
        variants={sectionVariants} initial="hidden" animate="visible" custom={3}
        className="mb-6 overflow-hidden rounded-lg py-2 px-4"
        style={{ background: "rgba(0,255,136,0.03)", border: "1px solid rgba(0,255,136,0.08)" }}
      >
        <div className="flex items-center gap-6 animate-slide-in">
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="live-dot-green" style={{ width: 6, height: 6 }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#00ff88" }}>Live</span>
          </span>
          <div className="flex items-center gap-4 overflow-x-auto text-xs text-gray-400" style={{ scrollbarWidth: "none" }}>
            {heroMarkets.flatMap((m) =>
              (m.odds ?? []).slice(0, 2).map((odd, i) => (
                <span key={`${m.address}-${i}`} className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                  <span className="font-bold text-gray-300">{m.labels[i]}</span>
                  <span className="tabular" style={{ color: odd > 55 ? "#00ff88" : odd < 45 ? "#ff4444" : "#888" }}>
                    {Math.round(odd)}%
                  </span>
                  <span className="text-gray-600">·</span>
                  <span className="text-gray-500">{m.question.split(/\s+/).slice(0, 3).join(" ")}</span>
                </span>
              )),
            )}
          </div>
        </div>
      </motion.div>

      {/* ---- HEADLINES (real from API) ---- */}
      <NewsHeadlines />

      {/* ---- Section: "All Markets" heading ---- */}
      <motion.div
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        custom={5}
        className="mb-4 flex items-center justify-between"
      >
        <h2 className="text-lg font-bold text-white">All Markets</h2>
      </motion.div>

      {/* ---- Section 4: Status filter tabs ---- */}
      <motion.div
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        custom={4}
        className="mb-6"
      >
        <div
          className="inline-flex gap-1 rounded-lg p-1"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setStatus(tab.key);
                setPage(1);
              }}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all"
              style={
                status === tab.key
                  ? {
                      background: "rgba(0,255,136,0.1)",
                      color: "#00ff88",
                      border: "1px solid rgba(0,255,136,0.2)",
                    }
                  : {
                      background: "transparent",
                      color: "#666",
                      border: "1px solid transparent",
                    }
              }
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* ---- Loading state ---- */}
      {isLoading && <MarketCardSkeletonGrid count={6} />}

      {/* ---- Error state ---- */}
      {error && (
        <div
          className="rounded-lg p-6 text-center"
          style={{
            background: "rgba(255,68,68,0.05)",
            border: "1px solid rgba(255,68,68,0.15)",
          }}
        >
          <p className="text-sm text-red-400">Failed to load markets</p>
          <p className="mt-1 text-xs text-gray-600">
            {error instanceof Error ? error.message : "Please try again later"}
          </p>
        </div>
      )}

      {/* ---- Markets grid ---- */}
      {data && data.markets.length > 0 && (
        <AnimatePresence mode="wait">
          <motion.div key={status} {...tabContent}>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {data.markets.map((market, i) => (
                <MarketCard key={market.address} market={market} index={i} />
              ))}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* ---- Empty state ---- */}
      {data && data.markets.length === 0 && !isLoading && (
        <div
          className="rounded-xl p-12 text-center"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "rgba(0,255,136,0.1)" }}
          >
            <LayoutGrid className="h-6 w-6" style={{ color: "var(--primary)" }} />
          </div>
          <p className="text-sm font-semibold text-gray-300">No markets found</p>
          <p className="mt-1 text-xs text-gray-600">
            {status === "all"
              ? "No markets have been created yet."
              : `No ${status} markets right now.`}
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
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
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
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
