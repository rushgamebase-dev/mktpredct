"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { MarketSummary } from "@rush/shared";
import { OUTCOME_COLORS } from "@rush/shared";
import { formatEth } from "@/lib/format";
import { TrendingUp, Hash } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NewsSidebarProps {
  markets: MarketSummary[];
}

// ---------------------------------------------------------------------------
// Topic keywords to scan for in market questions
// ---------------------------------------------------------------------------

const TOPIC_KEYWORDS = [
  "Bitcoin",
  "BTC",
  "ETH",
  "Ethereum",
  "Base",
  "Solana",
  "SOL",
  "Election",
  "Trump",
  "AI",
  "DeFi",
  "NFT",
  "Crypto",
  "Regulation",
  "SEC",
  "Fed",
] as const;

// Normalize overlapping keywords into canonical topics
const TOPIC_CANONICAL: Record<string, string> = {
  Bitcoin: "Bitcoin",
  BTC: "Bitcoin",
  ETH: "Ethereum",
  Ethereum: "Ethereum",
  Base: "Base",
  Solana: "Solana",
  SOL: "Solana",
  Election: "Election",
  Trump: "Election",
  AI: "AI",
  DeFi: "DeFi",
  NFT: "NFT",
  Crypto: "Crypto",
  Regulation: "Regulation",
  SEC: "Regulation",
  Fed: "Fed",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reformulate a market question into a short headline */
function toHeadline(question: string): string {
  // Strip trailing "?" and "Will"/"Does" prefix for punchier headline
  let h = question.replace(/\?$/, "").trim();
  h = h.replace(/^(Will|Does|Is|Can|Has|Are)\s+/i, "");
  // Capitalize first letter
  h = h.charAt(0).toUpperCase() + h.slice(1);
  // Truncate if too long
  if (h.length > 50) h = h.slice(0, 47) + "...";
  return h;
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

const listItem = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.06, duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

// ---------------------------------------------------------------------------
// NewsSidebar
// ---------------------------------------------------------------------------

export default function NewsSidebar({ markets }: NewsSidebarProps) {
  // Section 1: Trending -- open markets sorted by pool descending, top 5
  const trending = useMemo(() => {
    return markets
      .filter((m) => m.status === "open")
      .sort((a, b) => {
        try {
          const diff = BigInt(b.totalPool) - BigInt(a.totalPool);
          return diff > 0n ? 1 : diff < 0n ? -1 : 0;
        } catch {
          return 0;
        }
      })
      .slice(0, 5);
  }, [markets]);

  // Section 2: Hot Topics -- aggregate by keyword
  const topics = useMemo(() => {
    const topicMap = new Map<string, { count: number; pool: bigint }>();

    for (const m of markets) {
      const questionLower = m.question.toLowerCase();
      const matched = new Set<string>();

      for (const kw of TOPIC_KEYWORDS) {
        if (questionLower.includes(kw.toLowerCase())) {
          const canonical = TOPIC_CANONICAL[kw] ?? kw;
          if (!matched.has(canonical)) {
            matched.add(canonical);
            const existing = topicMap.get(canonical) ?? { count: 0, pool: 0n };
            topicMap.set(canonical, {
              count: existing.count + 1,
              pool: existing.pool + BigInt(m.totalPool),
            });
          }
        }
      }
    }

    return Array.from(topicMap.entries())
      .sort((a, b) => {
        // Sort by count desc, then pool desc
        if (b[1].count !== a[1].count) return b[1].count - a[1].count;
        const diff = b[1].pool - a[1].pool;
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      })
      .slice(0, 5)
      .map(([name, data]) => ({
        name,
        count: data.count,
        pool: formatEth(data.pool.toString()),
      }));
  }, [markets]);

  if (trending.length === 0 && topics.length === 0) return null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--surface, #111)",
        border: "1px solid var(--border, rgba(255,255,255,0.08))",
      }}
    >
      {/* Section 1: Trending */}
      {trending.length > 0 && (
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-1.5 mb-2.5">
            <TrendingUp className="h-3.5 w-3.5" style={{ color: "#00ff88" }} />
            <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
              Trending
            </span>
          </div>

          <div className="space-y-1">
            {trending.map((m, i) => {
              const primaryOdds = Math.round(m.odds[0] ?? 50);
              const color = OUTCOME_COLORS[0];
              return (
                <motion.div
                  key={m.address}
                  variants={listItem}
                  initial="hidden"
                  animate="visible"
                  custom={i}
                >
                  <Link
                    href={`/markets/${m.address}`}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all hover:bg-white/[0.03]"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <span className="flex-1 text-xs text-gray-300 truncate">
                      {toHeadline(m.question)}
                    </span>
                    <span
                      className="text-xs font-bold tabular shrink-0"
                      style={{ color: "#00ff88" }}
                    >
                      {m.labels[0]} {primaryOdds}%
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Divider */}
      {trending.length > 0 && topics.length > 0 && (
        <div
          className="mx-4"
          style={{ height: 1, background: "rgba(255,255,255,0.06)" }}
        />
      )}

      {/* Section 2: Hot Topics */}
      {topics.length > 0 && (
        <div className="px-4 pt-2.5 pb-3">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Hash className="h-3.5 w-3.5" style={{ color: "#ffc828" }} />
            <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
              Hot Topics
            </span>
          </div>

          <div className="space-y-1">
            {topics.map((topic, i) => (
              <motion.div
                key={topic.name}
                variants={listItem}
                initial="hidden"
                animate="visible"
                custom={i + trending.length}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
              >
                <span className="text-xs text-gray-300 font-semibold">
                  {topic.name}
                </span>
                <span className="text-[10px] text-gray-600">&middot;</span>
                <span className="text-[10px] text-gray-500">
                  {topic.count} market{topic.count !== 1 ? "s" : ""}
                </span>
                <span className="text-[10px] text-gray-600">&middot;</span>
                <span
                  className="text-[10px] font-bold tabular"
                  style={{ color: "#00ff88" }}
                >
                  {topic.pool}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
