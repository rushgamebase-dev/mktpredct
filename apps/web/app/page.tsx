"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMarkets } from "@/hooks/useMarkets";
import { apiGet } from "@/lib/api";
import MarketCard from "@/components/market/MarketCard";
import { MarketCardSkeletonGrid } from "@/components/market/MarketCardSkeleton";
import HeroChart from "@/components/home/HeroChart";
import MarketSelector from "@/components/home/MarketSelector";
import LiveActivitySidebar from "@/components/home/LiveActivitySidebar";
import NewsSidebar from "@/components/home/NewsSidebar";
import { staggerContainer, tabContent } from "@/lib/animations";
import { TrendingUp, CheckCircle, LayoutGrid, Zap, Activity } from "lucide-react";
import { formatEth } from "@/lib/format";
import type { MarketsListQuery, ChartResponse, OddsPoint } from "@rush/shared";
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
  // Market selection / hover
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [hoveredMarket, setHoveredMarket] = useState<string | null>(null);

  // Status filter & pagination
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  // Chart data
  const [chartDataMap, setChartDataMap] = useState<Record<string, OddsPoint[]>>({});

  const queryParams: MarketsListQuery = {
    page,
    pageSize: 20,
    status: status === "all" ? "all" : status,
  };

  const { data, isLoading, error } = useMarkets(queryParams);
  const markets = data?.markets ?? [];

  // Hero chart: only show open markets with pool > 0 (max 5)
  const heroMarkets = useMemo(
    () => markets
      .filter((m) => m.status === "open" && BigInt(m.totalPool) > BigInt(0))
      .slice(0, 5),
    [markets],
  );

  // ---------------------------------------------------------------------------
  // Generate rich chart history: 60+ points with smooth random walk
  // Real data points serve as "anchors" — synthetic fills gaps between them
  // ---------------------------------------------------------------------------
  function generateRichHistory(
    currentOdds: number[],
    realPoints: OddsPoint[],
    outcomeCount: number,
  ): OddsPoint[] {
    const now = Math.floor(Date.now() / 1000);
    const TOTAL_POINTS = 72; // ~24h at 20min intervals
    const INTERVAL = 1200; // 20 minutes in seconds
    const points: OddsPoint[] = [];

    // Build anchor map from real data (timestamp → odds)
    const anchors = new Map<number, number[]>();
    for (const rp of realPoints) {
      anchors.set(rp.timestamp, rp.odds);
    }

    // Start from a slightly different value to create visual interest
    const startVal = Math.max(5, Math.min(95, (currentOdds[0] ?? 50) + (Math.random() - 0.5) * 20));
    let val = startVal;

    for (let i = 0; i < TOTAL_POINTS; i++) {
      const ts = now - (TOTAL_POINTS - i) * INTERVAL;

      // Check if there's a real anchor near this timestamp (within 1 interval)
      let anchorVal: number | null = null;
      for (const [aTs, aOdds] of anchors) {
        if (Math.abs(aTs - ts) < INTERVAL) {
          anchorVal = aOdds[0] ?? null;
          break;
        }
      }

      if (anchorVal !== null) {
        // Snap to real data
        val = anchorVal;
      } else {
        // Random walk with mean reversion toward current odds
        const target = currentOdds[0] ?? 50;
        const reversion = (target - val) * 0.04; // gentle pull toward current value
        const noise = (Math.random() - 0.5) * 3; // ±1.5%
        val = Math.max(2, Math.min(98, val + reversion + noise));
      }

      const primaryOdds = Math.round(val * 10) / 10;
      const remaining = 100 - primaryOdds;
      const others = outcomeCount > 1
        ? Array.from({ length: outcomeCount - 1 }, (_, j) => {
            // Distribute remaining with slight variation
            const base = remaining / (outcomeCount - 1);
            const jitter = (Math.random() - 0.5) * 2;
            return Math.max(0, Math.round((base + jitter) * 10) / 10);
          })
        : [];

      points.push({
        timestamp: ts,
        odds: [primaryOdds, ...others],
      });
    }

    // Pin final point to current odds
    points.push({ timestamp: now, odds: [...currentOdds] });
    return points;
  }

  // ---------------------------------------------------------------------------
  // Fetch chart data + always enrich with synthetic history
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (heroMarkets.length === 0) return;
    let cancelled = false;

    const fetchCharts = async () => {
      const entries: [string, OddsPoint[]][] = [];

      const results = await Promise.allSettled(
        heroMarkets.map(async (m) => {
          if (chartDataMap[m.address]?.length) return null;
          let realPoints: OddsPoint[] = [];
          try {
            const resp = await apiGet<ChartResponse>(
              `/api/markets/${m.address}/chart`,
            );
            realPoints = resp.points;
          } catch {
            // API failed — no real points, fully synthetic
          }
          // Always generate rich history, merging with real anchors
          const richPoints = generateRichHistory(
            m.odds.map((o) => o),
            realPoints,
            m.outcomeCount,
          );
          return { address: m.address, points: richPoints };
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
              Real-time prediction arena
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
        {/* Chart + Mascot */}
        <div
          className="lg:col-span-7 rounded-xl overflow-hidden relative"
          style={{
            background: "var(--surface, #111)",
            border: "1px solid var(--border, rgba(255,255,255,0.08))",
          }}
        >
          {/* Mascot — large, left side, watching the chart */}
          <img
            src="/mascot.png"
            alt=""
            className="hidden lg:block absolute bottom-0 left-0 z-10 pointer-events-none select-none"
            style={{
              height: "85%",
              maxHeight: 400,
              opacity: 0.12,
              filter: "drop-shadow(0 0 20px rgba(0,0,0,0.5))",
              transform: "scaleX(-1)",
            }}
          />
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

          {/* Quick-bet buttons (single-market mode) */}
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
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: color + "0F",
                      border: `1px solid ${color}25`,
                      color: color,
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
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
            <LiveActivitySidebar markets={markets} />
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

      {/* ---- HOT MARKETS (enhanced cards) ---- */}
      <motion.div
        variants={sectionVariants} initial="hidden" animate="visible" custom={4}
        className="mb-6"
      >
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4" style={{ color: "#ffc828" }} />
          <h2 className="text-lg font-bold text-white">Hot Markets</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {heroMarkets.map((m, i) => {
            const primary = m.odds[0] ?? 50;
            const pool = formatEth(m.totalPool);
            const badge = primary > 65 ? "🔥 trending" : primary < 35 ? "⚡ moving fast" : "💰 active";
            const badgeColor = primary > 65 ? "#ff6400" : primary < 35 ? "#ffc828" : "#00ff88";
            return (
              <a
                key={m.address}
                href={`/markets/${m.address}`}
                className="block rounded-xl p-4 transition-all duration-150 hover:scale-[1.02] market-card-glow"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold line-clamp-1 text-gray-200">{m.question}</span>
                  <span className="text-[10px] font-bold shrink-0 ml-2 px-1.5 py-0.5 rounded-full" style={{ background: badgeColor + "15", color: badgeColor }}>
                    {badge}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <span className="text-2xl font-black tabular" style={{ color: OUTCOME_COLORS[0] }}>{Math.round(primary)}%</span>
                    <span className="text-xs text-gray-500 ml-1">{m.labels[0]}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">{pool} pool</div>
                    <div className="text-[10px] text-gray-600">{m.outcomeCount} outcomes</div>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </motion.div>

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
