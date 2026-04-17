"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { MarketSummary } from "@rush/shared";
import { formatEth } from "@/lib/format";
import { Users, TrendingUp, Flame, Activity } from "lucide-react";

interface SocialProofBarProps {
  markets: MarketSummary[];
  recentBetCount: number;
}

export default function SocialProofBar({ markets, recentBetCount }: SocialProofBarProps) {
  const stats = useMemo(() => {
    const open = markets.filter((m) => m.status === "open");
    const totalPool = markets.reduce((sum, m) => {
      try { return sum + BigInt(m.totalPool); } catch { return sum; }
    }, 0n);

    let leadingSide = "";
    let leadingColor = "#888";
    if (open.length > 0) {
      const topMarket = open[0];
      const yesOdds = Math.round(topMarket.odds[0] ?? 50);
      const noOdds = Math.round(topMarket.odds[1] ?? 50);
      if (yesOdds > noOdds) {
        leadingSide = `${topMarket.labels[0] ?? "Yes"} leading`;
        leadingColor = "#00ff88";
      } else if (noOdds > yesOdds) {
        leadingSide = `${topMarket.labels[1] ?? "No"} leading`;
        leadingColor = "#EF4444";
      } else {
        leadingSide = "Market split";
        leadingColor = "#ffc828";
      }
    }

    return {
      liveCount: open.length,
      totalPool: totalPool > 0n ? formatEth(totalPool.toString()) : "0 ETH",
      leadingSide,
      leadingColor,
    };
  }, [markets]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
      className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-xl px-4 py-2.5"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
    >
      <Stat icon={<Activity className="h-3.5 w-3.5" />} color="#00ff88" value={`${stats.liveCount} live`} />
      <Divider />
      <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} color="#ffc828" value={`${stats.totalPool} volume`} />
      <Divider />
      <Stat icon={<Flame className="h-3.5 w-3.5" />} color={stats.leadingColor} value={stats.leadingSide} />
      {recentBetCount > 0 && (
        <>
          <Divider />
          <Stat
            icon={<Users className="h-3.5 w-3.5" />}
            color={recentBetCount >= 3 ? "#ffc828" : "#888"}
            value={`${recentBetCount} betting now`}
          />
        </>
      )}
    </motion.div>
  );
}

function Stat({ icon, color, value }: { icon: React.ReactNode; color: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color }}>
      {icon}
      {value}
    </span>
  );
}

function Divider() {
  return <span className="hidden sm:block text-gray-700">·</span>;
}
