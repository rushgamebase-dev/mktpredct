"use client";

import { useRef, useEffect } from "react";
import type { MarketSummary } from "@rush/shared";
import { OUTCOME_COLORS } from "@rush/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarketSelectorProps {
  markets: MarketSummary[];
  selected: string | null;
  onSelect: (addr: string | null) => void;
  hovered: string | null;
  onHover: (addr: string | null) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortQuestion(q: string, maxWords = 3): string {
  return q.split(/\s+/).slice(0, maxWords).join(" ");
}

// ---------------------------------------------------------------------------
// MarketSelector
// ---------------------------------------------------------------------------

export default function MarketSelector({
  markets,
  selected,
  onSelect,
  hovered,
  onHover,
}: MarketSelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll selected pill into view
  useEffect(() => {
    if (!scrollRef.current || selected === null) return;
    const el = scrollRef.current.querySelector(`[data-addr="${selected}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selected]);

  return (
    <div
      ref={scrollRef}
      className="flex items-center gap-2 overflow-x-auto pb-1"
      style={{
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      {/* Hide scrollbar via inline style for WebKit */}
      <style jsx>{`
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* "All Markets" pill */}
      <button
        onClick={() => onSelect(null)}
        className="flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all whitespace-nowrap"
        style={
          selected === null
            ? {
                background: "#00ff88",
                color: "#000",
                border: "1px solid #00ff88",
                boxShadow: "0 0 12px rgba(0,255,136,0.25)",
              }
            : {
                background: "rgba(255,255,255,0.04)",
                color: "#888",
                border: "1px solid rgba(255,255,255,0.08)",
              }
        }
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: selected === null ? "#000" : "#00ff88" }}
        />
        All Markets
      </button>

      {/* Per-market pills */}
      {markets.map((market, idx) => {
        const color = OUTCOME_COLORS[idx % OUTCOME_COLORS.length];
        const isSelected = selected === market.address;
        const isHovered = hovered === market.address;
        const primaryOdds = Math.round(market.odds[0] ?? 0);

        return (
          <button
            key={market.address}
            data-addr={market.address}
            onClick={() => onSelect(market.address)}
            onMouseEnter={() => onHover(market.address)}
            onMouseLeave={() => onHover(null)}
            className="flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all whitespace-nowrap"
            style={
              isSelected
                ? {
                    background: color,
                    color: "#000",
                    border: `1px solid ${color}`,
                    boxShadow: `0 0 12px ${color}40`,
                  }
                : {
                    background: "rgba(255,255,255,0.04)",
                    color: isHovered ? "#fff" : "#888",
                    border: `1px solid ${isHovered ? color + "60" : "rgba(255,255,255,0.08)"}`,
                  }
            }
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: isSelected ? "#000" : color }}
            />
            <span className="truncate max-w-[120px]">
              {shortQuestion(market.question)}
            </span>
            <span
              className="tabular"
              style={{ color: isSelected ? "#000" : color, opacity: isSelected ? 0.7 : 1 }}
            >
              {primaryOdds}%
            </span>
          </button>
        );
      })}
    </div>
  );
}
