"use client";

import React, { useCallback, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { WsBetData, WsServerMessage } from "@rush/shared";
import { OUTCOME_COLORS } from "@rush/shared";
import { useMarket } from "@/hooks/useMarket";
import { useChart } from "@/hooks/useChart";
import { useMarketFeed } from "@/hooks/useMarketFeed";
import InteractiveChart from "@/components/market/InteractiveChart";
import OddsBar from "@/components/market/OddsBar";
import BetForm from "@/components/market/BetForm";
import PositionsPanel from "@/components/market/PositionsPanel";
import ActivityFeed from "@/components/market/ActivityFeed";
import MarketComments from "@/components/market/MarketComments";
import RelatedMarkets from "@/components/market/RelatedMarkets";
import { formatEth, formatDeadline, timeAgo } from "@/lib/format";
import { fadeInUp } from "@/lib/animations";
import { useActivity } from "@/hooks/useActivity";
import { useMarkets } from "@/hooks/useMarkets";
import { ArrowLeft, Clock, Users, Coins, Trophy, Zap, Timer } from "lucide-react";

export default function MarketDetailPage() {
  const params = useParams();
  const address = params.address as string;
  const queryClient = useQueryClient();
  const router = useRouter();

  const { address: userAddress } = useAccount();
  const { data: market, isLoading: marketLoading, error: marketError } = useMarket(address);
  const { data: chartData } = useChart(address);
  const { data: allMarketsData } = useMarkets({ page: 1, pageSize: 20, status: "all" });
  const allMarkets = allMarketsData?.markets ?? [];

  // Last bet received via WS — forwarded to ActivityFeed so the feed doesn't
  // open a second WS connection for the same market.
  const [liveBet, setLiveBet] = useState<(WsBetData & { receivedAt: number }) | null>(null);

  // ---------------------------------------------------------------------------
  // WebSocket: event-driven, zero invalidateQueries
  // WS = source of truth in real-time, REST = snapshot initial + recovery
  // ---------------------------------------------------------------------------
  const handleWsMessage = useCallback(
    (msg: WsServerMessage) => {
      if (msg.type === "odds_update") {
        // Market state: direct cache update
        queryClient.setQueryData(["market", address], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            totalPool: msg.data.totalPool,
            totalPerOutcome: msg.data.totalPerOutcome,
            odds: msg.data.odds,
          };
        });
        // Chart: append point (no refetch)
        queryClient.setQueryData(["chart", address], (old: any) => {
          if (!old?.points) return old;
          return {
            ...old,
            points: [...old.points, { timestamp: Math.floor(Date.now() / 1000), odds: msg.data.odds }],
          };
        });
      }
      if (msg.type === "bet") {
        // Forward to ActivityFeed — single WS subscription per market
        setLiveBet({ ...msg.data, receivedAt: Date.now() });
        // Positions: update locally if it's the current user's bet
        if (userAddress && msg.data.user.toLowerCase() === userAddress.toLowerCase()) {
          queryClient.setQueryData(["positions", address, userAddress], (old: any) => {
            if (!old) return old;
            const idx = msg.data.outcomeIndex;
            const existing = old.positions.find((p: any) => p.outcomeIndex === idx);
            const positions = existing
              ? old.positions.map((p: any) =>
                  p.outcomeIndex === idx
                    ? { ...p, amount: (BigInt(p.amount) + BigInt(msg.data.amount)).toString() }
                    : p
                )
              : [...old.positions, { outcomeIndex: idx, amount: msg.data.amount, label: "" }];
            return {
              ...old,
              positions,
              totalBet: (BigInt(old.totalBet) + BigInt(msg.data.amount)).toString(),
            };
          });
        }
        // Activity feed receives this bet via the `liveBet` prop — it no longer
        // opens its own WS subscription (single WS per market).
      }
      if (msg.type === "status_change") {
        // Market state: direct update
        queryClient.setQueryData(["market", address], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            status: msg.data.status,
            winningOutcome: msg.data.winningOutcome,
            ...(msg.data.status === "resolved" ? { resolvedAt: Math.floor(Date.now() / 1000) } : {}),
          };
        });
        // On resolve, claimable needs on-chain read — only case where refetch is necessary
        if (msg.data.status === "resolved" && userAddress) {
          queryClient.invalidateQueries({ queryKey: ["positions", address, userAddress] });
        }
      }
      if (msg.type === "claim") {
        // If current user claimed, update locally
        if (userAddress && msg.data.user.toLowerCase() === userAddress.toLowerCase()) {
          queryClient.setQueryData(["positions", address, userAddress], (old: any) => {
            if (!old) return old;
            return { ...old, claimed: true, claimable: "0" };
          });
        }
      }
    },
    [address, queryClient, userAddress],
  );

  // On WS reconnect: refetch everything (recovery from missed events)
  const handleReconnect = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["market", address] });
    queryClient.invalidateQueries({ queryKey: ["chart", address] });
    if (userAddress) {
      queryClient.invalidateQueries({ queryKey: ["positions", address, userAddress] });
    }
    queryClient.invalidateQueries({ queryKey: ["activity", address] });
  }, [queryClient, address, userAddress]);

  useMarketFeed(address, handleWsMessage, handleReconnect);

  // Activity data for micro-stats
  const { data: activity } = useActivity(address);

  // Micro-stats: recent bet count + volume
  const microStats = useMemo(() => {
    if (!activity?.bets?.length) return { count: 0, volume: "0", count5m: 0, volume5m: "0", lastBet: null };
    const now = Math.floor(Date.now() / 1000);
    const recent60 = activity.bets.filter((b) => now - b.timestamp < 60);
    const recent5m = activity.bets.filter((b) => now - b.timestamp < 300);
    const vol60 = recent60.reduce((s, b) => s + BigInt(b.amount), BigInt(0));
    const vol5m = recent5m.reduce((s, b) => s + BigInt(b.amount), BigInt(0));
    const last = activity.bets[0] ?? null;
    return {
      count: recent60.length, volume: vol60.toString(),
      count5m: recent5m.length, volume5m: vol5m.toString(),
      lastBet: last,
    };
  }, [activity]);

  // Countdown timer
  const [countdown, setCountdown] = useState("");
  const [urgencyLevel, setUrgencyLevel] = useState<"normal" | "soon" | "warning" | "critical">("normal");

  useEffect(() => {
    if (!market) return;
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = market.deadline - now;
      if (remaining <= 0) { setCountdown("Ended"); setUrgencyLevel("critical"); return; }
      if (remaining < 60) setUrgencyLevel("critical");      // <1min: red + pulse + glow
      else if (remaining < 300) setUrgencyLevel("warning");  // <5min: red
      else if (remaining < 3600) setUrgencyLevel("soon");    // <1h: yellow
      else setUrgencyLevel("normal");

      const d = Math.floor(remaining / 86400);
      const h = Math.floor((remaining % 86400) / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      if (d > 0) setCountdown(`${d}d ${h}h ${m}m`);
      else if (h > 0) setCountdown(`${h}h ${m}m ${s}s`);
      else setCountdown(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [market]);

  // Responsive chart height
  const [chartH, setChartH] = useState(360);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setChartH(mq.matches ? 280 : 360);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Colors (needed by hooks below, safe even when market is null)
  const colors = useMemo(
    () => (market?.labels ?? []).map((_, i) => OUTCOME_COLORS[i % OUTCOME_COLORS.length]),
    [market],
  );

  // Narrative context — dynamic based on activity + odds
  const narrative = useMemo(() => {
    if (!market) return "";
    const lead = market.odds[0] ?? 50;
    const leadLabel = market.labels[0] ?? "Yes";
    const hasRecentActivity = (activity?.bets?.length ?? 0) > 2;

    if (hasRecentActivity && Math.abs(lead - 50) < 15)
      return "Momentum is shifting fast. The next bet could change everything.";
    if (hasRecentActivity && lead > 60)
      return `${leadLabel} is gaining momentum after recent bets. Will it hold?`;
    if (lead > 75)
      return `${leadLabel} is dominating with ${Math.round(lead)}% probability. Strong conviction.`;
    if (lead > 60)
      return `${leadLabel} is leading at ${Math.round(lead)}%. Still room for a shift.`;
    if (lead > 40)
      return "The market is split — anything can happen. Place your bet before it moves.";
    return `${leadLabel} is trailing at ${Math.round(lead)}%. Contrarian opportunity?`;
  }, [market, activity]);

  // Chart annotations — big bets
  const chartAnnotations = useMemo(() => {
    if (!activity?.bets?.length || !market) return [];
    const poolWei = BigInt(market.totalPool || "0");
    const threshold = poolWei > BigInt(0) ? poolWei / BigInt(50) : BigInt(0);
    const minAmount = BigInt("50000000000000000"); // 0.05 ETH
    return activity.bets
      .filter((b) => {
        const amt = BigInt(b.amount);
        return amt >= threshold || amt >= minAmount;
      })
      .slice(0, 8)
      .map((b) => ({
        timestamp: b.timestamp,
        label: `+${formatEth(b.amount)}`,
        color: colors[b.outcomeIndex] ?? "#ffc828",
      }));
  }, [activity, market, colors]);

  // Counter markets → redirect to dedicated counter layout
  useEffect(() => {
    if (market?.marketType === "counter") {
      router.replace(`/markets/${address}/counter`);
    }
  }, [market?.marketType, router, address]);

  // Loading skeleton
  if (marketLoading) {
    return (
      <div className="animate-fade-in-up">
        <div className="mb-6">
          <div className="skeleton h-4 w-16 mb-4" />
          <div className="skeleton h-8 w-3/4 mb-2" />
          <div className="skeleton h-4 w-1/2" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-4">
            <div className="skeleton h-[280px] w-full rounded-xl" />
            <div className="skeleton h-12 w-full rounded-xl" />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <div className="skeleton h-40 w-full rounded-xl" />
            <div className="skeleton h-32 w-full rounded-xl" />
            <div className="skeleton h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (marketError || !market) {
    return (
      <div className="py-12 text-center">
        <p className="text-lg font-bold text-red-400">Market not found</p>
        <p className="mt-2 text-sm text-gray-500">
          {marketError instanceof Error ? marketError.message : "This market doesn't exist or couldn't be loaded."}
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-1 text-sm font-bold"
          style={{ color: "var(--primary)" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to markets
        </Link>
      </div>
    );
  }

  const statusBadge = () => {
    switch (market.status) {
      case "open":
        return (
          <span
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase"
            style={{
              background: "rgba(0,255,136,0.1)",
              color: "#00ff88",
              border: "1px solid rgba(0,255,136,0.2)",
            }}
          >
            <span className="live-dot-green" style={{ width: 6, height: 6 }} />
            LIVE
          </span>
        );
      case "resolved":
        return (
          <span
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase"
            style={{
              background: "rgba(80,120,255,0.1)",
              color: "#5078ff",
              border: "1px solid rgba(80,120,255,0.2)",
            }}
          >
            <Trophy className="h-3 w-3" />
            RESOLVED
          </span>
        );
      default:
        return (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase"
            style={{
              background: "rgba(255,255,255,0.05)",
              color: "#666",
              border: "1px solid var(--border)",
            }}
          >
            {market.status.toUpperCase()}
          </span>
        );
    }
  };

  const heroColor = colors[0] ?? "#00ff88";

  return (
    <motion.div {...fadeInUp}>
      {/* Hero gradient background */}
      <div
        className="rounded-2xl mb-6 -mx-4 px-4 pt-6 pb-1"
        style={{
          background: `linear-gradient(180deg, ${heroColor}0a 0%, transparent 220px)`,
        }}
      >
      {/* Back link + header */}
      <div className="mb-6">
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-gray-500 transition-colors hover:text-gray-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Markets
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-black leading-tight text-white sm:text-2xl">
            {market.question}
          </h1>
          {statusBadge()}
        </div>

        {/* Narrative context */}
        <p className="mt-2 text-sm italic text-gray-400">
          {narrative}
        </p>

        {/* Market metadata */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Coins className="h-3.5 w-3.5" />
            {formatEth(market.totalPool)} pool
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {market.outcomeCount} outcomes
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatDeadline(market.deadline)}
          </span>
          {market.resolvedAt && (
            <span className="flex items-center gap-1">
              <Trophy className="h-3.5 w-3.5" />
              Resolved {timeAgo(market.resolvedAt)}
            </span>
          )}
        </div>

        {/* Winning outcome banner */}
        {market.status === "resolved" && market.winningOutcome !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-4 rounded-lg p-3 result-reveal-flash"
            style={{
              background: `${colors[market.winningOutcome]}10`,
              border: `1px solid ${colors[market.winningOutcome]}30`,
            }}
          >
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5" style={{ color: colors[market.winningOutcome] }} />
              <span className="text-sm font-bold" style={{ color: colors[market.winningOutcome] }}>
                Winner: {market.labels[market.winningOutcome]}
              </span>
            </div>
          </motion.div>
        )}
      </div>

      </div>{/* end hero gradient */}

      {/* Countdown + Micro-stats bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Countdown — only show urgency mode when <24h, else minimal */}
        {market.status === "open" && (market.deadline - Math.floor(Date.now() / 1000)) < 86400 && (
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2 font-bold tabular ${urgencyLevel === "critical" ? "starting-soon-pulse" : ""}`}
            style={{
              fontSize: urgencyLevel === "critical" ? 18 : 14,
              background: urgencyLevel === "critical" ? "rgba(255,68,68,0.15)"
                : urgencyLevel === "warning" ? "rgba(255,68,68,0.08)"
                : urgencyLevel === "soon" ? "rgba(255,200,40,0.06)"
                : "rgba(255,255,255,0.04)",
              border: `1px solid ${
                urgencyLevel === "critical" ? "rgba(255,68,68,0.5)"
                : urgencyLevel === "warning" ? "rgba(255,68,68,0.25)"
                : urgencyLevel === "soon" ? "rgba(255,200,40,0.2)"
                : "var(--border)"}`,
              color: urgencyLevel === "critical" ? "#ff4444"
                : urgencyLevel === "warning" ? "#ff4444"
                : urgencyLevel === "soon" ? "#ffc828"
                : "#ccc",
              boxShadow: urgencyLevel === "critical" ? "0 0 20px rgba(255,68,68,0.3)" : "none",
            }}
          >
            <Timer className="h-4 w-4" />
            {countdown === "Ended" ? "Market ended" : `Ends in ${countdown}`}
          </div>
        )}

        {/* Micro-stats — show 60s if active, else 5min */}
        {(microStats.count > 0 || microStats.count5m > 0) && (
          <div className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.12)" }}>
            <Zap className="h-3.5 w-3.5" style={{ color: "#00ff88" }} />
            {microStats.count > 0 ? (
              <>
                <span className="text-gray-300">{microStats.count} bets</span>
                <span className="text-gray-600">&middot;</span>
                <span className="font-bold" style={{ color: "#00ff88" }}>{formatEth(microStats.volume)}</span>
                <span className="text-gray-500">in last 60s</span>
              </>
            ) : (
              <>
                <span className="text-gray-300">{microStats.count5m} bets</span>
                <span className="text-gray-600">&middot;</span>
                <span className="font-bold" style={{ color: "#00ff88" }}>{formatEth(microStats.volume5m)}</span>
                <span className="text-gray-500">in last 5m</span>
              </>
            )}
          </div>
        )}

        {/* Last bet — impact language */}
        {microStats.lastBet && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="font-bold text-gray-300">{formatEth(microStats.lastBet.amount)}</span>
            <span>bet on</span>
            <span className="font-bold" style={{ color: colors[microStats.lastBet.outcomeIndex] ?? "#ccc" }}>
              {market.labels[microStats.lastBet.outcomeIndex] ?? "?"}
            </span>
            <span>&middot;</span>
            <span className="italic text-gray-400">shifted odds</span>
            <span>&middot;</span>
            <span>{timeAgo(microStats.lastBet.timestamp)}</span>
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left column: Chart + Quick Bet + OddsBar */}
        <div className="lg:col-span-3 space-y-4">
          {/* Chart */}
          <div
            className="overflow-hidden rounded-xl"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <InteractiveChart
              points={chartData?.points ?? []}
              labels={market.labels}
              colors={colors}
              annotations={chartAnnotations}
              height={chartH}
              defaultTimeRange="1D"
            />
          </div>

          {/* Quick YES/NO buttons (binary markets only) */}
          {market.outcomeCount === 2 && market.status === "open" && (
            <div className="grid grid-cols-2 gap-3">
              {market.labels.map((label, i) => {
                const pct = Math.round(market.odds[i] ?? 50);
                const multiplier = pct > 0 ? (100 / pct).toFixed(1) : "---";
                const btnColor = i === 0 ? "#3B82F6" : "#EF4444";
                return (
                  <button
                    key={i}
                    onClick={() => {
                      const el = document.getElementById("bet-form");
                      if (el) el.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="flex flex-col items-center justify-center rounded-xl py-4 transition-all duration-150 hover:scale-[1.03] active:scale-[0.97] cursor-pointer"
                    style={{
                      background: btnColor + "12",
                      border: `2px solid ${btnColor}40`,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = `0 0 24px ${btnColor}30`;
                      (e.currentTarget as HTMLElement).style.borderColor = btnColor + "80";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = "none";
                      (e.currentTarget as HTMLElement).style.borderColor = btnColor + "40";
                    }}
                    onTouchStart={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = `0 0 24px ${btnColor}30`;
                      (e.currentTarget as HTMLElement).style.borderColor = btnColor + "80";
                    }}
                    onTouchEnd={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = "none";
                      (e.currentTarget as HTMLElement).style.borderColor = btnColor + "40";
                    }}
                  >
                    <span className="text-xs font-medium text-gray-400">{label}</span>
                    <span className="text-3xl font-black tabular" style={{ color: btnColor }}>{pct}%</span>
                    <span className="text-xs font-bold mt-0.5" style={{ color: btnColor + "aa" }}>
                      Win ~{multiplier}x
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pool breakdown */}
          <div className="card p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
              Pool Breakdown
            </h3>
            <div className="space-y-2">
              {market.labels.map((label, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: colors[i] }}
                    />
                    <span className="text-xs text-gray-400">{label}</span>
                  </div>
                  <span className="text-xs font-bold tabular text-gray-300">
                    {formatEth(market.totalPerOutcome[i] ?? "0")}
                  </span>
                </div>
              ))}
              <div className="border-t border-[var(--border)] pt-2 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400">Total Pool</span>
                <span className="text-xs font-bold tabular" style={{ color: "var(--primary)" }}>
                  {formatEth(market.totalPool)}
                </span>
              </div>
            </div>
          </div>

          {/* Community comments */}
          <MarketComments
            market={market}
            labels={market.labels}
            colors={colors}
          />
        </div>

        {/* Right column: BetForm + Positions + Activity */}
        <div className="lg:col-span-2 space-y-4">
          <div id="bet-form">
            <BetForm
              marketAddress={address}
              labels={market.labels}
              odds={market.odds}
              status={market.status}
              totalPool={market.totalPool}
              totalPerOutcome={market.totalPerOutcome}
            />
          </div>

          <PositionsPanel
            marketAddress={address}
            labels={market.labels}
            status={market.status}
            winningOutcome={market.winningOutcome}
          />

          <ActivityFeed
            marketAddress={address}
            labels={market.labels}
            liveBet={liveBet}
          />
        </div>
      </div>

      {/* Related markets -- full width */}
      {allMarkets.length > 0 && (
        <RelatedMarkets
          currentAddress={address}
          markets={allMarkets}
        />
      )}
    </motion.div>
  );
}
