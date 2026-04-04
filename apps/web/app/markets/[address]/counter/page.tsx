"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Clock, TrendingUp, Zap, AlertTriangle, Target, Users } from "lucide-react";
import MarketComments from "@/components/market/MarketComments";
import RelatedMarkets from "@/components/market/RelatedMarkets";
import BetForm from "@/components/market/BetForm";
import { useMarket } from "@/hooks/useMarket";
import { useMarkets } from "@/hooks/useMarkets";
import { useMarketFeed } from "@/hooks/useMarketFeed";
import type { WsServerMessage } from "@rush/shared";

const THRESHOLD = 20;

interface Tweet {
  id: string;
  text: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
}

export default function CounterMarketPage() {
  const params = useParams();
  const MARKET_ADDR = (params.address as string)?.toLowerCase() ?? "";
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [last24hCount, setLast24hCount] = useState(0);
  const [period, setPeriod] = useState("today");
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("");
  const [countdown, setCountdown] = useState("");
  const [hoursLeft, setHoursLeft] = useState(24);
  const [prevCount, setPrevCount] = useState(0);
  const [newTweetFlash, setNewTweetFlash] = useState(false);
  const [plusOneVisible, setPlusOneVisible] = useState(false);
  const [startTime] = useState(Date.now());
  const feedRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<{ date: string; count: number; hit: boolean }[]>([]);
  const [streak, setStreak] = useState(0);
  const [hourly, setHourly] = useState<number[]>(new Array(24).fill(0));
  const [recentCount, setRecentCount] = useState(0);
  const [lastTweetTime, setLastTweetTime] = useState<string | null>(null);

  const [showBetForm, setShowBetForm] = useState(false);
  const activeCount = period === "today" ? todayCount : last24hCount;

  // Real market data for comments + related
  const { data: marketData } = useMarket(MARKET_ADDR);
  const { data: allMarketsData } = useMarkets({ page: 1, pageSize: 20, status: "all" });
  const allMarkets = allMarketsData?.markets ?? [];

  // Derive target info from market data
  const sourceConfig = (marketData as any)?.sourceConfig as Record<string, any> | undefined;
  const twitterTarget = sourceConfig?.target ?? 'unknown';
  const keyword = sourceConfig?.keyword as string | undefined;
  const threshold = (sourceConfig?.threshold as number) ?? THRESHOLD;
  const marketQuestion = marketData?.question ?? `Will @${twitterTarget} hit threshold?`;
  const avatarMap: Record<string, string> = {
    'aixbt_agent': '/aixbt-avatar.jpg',
    'jessepollak': '/jesse-avatar.jpg',
  };
  const avatarSrc = avatarMap[twitterTarget] ?? '/logo.png';

  // Pace & projection
  const pace = useMemo(() => {
    const elapsed = (Date.now() - startTime) / 1000 / 60; // minutes since page load
    const hoursPassed = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
    const effectiveHours = Math.max(0.5, hoursPassed);
    const tweetsPerHour = activeCount / effectiveHours;
    const projected = Math.round(tweetsPerHour * 24);
    const remaining = threshold - activeCount;
    const hoursRemaining = hoursLeft;
    const neededPerHour = remaining > 0 && hoursRemaining > 0 ? remaining / hoursRemaining : 0;

    let status: "ahead" | "on_track" | "behind" | "hit" = "behind";
    if (activeCount >= threshold) status = "hit";
    else if (projected >= threshold * 1.2) status = "ahead";
    else if (projected >= threshold * 0.8) status = "on_track";

    return { tweetsPerHour, projected, remaining, neededPerHour, status };
  }, [activeCount, hoursLeft, startTime, threshold]);

  // Fetch
  const fetchTweets = useCallback(async () => {
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const res = await fetch(`${API}/api/markets/${MARKET_ADDR}/counter`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const newCount = data.currentCount ?? 0;

      if (newCount > activeCount && activeCount > 0) {
        setNewTweetFlash(true);
        setPlusOneVisible(true);
        setTimeout(() => setNewTweetFlash(false), 2000);
        setTimeout(() => setPlusOneVisible(false), 1500);
        setTimeout(() => { feedRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }, 300);
      }

      setPrevCount(activeCount);
      setTodayCount(newCount);
      setLast24hCount(newCount);
      setPeriod("today");
      // Timeline from counter endpoint
      const tl = (data.timeline ?? []) as { hour: number; count: number }[];
      setHourly(tl.length === 24 ? tl.map((t: { count: number }) => t.count) : new Array(24).fill(0));
      setRecentCount(0); // counter endpoint doesn't have this yet
      setLastTweetTime(data.lastEventAt > 0 ? new Date(data.lastEventAt * 1000).toISOString() : null);
      // Tweets from counter endpoint
      setTweets((data.tweets ?? []).map((t: any) => ({
        id: t.id ?? "",
        text: t.text ?? "",
        createdAt: t.createdAt ?? "",
        likeCount: t.likeCount ?? 0,
        retweetCount: t.retweetCount ?? 0,
      })));
      setLastUpdate(new Date().toLocaleTimeString());
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [activeCount]);

  // Initial fetch + WS for real-time counter updates (no polling)
  useEffect(() => {
    fetchTweets();
  }, [fetchTweets]);

  // Subscribe to WS counter_update events
  const handleWsMessage = useCallback((msg: WsServerMessage) => {
    if (msg.type === "counter_update") {
      const d = msg.data;
      // Update count from WS payload
      if (d.currentCount > activeCount && activeCount > 0) {
        setNewTweetFlash(true);
        setPlusOneVisible(true);
        setTimeout(() => setNewTweetFlash(false), 2000);
        setTimeout(() => setPlusOneVisible(false), 1500);
        setTimeout(() => { feedRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }, 300);
      }
      setPrevCount(activeCount);
      setTodayCount(d.currentCount);
      setLast24hCount(d.currentCount);
      setLastUpdate(new Date().toLocaleTimeString());
      // Fetch full tweet text on new tweets (WS doesn't include tweet text)
      if (d.delta > 0) fetchTweets();
    }
  }, [activeCount, fetchTweets]);

  useMarketFeed(MARKET_ADDR, handleWsMessage);

  // Countdown — uses market deadline, not midnight
  const marketDeadline = marketData?.deadline ?? 0;
  useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = Math.max(0, (marketDeadline || Math.floor(Date.now() / 1000) + 86400) - now);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setCountdown(diff <= 0 ? "Ended" : `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`);
      setHoursLeft(diff / 3600);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  // Dynamic odds
  const dynamicYes = activeCount >= threshold ? 95 : Math.min(92, 25 + (pace.projected / threshold) * 50);
  const dynamicNo = 100 - dynamicYes;
  const progress = Math.min(100, (activeCount / threshold) * 100);

  // Clutch zone
  const isClutch = activeCount >= threshold - 5 && activeCount < threshold;
  const isHit = activeCount >= threshold;

  // Narrative
  const narrative = useMemo(() => {
    if (isHit) return "🎉 threshold HIT — YES wins";
    if (isClutch && pace.status !== "behind") return `🔥 ${threshold - activeCount} to go — pace is hot`;
    if (isClutch) return `⚠️ ${threshold - activeCount} to go — needs ${pace.neededPerHour.toFixed(1)}/hr`;
    if (recentCount >= 3) return `🔥 ${recentCount} tweets in 30 min — momentum building`;
    if (pace.status === "ahead") return `📈 Ahead — projected ${pace.projected}`;
    if (pace.status === "on_track") return "⚡ On track — every tweet counts";
    if (activeCount === 0) return "🕐 Waiting for first tweet...";
    if (hoursLeft < 6) return `⏳ ${Math.ceil(hoursLeft)}h left — needs ${pace.remaining} more`;
    return `📊 Behind — needs ${pace.remaining} in ${Math.ceil(hoursLeft)}h`;
  }, [activeCount, pace, isClutch, isHit, hoursLeft]);

  const paceColor = pace.status === "hit" ? "#00ff88" : pace.status === "ahead" ? "#00ff88" : pace.status === "on_track" ? "#ffc828" : "#ff4444";

  return (
    <div className={newTweetFlash ? "bet-flash" : ""}>
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-300">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Markets
      </Link>

      {/* Header */}
      <div className="mb-6 rounded-2xl p-6" style={{ background: "linear-gradient(180deg, rgba(29,155,240,0.08) 0%, transparent 200px)" }}>
        <div className="flex items-center gap-3 mb-2">
          <img src={avatarSrc} alt={twitterTarget} className="h-12 w-12 rounded-xl" style={{ border: "2px solid rgba(29,155,240,0.3)" }} />
          <div className="flex-1">
            <h1 className="text-xl font-black text-white sm:text-2xl">
              {marketQuestion}
            </h1>
            <p className="text-sm italic text-gray-400 mt-1">{narrative}</p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold tabular" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "#ccc" }}>
            <Clock className="h-3.5 w-3.5" />
            {countdown}
          </div>
          <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: paceColor + "10", border: `1px solid ${paceColor}30`, color: paceColor }}>
            <TrendingUp className="h-3.5 w-3.5" />
            {pace.tweetsPerHour.toFixed(1)}/hr · Projected: {pace.projected}
          </div>
          <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: paceColor }}>
            <Target className="h-3.5 w-3.5" />
            {pace.status === "hit" ? "✅ HIT" : pace.status === "ahead" ? "Ahead" : pace.status === "on_track" ? "On Track" : "Behind"}
          </div>
          {lastUpdate && <span className="text-[10px] text-gray-600">Updated {lastUpdate}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left */}
        <div className="lg:col-span-3 space-y-4">

          {/* BIG COUNTER */}
          <div
            className={`card p-6 text-center relative overflow-hidden ${isHit ? "neon-glow" : isClutch ? "neon-glow-danger" : ""}`}
            style={{
              transition: "box-shadow 0.3s, border-color 0.3s",
              boxShadow: newTweetFlash ? "0 0 30px rgba(0,255,136,0.2), inset 0 0 30px rgba(0,255,136,0.03)" : "none",
              borderColor: newTweetFlash ? "rgba(0,255,136,0.3)" : undefined,
            }}
          >
            {/* Countdown prominent */}
            <div className="absolute top-3 right-4 text-right">
              <div className="text-[9px] uppercase tracking-wider text-gray-600">Time left</div>
              <div className="text-lg font-black tabular" style={{ color: hoursLeft < 3 ? "#ff4444" : hoursLeft < 8 ? "#ffc828" : "#666" }}>
                {countdown}
              </div>
            </div>

            {/* +1 animation */}
            <AnimatePresence>
              {plusOneVisible && (
                <motion.div
                  initial={{ opacity: 1, y: 0, scale: 1 }}
                  animate={{ opacity: 0, y: -60, scale: 1.5 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.2 }}
                  className="absolute top-4 right-8 text-2xl font-black z-20"
                  style={{ color: "#00ff88" }}
                >
                  +1
                </motion.div>
              )}
            </AnimatePresence>

            <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
              @{twitterTarget} {keyword ? `"${keyword}"` : "tweets"} {period === "today" ? "today" : "last 24h"}
            </div>

            <motion.div
              key={activeCount}
              initial={{ scale: 1.4, color: "#00ff88" }}
              animate={{ scale: 1, color: isHit ? "#00ff88" : "#ffffff" }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
              className="text-8xl font-black tabular"
            >
              {loading ? "..." : activeCount}
            </motion.div>

            <div className="text-sm text-gray-500 mt-1">
              / {threshold} needed for <span style={{ color: "#3B82F6" }}>Yes</span>
              {period !== "today" && <span className="text-gray-600 ml-2">(last 24h)</span>}
            </div>

            {/* Clutch message */}
            {isClutch && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex items-center justify-center gap-2 text-sm font-bold starting-soon-pulse"
                style={{ color: "#ff4444" }}
              >
                <AlertTriangle className="h-4 w-4" />
                {threshold - activeCount} to go — needs {Math.ceil(pace.neededPerHour * 10) / 10}/hr
              </motion.div>
            )}

            {isHit && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-3 text-lg font-black"
                style={{ color: "#00ff88" }}
              >
                ✅ threshold HIT!
              </motion.div>
            )}

            {/* Smart progress bar */}
            <div className={`mt-4 h-4 rounded-full overflow-hidden relative ${newTweetFlash ? "neon-glow" : ""}`} style={{ background: "rgba(255,255,255,0.06)", transition: "box-shadow 0.3s" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{
                  background: isHit
                    ? "linear-gradient(90deg, #00ff88, #10B981)"
                    : progress > 75
                    ? "linear-gradient(90deg, #ff4444, #ffc828, #00ff88)"
                    : progress > 50
                    ? "linear-gradient(90deg, #ffc828, #00ff88)"
                    : "linear-gradient(90deg, #3B82F6, #00ff88)",
                }}
              />
              {/* Threshold marker */}
              <div className="absolute top-0 bottom-0 w-0.5" style={{ left: "100%", background: "rgba(255,255,255,0.3)", transform: "translateX(-2px)" }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-600 mt-1">
              <span>0</span>
              <span className="font-bold" style={{ color: progress > 50 ? "#ffc828" : "#666" }}>
                {isHit ? "🎯 Complete!" : `${threshold - activeCount} remaining`}
              </span>
              <span>{threshold}</span>
            </div>

            {/* Pace stats */}
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="text-[10px] text-gray-500">Rate</div>
                <div className="text-sm font-bold tabular" style={{ color: paceColor }}>{pace.tweetsPerHour.toFixed(1)}/hr</div>
              </div>
              <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="text-[10px] text-gray-500">Projected</div>
                <div className="text-sm font-bold tabular" style={{ color: pace.projected >= threshold ? "#00ff88" : "#ff4444" }}>{pace.projected}</div>
              </div>
              <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="text-[10px] text-gray-500">Need/hr</div>
                <div className="text-sm font-bold tabular" style={{ color: pace.neededPerHour <= pace.tweetsPerHour ? "#00ff88" : "#ff4444" }}>
                  {pace.remaining <= 0 ? "—" : pace.neededPerHour.toFixed(1)}
                </div>
              </div>
            </div>

            {/* YES/NO — right after counter for impulse */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <motion.button
                whileHover={{ scale: 1.04, boxShadow: "0 0 30px rgba(59,130,246,0.35)" }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowBetForm(true)}
                className="rounded-xl py-4 text-center cursor-pointer"
                style={{ background: "#3B82F618", border: "2px solid #3B82F660", transition: "all 0.15s" }}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Bet Yes</div>
                <motion.div key={`y${Math.round(dynamicYes)}`} initial={{ scale: 1.2, color: "#60a5fa" }} animate={{ scale: 1, color: "#3B82F6" }} className="text-3xl font-black tabular">
                  {Math.round(dynamicYes)}%
                </motion.div>
                <div className="text-xs font-bold mt-0.5" style={{ color: "#3B82F6" }}>Win ~{(100 / dynamicYes).toFixed(1)}x</div>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.04, boxShadow: "0 0 30px rgba(239,68,68,0.35)" }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowBetForm(true)}
                className="rounded-xl py-4 text-center cursor-pointer"
                style={{ background: "#EF444418", border: "2px solid #EF444460", transition: "all 0.15s" }}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Bet No</div>
                <motion.div key={`n${Math.round(dynamicNo)}`} initial={{ scale: 1.2, color: "#f87171" }} animate={{ scale: 1, color: "#EF4444" }} className="text-3xl font-black tabular">
                  {Math.round(dynamicNo)}%
                </motion.div>
                <div className="text-xs font-bold mt-0.5" style={{ color: "#EF4444" }}>Win ~{(100 / dynamicNo).toFixed(1)}x</div>
              </motion.button>
            </div>
            <div className="mt-2 text-center text-[10px] text-gray-600 flex items-center justify-center gap-1.5">
              <Users className="h-3 w-3" />
              {dynamicYes > 60 ? "Most bettors are on YES" : dynamicNo > 60 ? "Most bettors are on NO" : "Market is split — your bet could tip it"}
            </div>

            {/* Bet Form — shown after clicking YES/NO */}
            <AnimatePresence>
              {showBetForm && marketData && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 overflow-hidden"
                >
                  <BetForm
                    marketAddress={MARKET_ADDR}
                    labels={marketData.labels ?? ["Yes", "No"]}
                    odds={marketData.odds ?? [50, 50]}
                    status={marketData.status ?? "open"}
                    totalPool={marketData.totalPool}
                    totalPerOutcome={marketData.totalPerOutcome}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Recent activity + last tweet */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs">
                  <Zap className="h-3.5 w-3.5" style={{ color: "#ffc828" }} />
                  <span className="font-bold" style={{ color: recentCount > 3 ? "#00ff88" : recentCount > 0 ? "#ffc828" : "#666" }}>
                    {recentCount} tweets
                  </span>
                  <span className="text-gray-500">in last 30 min</span>
                </div>
              </div>
              {lastTweetTime && (
                <div className="text-[10px] text-gray-500">
                  Last tweet: {(() => {
                    const diff = Math.floor((Date.now() - new Date(lastTweetTime).getTime()) / 1000);
                    if (diff < 60) return `${diff}s ago`;
                    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                    return `${Math.floor(diff / 3600)}h ago`;
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* Timeline — hourly distribution */}
          <div className="card p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Today&apos;s Timeline (UTC)</h3>
            <div className="flex items-end gap-[2px] h-10">
              {hourly.map((count, h) => {
                const maxH = Math.max(...hourly, 1);
                const barH = count > 0 ? Math.max(4, (count / maxH) * 40) : 2;
                const currentHour = new Date().getUTCHours();
                const isPast = h <= currentHour;
                return (
                  <div
                    key={h}
                    className="flex-1 rounded-sm transition-all"
                    title={`${h}:00 UTC — ${count} tweets`}
                    style={{
                      height: barH,
                      background: count > 0
                        ? (h === currentHour ? "#00ff88" : "#3B82F6")
                        : isPast ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                      opacity: isPast ? 1 : 0.3,
                    }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[8px] text-gray-600 mt-1">
              <span>0h</span>
              <span>6h</span>
              <span>12h</span>
              <span>18h</span>
              <span>24h</span>
            </div>
          </div>

          {/* History — last days */}
          {history.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">History</h3>
                {streak > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,255,136,0.1)", color: "#00ff88" }}>
                    🔥 {streak}-day streak
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {history.slice(0, 5).map((day) => {
                  const date = new Date(day.date + "T00:00:00Z");
                  const label = day.date === new Date(Date.now() - 86400000).toISOString().slice(0, 10)
                    ? "Yesterday"
                    : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                  const pct = Math.min(100, (day.count / threshold) * 100);
                  return (
                    <div key={day.date} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-20 shrink-0">{label}</span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: day.hit ? "#00ff88" : pct > 50 ? "#ffc828" : "#3B82F6" }} />
                      </div>
                      <span className="text-[10px] font-bold tabular w-8 text-right" style={{ color: day.hit ? "#00ff88" : "#888" }}>
                        {day.count}
                      </span>
                      <span className="text-[10px] w-4">{day.hit ? "✅" : "❌"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* odds moved inside counter card above */}
        </div>

        {/* Right: Tweet feed */}
        <div className="lg:col-span-2">
          <div className="card p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-gray-300 mb-3">
              <img src={avatarSrc} alt="" className="h-5 w-5 rounded-full" />
              Live Feed
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              <span className="text-[10px] text-gray-600 font-normal ml-auto">{activeCount} tweets</span>
            </h3>

            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 w-full rounded-lg" />)}</div>
            ) : tweets.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-8">Waiting for first tweet...</p>
            ) : (
              <div ref={feedRef} className="space-y-2 max-h-[520px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {tweets.map((tweet, i) => (
                  <motion.div
                    key={tweet.id}
                    initial={i === 0 ? { opacity: 0, x: -16, scale: 0.98 } : false}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className={`rounded-lg p-3 ${i === 0 ? "bet-flash" : ""}`}
                    style={{ border: i === 0 ? "1px solid rgba(0,255,136,0.2)" : "1px solid var(--border)" }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] font-bold shrink-0 rounded px-1.5 py-0.5 flex items-center gap-1" style={{ background: "rgba(0,255,136,0.08)", color: "#00ff88" }}>
                        ✅ #{activeCount - i}
                      </span>
                      <p className="text-xs text-gray-300 leading-relaxed line-clamp-3">{tweet.text}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-600 pl-7">
                      <span>❤ {tweet.likeCount}</span>
                      <span>🔁 {tweet.retweetCount}</span>
                      <span>{new Date(tweet.createdAt).toLocaleTimeString()}</span>
                      <span className="italic text-gray-700">counted</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comments */}
      {marketData && (
        <div className="mt-6">
          <MarketComments
            market={marketData}
            labels={marketData.labels}
            colors={["#3B82F6", "#EF4444"]}
          />
        </div>
      )}

      {/* Related Markets */}
      {allMarkets.length > 0 && (
        <div className="mt-6">
          <RelatedMarkets currentAddress={MARKET_ADDR} markets={allMarkets} />
        </div>
      )}
    </div>
  );
}
