"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { MarketSummary } from "@rush/shared";
import { OUTCOME_COLORS } from "@rush/shared";
import { formatEth } from "@/lib/format";
import { ArrowRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RelatedMarketsProps {
  currentAddress: string;
  markets: MarketSummary[];
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

const cardVariant = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.08,
      duration: 0.35,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
};

// ---------------------------------------------------------------------------
// RelatedMarkets
// ---------------------------------------------------------------------------

export default function RelatedMarkets({
  currentAddress,
  markets,
}: RelatedMarketsProps) {
  const related = useMemo(() => {
    return markets
      .filter((m) => m.status === "open" && m.address !== currentAddress)
      .sort((a, b) => {
        // Sort by pool descending to show most active markets
        try {
          const diff = BigInt(b.totalPool) - BigInt(a.totalPool);
          return diff > 0n ? 1 : diff < 0n ? -1 : 0;
        } catch {
          return 0;
        }
      })
      .slice(0, 3);
  }, [markets, currentAddress]);

  if (related.length === 0) return null;

  return (
    <div className="mt-8">
      {/* Heading */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
          More Markets
        </h2>
        <Link
          href="/"
          className="flex items-center gap-1 text-xs font-bold transition-colors hover:text-gray-200"
          style={{ color: "#00ff88" }}
        >
          View all
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Grid: 3 columns desktop, 1 column mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {related.map((m, i) => {
          const primaryOdds = Math.round(m.odds[0] ?? 50);
          const color = OUTCOME_COLORS[0];
          const pool = formatEth(m.totalPool);

          return (
            <motion.div
              key={m.address}
              variants={cardVariant}
              initial="hidden"
              animate="visible"
              custom={i}
            >
              <Link
                href={`/markets/${m.address}`}
                className="block rounded-xl p-4 transition-all duration-150 hover:scale-[1.02]"
                style={{
                  background: "var(--surface, #111)",
                  border: "1px solid var(--border, rgba(255,255,255,0.08))",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "rgba(0,255,136,0.25)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "var(--border, rgba(255,255,255,0.08))";
                }}
              >
                {/* Question */}
                <p className="text-xs font-semibold text-gray-200 line-clamp-1 mb-2">
                  {m.question}
                </p>

                {/* Odds + Pool row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: color }}
                    />
                    <span
                      className="text-sm font-black tabular"
                      style={{ color }}
                    >
                      {primaryOdds}%
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {m.labels[0]}
                    </span>
                  </div>

                  <span className="text-[10px] text-gray-500 font-semibold">
                    {pool} pool
                  </span>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
