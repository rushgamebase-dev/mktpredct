"use client";

import React from "react";

// ------------------------------------------------------------
// Shimmer helper
// ------------------------------------------------------------

function Shimmer({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse rounded ${className ?? ""}`}
      style={{
        background:
          "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%)",
        backgroundSize: "200% 100%",
        ...style,
      }}
    />
  );
}

// ------------------------------------------------------------
// MarketCardSkeleton
// ------------------------------------------------------------

export default function MarketCardSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-xl p-4"
      style={{
        background: "var(--surface, #111)",
        border: "1px solid var(--border, rgba(255,255,255,0.08))",
      }}
      aria-busy="true"
      aria-label="Loading market card"
    >
      {/* Row 1: Icon + Title + badges */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          {/* Icon */}
          <Shimmer className="shrink-0" style={{ width: 24, height: 24, borderRadius: 6 }} />
          {/* Title lines */}
          <div className="flex-1 space-y-1.5">
            <Shimmer style={{ height: 13, width: "90%" }} />
            <Shimmer style={{ height: 13, width: "60%" }} />
          </div>
        </div>
        {/* Badges */}
        <div className="flex shrink-0 items-center gap-1">
          <Shimmer style={{ width: 32, height: 18, borderRadius: 99 }} />
          <Shimmer style={{ width: 42, height: 18, borderRadius: 4 }} />
        </div>
      </div>

      {/* Row 2: Probability + Sparkline */}
      <div className="mb-3 flex items-end justify-between">
        <div className="space-y-1.5">
          {/* Big probability number */}
          <Shimmer style={{ width: 72, height: 36, borderRadius: 6 }} />
          {/* Change indicator */}
          <Shimmer style={{ width: 52, height: 14, borderRadius: 4 }} />
        </div>
        {/* Sparkline placeholder */}
        <Shimmer style={{ width: 120, height: 40, borderRadius: 8 }} />
      </div>

      {/* Row 3: Buy buttons */}
      <div className="mb-3 flex gap-2">
        <Shimmer style={{ flex: 1, height: 40, borderRadius: 8 }} />
        <Shimmer style={{ flex: 1, height: 40, borderRadius: 8 }} />
      </div>

      {/* Row 4: Footer metadata */}
      <div className="flex items-center gap-2">
        <Shimmer style={{ width: 60, height: 11, borderRadius: 4 }} />
        <Shimmer style={{ width: 4, height: 11, borderRadius: 2 }} />
        <Shimmer style={{ width: 70, height: 11, borderRadius: 4 }} />
        <Shimmer style={{ width: 4, height: 11, borderRadius: 2 }} />
        <Shimmer style={{ width: 52, height: 11, borderRadius: 4 }} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// MarketCardSkeletonGrid — convenience wrapper for page loading
// Usage: <MarketCardSkeletonGrid count={6} />
// ------------------------------------------------------------

export function MarketCardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <MarketCardSkeleton key={i} />
      ))}
    </div>
  );
}
