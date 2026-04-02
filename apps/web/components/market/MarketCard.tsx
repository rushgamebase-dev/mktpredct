"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { MarketSummary } from "@rush/shared";
import { OUTCOME_COLORS } from "@rush/shared";
import { formatEth } from "@/lib/format";

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/** Extract the first emoji from a string, or return a default */
function extractEmoji(text: string): string {
  const emojiRegex = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/u;
  const match = text.match(emojiRegex);
  return match ? match[0] : "\u{1F4CA}"; // default: 📊
}

/** Format a relative deadline string like "Ends in 23d" */
function formatRelativeDeadline(timestampSec: number): string {
  const diff = timestampSec - Date.now() / 1000;
  if (diff < 0) return "Ended";
  if (diff < 3600) return `Ends in ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `Ends in ${Math.floor(diff / 3600)}h`;
  return `Ends in ${Math.floor(diff / 86400)}d`;
}

// ------------------------------------------------------------
// Props
// ------------------------------------------------------------

interface MarketCardProps {
  market: MarketSummary;
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
// Outcome color palette for buy buttons
// ------------------------------------------------------------

const BUTTON_COLORS = [
  { bg: "rgba(0,255,136,0.06)", border: "rgba(0,255,136,0.15)", borderHover: "rgba(0,255,136,0.5)", text: "#00ff88" },
  { bg: "rgba(255,68,68,0.06)", border: "rgba(255,68,68,0.15)", borderHover: "rgba(255,68,68,0.5)", text: "#ff4444" },
  { bg: "rgba(255,200,40,0.06)", border: "rgba(255,200,40,0.15)", borderHover: "rgba(255,200,40,0.5)", text: "#ffc828" },
  { bg: "rgba(80,120,255,0.06)", border: "rgba(80,120,255,0.15)", borderHover: "rgba(80,120,255,0.5)", text: "#5078ff" },
  { bg: "rgba(255,107,157,0.06)", border: "rgba(255,107,157,0.15)", borderHover: "rgba(255,107,157,0.5)", text: "#ff6b9d" },
  { bg: "rgba(167,139,250,0.06)", border: "rgba(167,139,250,0.15)", borderHover: "rgba(167,139,250,0.5)", text: "#a78bfa" },
];

// ------------------------------------------------------------
// MiniSparkline -- inline canvas, 120x40, step-chart style
// Shows current odds as a flat line (simple fallback)
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
  odds: number;
  bg: string;
  border: string;
  borderHover: string;
  textColor: string;
}

function BuyButton({ label, price, odds, bg, border, borderHover, textColor }: BuyButtonProps) {
  const [hovered, setHovered] = React.useState(false);
  const multiplier = odds > 0 ? (100 / odds).toFixed(1) : "---";

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
        {price} &middot; {multiplier}x
      </span>
    </motion.button>
  );
}

// ------------------------------------------------------------
// Simple sparkline fallback: flat line at current odds with
// slight variation to make it visually interesting
// ------------------------------------------------------------

function buildFlatSparkline(prob: number): number[] {
  // 10 points showing a flat line at current odds with tiny noise
  const points: number[] = [];
  for (let i = 0; i < 10; i++) {
    points.push(Math.max(1, Math.min(99, prob + (Math.random() - 0.5) * 2)));
  }
  points[points.length - 1] = prob;
  return points;
}

// ------------------------------------------------------------
// MarketCard
// ------------------------------------------------------------

export default function MarketCard({ market, index }: MarketCardProps) {
  const isBinary = market.outcomeCount === 2;
  const primaryOdds = market.odds[0] ?? 50;
  const prob = Math.round(primaryOdds);
  const primaryColor = OUTCOME_COLORS[0];

  const sparkData = React.useMemo(() => buildFlatSparkline(prob), [prob]);
  const emoji = React.useMemo(() => extractEmoji(market.question), [market.question]);

  // Track whether the progress bar has been mounted (for animation)
  const [barMounted, setBarMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={index}
      whileHover={{ y: -3 }}
      className="group relative"
    >
      <Link href={`/markets/${market.address}`} className="block outline-none focus-visible:ring-2 focus-visible:ring-[#00ff88]">
        <div
          className="relative overflow-hidden rounded-xl p-4 transition-all duration-200 market-card-glow"
          style={{
            background: "var(--surface, #111)",
            border: "1px solid var(--border, rgba(255,255,255,0.08))",
          }}
        >
          {/* Hover border glow overlay */}
          <div
            className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              boxShadow: "inset 0 0 0 1px rgba(0,255,136,0.25)",
            }}
          />

          {/* Row 1: Emoji + Title + status badge */}
          <div className="mb-3 flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug text-gray-100 line-clamp-2 flex-1">
              <span className="mr-1.5">{emoji}</span>
              {market.question}
            </h3>
            <div className="flex shrink-0 items-center gap-1">
              {market.status === "open" && (
                <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    background: "rgba(0,255,136,0.1)",
                    color: "#00ff88",
                    border: "1px solid rgba(0,255,136,0.2)",
                  }}
                >
                  <span className="live-dot-green" style={{ width: 5, height: 5 }} />
                  LIVE
                </span>
              )}
              {market.status === "resolved" && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    background: "rgba(80,120,255,0.1)",
                    color: "#5078ff",
                    border: "1px solid rgba(80,120,255,0.2)",
                  }}
                >
                  RESOLVED
                </span>
              )}
            </div>
          </div>

          {/* Row 2: Probability + Sparkline */}
          <div className="mb-1 flex items-end justify-between">
            <div>
              <div className="text-3xl font-black leading-none text-white">
                {prob}%
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {market.labels[0] ?? "Yes"}
              </div>
            </div>
            <div
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <MiniSparkline data={sparkData} color={primaryColor} width={120} height={40} />
            </div>
          </div>

          {/* Animated probability progress bar */}
          <div className="probability-bar mb-3">
            <div
              className="probability-bar-fill"
              style={{
                width: barMounted ? `${prob}%` : "0%",
                background: primaryColor,
              }}
            />
          </div>

          {/* Row 3: Buy buttons */}
          <div className="mb-3 flex gap-2" onClick={(e) => e.preventDefault()}>
            {isBinary ? (
              <>
                <BuyButton
                  label={`Buy ${market.labels[0] ?? "Yes"}`}
                  price={`${Math.round(market.odds[0] ?? 50)}\u00A2`}
                  odds={market.odds[0] ?? 0.5}
                  bg={BUTTON_COLORS[0].bg}
                  border={BUTTON_COLORS[0].border}
                  borderHover={BUTTON_COLORS[0].borderHover}
                  textColor={BUTTON_COLORS[0].text}
                />
                <BuyButton
                  label={`Buy ${market.labels[1] ?? "No"}`}
                  price={`${Math.round(market.odds[1] ?? 50)}\u00A2`}
                  odds={market.odds[1] ?? 0.5}
                  bg={BUTTON_COLORS[1].bg}
                  border={BUTTON_COLORS[1].border}
                  borderHover={BUTTON_COLORS[1].borderHover}
                  textColor={BUTTON_COLORS[1].text}
                />
              </>
            ) : (
              market.labels.slice(0, 4).map((label, i) => {
                const c = BUTTON_COLORS[i % BUTTON_COLORS.length];
                return (
                  <BuyButton
                    key={label}
                    label={`Buy ${label}`}
                    price={`${Math.round(market.odds[i] ?? 0)}\u00A2`}
                    odds={market.odds[i] ?? 0}
                    bg={c.bg}
                    border={c.border}
                    borderHover={c.borderHover}
                    textColor={c.text}
                  />
                );
              })
            )}
          </div>

          {/* Row 4: Richer footer metadata */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
            <span className="font-semibold text-gray-400">{formatEth(market.totalPool)}</span>
            <span className="opacity-30">|</span>
            <span>{market.outcomeCount} outcome{market.outcomeCount !== 1 ? "s" : ""}</span>
            <span className="opacity-30">|</span>
            <span className="flex items-center gap-0.5">
              {formatRelativeDeadline(market.deadline)}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
