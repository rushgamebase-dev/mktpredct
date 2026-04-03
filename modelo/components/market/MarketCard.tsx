"use client";

import React, { useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { MarketDisplay } from "@/types/market";

// ------------------------------------------------------------
// Props
// ------------------------------------------------------------

interface MarketCardProps {
  market: MarketDisplay;
  index: number;
}

// ------------------------------------------------------------
// Framer Motion variants
// ------------------------------------------------------------

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.06,
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
};

// ------------------------------------------------------------
// Outcome color palette
// ------------------------------------------------------------

const OUTCOME_COLORS = [
  {
    yes: {
      bg: "rgba(0,255,136,0.06)",
      border: "rgba(0,255,136,0.15)",
      borderHover: "rgba(0,255,136,0.5)",
      text: "#00ff88",
      label: "Buy Yes",
    },
    no: {
      bg: "rgba(255,68,68,0.06)",
      border: "rgba(255,68,68,0.15)",
      borderHover: "rgba(255,68,68,0.5)",
      text: "#ff4444",
      label: "Buy No",
    },
  },
];

const MULTI_COLORS = [
  { bg: "rgba(0,255,136,0.06)", border: "rgba(0,255,136,0.15)", borderHover: "rgba(0,255,136,0.5)", text: "#00ff88" },
  { bg: "rgba(255,68,68,0.06)", border: "rgba(255,68,68,0.15)", borderHover: "rgba(255,68,68,0.5)", text: "#ff4444" },
  { bg: "rgba(255,200,40,0.06)", border: "rgba(255,200,40,0.15)", borderHover: "rgba(255,200,40,0.5)", text: "#ffc828" },
  { bg: "rgba(80,120,255,0.06)", border: "rgba(80,120,255,0.15)", borderHover: "rgba(80,120,255,0.5)", text: "#5078ff" },
];

// ------------------------------------------------------------
// MiniSparkline — inline canvas, 120x40, step-chart style
// ------------------------------------------------------------

interface MiniSparklineProps {
  data: number[]; // array of 0-100 probability values
  color?: string;
  width?: number;
  height?: number;
}

function MiniSparkline({
  data,
  color = "#00ff88",
  width = 120,
  height = 40,
}: MiniSparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mountTimeRef = useRef<number>(0);

  const drawSparkline = useCallback(
    (progress: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      if (data.length < 2) {
        ctx.restore();
        return;
      }

      const padX = 2;
      const padY = 4;
      const innerW = W - padX * 2;
      const innerH = H - padY * 2;

      const minVal = Math.min(...data);
      const maxVal = Math.max(...data);
      const valRange = maxVal - minVal || 1;

      const toX = (i: number) => padX + (i / (data.length - 1)) * innerW;
      const toY = (v: number) => padY + (1 - (v - minVal) / valRange) * innerH;

      const visibleCount = Math.max(2, Math.floor(data.length * progress));

      // Build step path
      const path = new Path2D();
      path.moveTo(toX(0), toY(data[0]));
      for (let i = 1; i < visibleCount; i++) {
        // Horizontal then vertical (step style)
        path.lineTo(toX(i), toY(data[i - 1]));
        path.lineTo(toX(i), toY(data[i]));
      }

      // Gradient fill
      const grad = ctx.createLinearGradient(0, padY, 0, H - padY);
      grad.addColorStop(0, color + "30");
      grad.addColorStop(1, color + "00");

      const fillPath = new Path2D(path);
      const lastIdx = visibleCount - 1;
      fillPath.lineTo(toX(lastIdx), H - padY);
      fillPath.lineTo(toX(0), H - padY);
      fillPath.closePath();
      ctx.fillStyle = grad;
      ctx.fill(fillPath);

      // Stroke
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(path);

      ctx.restore();
    },
    [data, color]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }, [width, height]);

  useEffect(() => {
    const DURATION = 600;
    mountTimeRef.current = performance.now();

    const loop = (now: number) => {
      const elapsed = now - mountTimeRef.current;
      const progress = Math.min(1, elapsed / DURATION);
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      drawSparkline(eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawSparkline]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block" }}
      aria-hidden="true"
    />
  );
}

// ------------------------------------------------------------
// Buy button
// ------------------------------------------------------------

interface BuyButtonProps {
  label: string;
  price: string;
  bg: string;
  border: string;
  borderHover: string;
  textColor: string;
}

function BuyButton({ label, price, bg, border, borderHover, textColor }: BuyButtonProps) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <motion.button
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="flex flex-1 flex-col items-center justify-center rounded-lg px-3 transition-colors"
      style={{
        height: 40,
        background: bg,
        border: `1px solid ${hovered ? borderHover : border}`,
      }}
      aria-label={`${label} at ${price}`}
    >
      <span className="text-[10px] leading-none text-gray-500">{label}</span>
      <span className="text-sm font-bold leading-tight" style={{ color: textColor }}>
        {price}
      </span>
    </motion.button>
  );
}

// ------------------------------------------------------------
// Liquidity badge
// ------------------------------------------------------------

function LiquidityBadge({ liquidity }: { liquidity: "High" | "Medium" | "Low" }) {
  const colors: Record<string, string> = {
    High: "#00ff88",
    Medium: "#ffc828",
    Low: "#ff4444",
  };
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{
        color: colors[liquidity],
        background: colors[liquidity] + "15",
      }}
    >
      {liquidity}
    </span>
  );
}

// ------------------------------------------------------------
// Derive sparkline data from outcomes history (placeholder)
// We generate a synthetic decay towards current prob since no
// history is available in MarketDisplay; callers can extend.
// ------------------------------------------------------------

function buildSparklineData(prob: number): number[] {
  // 20 points: synthetic random walk ending at current prob
  const points: number[] = [];
  let v = prob + (Math.random() - 0.5) * 20;
  for (let i = 0; i < 20; i++) {
    v = Math.max(2, Math.min(98, v + (prob - v) * 0.15 + (Math.random() - 0.5) * 6));
    points.push(v);
  }
  points[points.length - 1] = prob;
  return points;
}

// ------------------------------------------------------------
// MarketCard
// ------------------------------------------------------------

export default function MarketCard({ market, index }: MarketCardProps) {
  const isBinary = market.outcomes.length === 2;
  const primaryOutcome = market.outcomes[0];
  const prob = primaryOutcome?.prob ?? 50;
  const change = market.change24h;

  const sparkData = React.useMemo(() => buildSparklineData(prob), [prob]);

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={index}
      whileHover={{ y: -3 }}
      className="group relative"
    >
      <Link href={`/markets/${market.id}`} className="block outline-none focus-visible:ring-2 focus-visible:ring-[#00ff88]">
        <div
          className="relative overflow-hidden rounded-xl p-4 transition-all duration-200"
          style={{
            background: "var(--surface, #111)",
            border: "1px solid var(--border, rgba(255,255,255,0.08))",
          }}
          // Border glow on hover via inline style override
        >
          {/* Hover border glow overlay */}
          <div
            className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              boxShadow: "inset 0 0 0 1px rgba(0,255,136,0.25)",
            }}
          />

          {/* Row 1: Icon + Title + HOT badge */}
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <span className="text-xl leading-none" aria-hidden="true">
                {market.icon}
              </span>
              <h3 className="text-sm font-semibold leading-snug text-gray-100 line-clamp-2">
                {market.title}
              </h3>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {market.isHot && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    background: "rgba(255,100,0,0.15)",
                    color: "#ff6400",
                    border: "1px solid rgba(255,100,0,0.25)",
                  }}
                >
                  HOT
                </span>
              )}
              <LiquidityBadge liquidity={market.liquidity} />
            </div>
          </div>

          {/* Row 2: Probability + Sparkline */}
          <div className="mb-3 flex items-end justify-between">
            <div>
              <div className="text-3xl font-black leading-none text-white">
                {prob}%
              </div>
              <div
                className="mt-0.5 flex items-center gap-1 text-sm font-semibold"
                style={{ color: change >= 0 ? "#00ff88" : "#ff4444" }}
                aria-label={`${change >= 0 ? "Up" : "Down"} ${Math.abs(change)}% in 24 hours`}
              >
                <span>{change >= 0 ? "▲" : "▼"}</span>
                <span>{Math.abs(change).toFixed(1)}%</span>
              </div>
            </div>
            <div
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <MiniSparkline data={sparkData} color="#00ff88" width={120} height={40} />
            </div>
          </div>

          {/* Row 3: Buy buttons */}
          <div className="mb-3 flex gap-2" onClick={(e) => e.preventDefault()}>
            {isBinary ? (
              <>
                <BuyButton
                  label={OUTCOME_COLORS[0].yes.label}
                  price={`${Math.round(primaryOutcome.odds)}¢`}
                  bg={OUTCOME_COLORS[0].yes.bg}
                  border={OUTCOME_COLORS[0].yes.border}
                  borderHover={OUTCOME_COLORS[0].yes.borderHover}
                  textColor={OUTCOME_COLORS[0].yes.text}
                />
                <BuyButton
                  label={OUTCOME_COLORS[0].no.label}
                  price={`${Math.round(100 - primaryOutcome.odds)}¢`}
                  bg={OUTCOME_COLORS[0].no.bg}
                  border={OUTCOME_COLORS[0].no.border}
                  borderHover={OUTCOME_COLORS[0].no.borderHover}
                  textColor={OUTCOME_COLORS[0].no.text}
                />
              </>
            ) : (
              market.outcomes.slice(0, 4).map((outcome, i) => {
                const c = MULTI_COLORS[i % MULTI_COLORS.length];
                return (
                  <BuyButton
                    key={outcome.label}
                    label={`Buy ${outcome.label}`}
                    price={`${Math.round(outcome.odds)}¢`}
                    bg={c.bg}
                    border={c.border}
                    borderHover={c.borderHover}
                    textColor={c.text}
                  />
                );
              })
            )}
          </div>

          {/* Row 4: Footer metadata */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
            <span>{market.volume} vol</span>
            <span className="opacity-30">·</span>
            <span>{market.totalBettors.toLocaleString("en-US")} traders</span>
            <span className="opacity-30">·</span>
            <span className="flex items-center gap-0.5">
              <span aria-hidden="true">⏰</span>
              {market.endDate}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
