"use client";

import React from "react";
import { motion } from "framer-motion";
import { OUTCOME_COLORS } from "@rush/shared";

interface OddsBarProps {
  odds: number[];
  labels: string[];
  colors?: string[];
}

export default function OddsBar({ odds, labels, colors }: OddsBarProps) {
  const resolvedColors = colors || labels.map((_, i) => OUTCOME_COLORS[i % OUTCOME_COLORS.length]);

  return (
    <div className="w-full">
      {/* Stacked bar */}
      <div
        className="flex h-8 w-full overflow-hidden rounded-lg"
        style={{ border: "1px solid var(--border)" }}
      >
        {odds.map((odd, i) => {
          const pct = Math.round(odd);
          if (pct === 0) return null;
          return (
            <motion.div
              key={i}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="flex items-center justify-center overflow-hidden"
              style={{
                background: resolvedColors[i] + "30",
                borderRight:
                  i < odds.length - 1
                    ? `1px solid ${resolvedColors[i]}40`
                    : "none",
              }}
            >
              {pct >= 10 && (
                <span
                  className="text-xs font-bold tabular"
                  style={{ color: resolvedColors[i] }}
                >
                  {pct}%
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Labels below */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {labels.map((label, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: resolvedColors[i] }}
            />
            <span className="text-xs text-gray-400">{label}</span>
            <span
              className="text-xs font-bold tabular"
              style={{ color: resolvedColors[i] }}
            >
              {Math.round(odds[i])}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
