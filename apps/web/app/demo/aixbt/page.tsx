"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Twitter, Zap, Clock, TrendingUp } from "lucide-react";
import { OUTCOME_COLORS } from "@rush/shared";

// Mock market data (not on-chain)
const MOCK_MARKET = {
  question: "Will @aixbt_agent post more than 20 tweets today?",
  labels: ["Yes (20+)", "No (under 20)"],
  deadline: Math.floor(new Date().setUTCHours(23, 59, 59, 999) / 1000),
  pool: "0.000",
  odds: [65, 35],
};

interface Tweet {
  id: string;
  text: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
}

export default function AixbtDemoPage() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [last24hCount, setLast24hCount] = useState(0);
  const [period, setPeriod] = useState("today");
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [countdown, setCountdown] = useState("");
  const [prevCount, setPrevCount] = useState(0);
  const [flashCount, setFlashCount] = useState(false);

  // Fetch tweets from our API proxy
  const fetchTweets = useCallback(async () => {
    try {
      const res = await fetch("/api/aixbt-tweets");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTweets(data.tweets);
      setPrevCount(todayCount);
      setTodayCount(data.todayCount);
      setLast24hCount(data.last24hCount ?? data.todayCount);
      setPeriod(data.period ?? "today");
      setLastUpdate(new Date().toLocaleTimeString());
      setLoading(false);

      if (data.todayCount > todayCount && todayCount > 0) {
        setFlashCount(true);
        setTimeout(() => setFlashCount(false), 1500);
      }
    } catch {
      setLoading(false);
    }
  }, [todayCount]);

  // Poll every 30 seconds
  useEffect(() => {
    fetchTweets();
    const iv = setInterval(fetchTweets, 30000);
    return () => clearInterval(iv);
  }, [fetchTweets]);

  // Countdown to midnight UTC
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setUTCHours(23, 59, 59, 999);
      const diff = Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setCountdown(`${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  // Dynamic odds based on current count
  const threshold = 20;
  const activeCount = period === "today" ? todayCount : last24hCount;
  const progress = Math.min(100, (activeCount / threshold) * 100);
  const dynamicYes = activeCount >= threshold ? 95 : Math.min(90, 30 + (activeCount / threshold) * 60);
  const dynamicNo = 100 - dynamicYes;

  return (
    <div>
      {/* Back */}
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-300">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Markets
      </Link>

      {/* Header */}
      <div className="mb-6 rounded-2xl p-6" style={{ background: "linear-gradient(180deg, rgba(29,155,240,0.08) 0%, transparent 200px)" }}>
        <div className="flex items-center gap-3 mb-2">
          <img
            src="/aixbt-avatar.jpg"
            alt="aixbt"
            className="h-12 w-12 rounded-xl"
            style={{ border: "2px solid rgba(29,155,240,0.3)" }}
          />
          <div>
            <h1 className="text-xl font-black text-white sm:text-2xl">
              {MOCK_MARKET.question}
            </h1>
            <p className="text-sm italic text-gray-400 mt-1">
              {todayCount >= 15
                ? "AIXBT is on fire today. Almost at the threshold!"
                : todayCount >= 10
                ? "Steady posting pace. Will it accelerate?"
                : "Quiet day so far. Can AIXBT catch up?"}
            </p>
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mt-3">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Ends in {countdown}
          </span>
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            Demo market (not on-chain)
          </span>
          {lastUpdate && (
            <span className="text-gray-600">Updated {lastUpdate}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Counter + Progress + Odds */}
        <div className="lg:col-span-3 space-y-4">

          {/* Big counter */}
          <div className="card p-6 text-center">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
              @aixbt_agent tweets {period === "today" ? "today" : "last 24h"}
            </div>
            <motion.div
              key={period === "today" ? todayCount : last24hCount}
              initial={{ scale: 1.3, color: "#00ff88" }}
              animate={{ scale: 1, color: "#ffffff" }}
              transition={{ duration: 0.5 }}
              className={`text-7xl font-black tabular ${flashCount ? "neon-green" : ""}`}
            >
              {loading ? "..." : period === "today" ? todayCount : last24hCount}
            </motion.div>
            <div className="text-sm text-gray-500 mt-2">
              / {threshold} needed for <span style={{ color: "#00ff88" }}>Yes</span>
              {period !== "today" && <span className="text-gray-600 ml-2">(showing last 24h)</span>}
            </div>

            {/* Progress bar */}
            <div className="mt-4 h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{
                  background: progress >= 100
                    ? "linear-gradient(90deg, #00ff88, #10B981)"
                    : progress > 70
                    ? "linear-gradient(90deg, #ffc828, #00ff88)"
                    : "linear-gradient(90deg, #3B82F6, #00ff88)",
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-600 mt-1">
              <span>0</span>
              <span>{threshold} tweets</span>
            </div>
          </div>

          {/* Mock odds */}
          <div className="card p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
              Implied Odds (simulated)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-4 text-center" style={{ background: "#3B82F612", border: "2px solid #3B82F640" }}>
                <div className="text-xs text-gray-400">{MOCK_MARKET.labels[0]}</div>
                <div className="text-3xl font-black tabular" style={{ color: "#3B82F6" }}>
                  {Math.round(dynamicYes)}%
                </div>
                <div className="text-[10px] font-bold mt-1" style={{ color: "#3B82F6aa" }}>
                  Win ~{(100 / dynamicYes).toFixed(1)}x
                </div>
              </div>
              <div className="rounded-xl p-4 text-center" style={{ background: "#EF444412", border: "2px solid #EF444440" }}>
                <div className="text-xs text-gray-400">{MOCK_MARKET.labels[1]}</div>
                <div className="text-3xl font-black tabular" style={{ color: "#EF4444" }}>
                  {Math.round(dynamicNo)}%
                </div>
                <div className="text-[10px] font-bold mt-1" style={{ color: "#EF4444aa" }}>
                  Win ~{(100 / dynamicNo).toFixed(1)}x
                </div>
              </div>
            </div>
            <p className="text-[10px] text-center text-gray-600 mt-3">
              This is a demo. Odds update based on real tweet count.
            </p>
          </div>
        </div>

        {/* Right: Live tweet feed */}
        <div className="lg:col-span-2">
          <div className="card p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-gray-300 mb-3">
              <img src="/aixbt-avatar.jpg" alt="" className="h-5 w-5 rounded-full" />
              Live @aixbt_agent Feed
              <span className="live-dot" style={{ width: 6, height: 6 }} />
            </h3>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : tweets.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-4">No tweets today yet</p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {tweets.map((tweet, i) => (
                  <motion.div
                    key={tweet.id}
                    initial={i === 0 ? { opacity: 0, x: -10 } : false}
                    animate={{ opacity: 1, x: 0 }}
                    className="rounded-lg p-3"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}
                  >
                    <p className="text-xs text-gray-300 leading-relaxed line-clamp-3">
                      {tweet.text}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-600">
                      <span>❤ {tweet.likeCount}</span>
                      <span>🔁 {tweet.retweetCount}</span>
                      <span>{new Date(tweet.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
