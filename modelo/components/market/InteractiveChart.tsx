"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";

// ------------------------------------------------------------
// Public interfaces
// ------------------------------------------------------------

export interface ChartDataPoint {
  timestamp: number;
  value: number; // 0-100 percentage
}

export interface ChartOutcome {
  id: string;
  name: string;
  color: string;
  data: ChartDataPoint[];
}

type TimeRange = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

interface InteractiveChartProps {
  outcomes: ChartOutcome[];
  height?: number;
  showTimeRange?: boolean;
  showTooltip?: boolean;
  defaultTimeRange?: TimeRange;
  className?: string;
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const TIME_RANGES: TimeRange[] = ["1H", "6H", "1D", "1W", "1M", "ALL"];

const TIME_RANGE_MS: Record<TimeRange, number> = {
  "1H": 60 * 60 * 1000,
  "6H": 6 * 60 * 60 * 1000,
  "1D": 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  ALL: Infinity,
};

const PAD = { top: 36, right: 56, bottom: 32, left: 12 } as const;
const ANIMATION_DURATION = 800; // ms

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function filterByTimeRange(
  data: ChartDataPoint[],
  range: TimeRange
): ChartDataPoint[] {
  if (range === "ALL" || data.length === 0) return data;
  const cutoff = Date.now() - TIME_RANGE_MS[range];
  return data.filter((p) => p.timestamp >= cutoff);
}

function formatXLabel(ts: number, range: TimeRange): string {
  const d = new Date(ts);
  if (range === "1H" || range === "6H") {
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  if (range === "1D") {
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTooltipDate(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ------------------------------------------------------------
// Main component
// ------------------------------------------------------------

export default function InteractiveChart({
  outcomes,
  height = 280,
  showTimeRange = true,
  showTooltip = true,
  defaultTimeRange = "1D",
  className = "",
}: InteractiveChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const mountTimeRef = useRef<number>(0);
  const pulsePhaseRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const animatingRef = useRef<boolean>(true);

  const [timeRange, setTimeRange] = useState<TimeRange>(defaultTimeRange);
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: height });
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    ts: number;
    values: { name: string; color: string; value: number }[];
  } | null>(null);

  // Filter data per time range
  const filteredOutcomes = useMemo(
    () =>
      outcomes.map((o) => ({
        ...o,
        data: filterByTimeRange(o.data, timeRange),
      })),
    [outcomes, timeRange]
  );

  // Compute global x domain
  const xDomain = useMemo(() => {
    let minTs = Infinity;
    let maxTs = -Infinity;
    filteredOutcomes.forEach((o) =>
      o.data.forEach((p) => {
        if (p.timestamp < minTs) minTs = p.timestamp;
        if (p.timestamp > maxTs) maxTs = p.timestamp;
      })
    );
    if (!isFinite(minTs)) {
      const now = Date.now();
      return { min: now - TIME_RANGE_MS["1D"], max: now };
    }
    return { min: minTs, max: maxTs };
  }, [filteredOutcomes]);

  // Canvas coordinate mappers
  const toCanvasX = useCallback(
    (ts: number, w: number) => {
      const range = xDomain.max - xDomain.min || 1;
      return PAD.left + ((ts - xDomain.min) / range) * (w - PAD.left - PAD.right);
    },
    [xDomain]
  );

  const toCanvasY = useCallback(
    (value: number, h: number) => {
      return PAD.top + ((100 - value) / 100) * (h - PAD.top - PAD.bottom);
    },
    []
  );

  const toDataX = useCallback(
    (cx: number, w: number) => {
      const range = xDomain.max - xDomain.min || 1;
      return xDomain.min + ((cx - PAD.left) / (w - PAD.left - PAD.right)) * range;
    },
    [xDomain]
  );

  // ---- Drawing ----------------------------------------------------------------

  const draw = useCallback(
    (progress: number, pulse: number, hx: number | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.save();
      ctx.scale(dpr, dpr);

      // Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, "rgba(17,17,17,0.6)");
      bgGrad.addColorStop(1, "rgba(17,17,17,0.2)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Dot pattern texture
      for (let xi = 0; xi < W; xi += 20) {
        for (let yi = 0; yi < H; yi += 20) {
          ctx.fillStyle = "rgba(255,255,255,0.02)";
          ctx.fillRect(xi, yi, 1, 1);
        }
      }

      // Grid lines at 25%, 50%, 75%
      [25, 50, 75].forEach((pct) => {
        const gy = toCanvasY(pct, H);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(PAD.left, gy);
        ctx.lineTo(W - PAD.right, gy);
        ctx.stroke();
      });

      // Y-axis labels
      ctx.font = "11px monospace";
      ctx.fillStyle = "#666";
      ctx.textAlign = "right";
      [0, 25, 50, 75, 100].forEach((pct) => {
        const gy = toCanvasY(pct, H);
        ctx.fillText(`${pct}%`, W - 4, gy + 4);
      });

      // X-axis labels (5 evenly spaced)
      const xLabelCount = 5;
      ctx.textAlign = "center";
      for (let i = 0; i <= xLabelCount; i++) {
        const ts = xDomain.min + (i / xLabelCount) * (xDomain.max - xDomain.min);
        const cx = toCanvasX(ts, W);
        ctx.fillStyle = "#666";
        ctx.font = "10px monospace";
        ctx.fillText(formatXLabel(ts, timeRange), cx, H - 4);
      }

      // Draw each outcome
      filteredOutcomes.forEach((outcome) => {
        const pts = outcome.data;
        if (pts.length < 2) return;

        // Clip visible portion based on animation progress
        const visibleCount = Math.max(2, Math.floor(pts.length * progress));
        const visible = pts.slice(0, visibleCount);

        // Build step path (horizontal then vertical — Kalshi style)
        const buildPath = (subset: ChartDataPoint[]) => {
          const path = new Path2D();
          const first = subset[0];
          path.moveTo(toCanvasX(first.timestamp, W), toCanvasY(first.value, H));
          for (let i = 1; i < subset.length; i++) {
            const prev = subset[i - 1];
            const curr = subset[i];
            const px = toCanvasX(prev.timestamp, W);
            const cx2 = toCanvasX(curr.timestamp, W);
            const py = toCanvasY(prev.value, H);
            const cy2 = toCanvasY(curr.value, H);
            // Step: go horizontal first, then vertical
            path.lineTo(cx2, py);
            path.lineTo(cx2, cy2);
          }
          return path;
        };

        const linePath = buildPath(visible);

        // Gradient fill
        const lastPt = visible[visible.length - 1];
        const fillGrad = ctx.createLinearGradient(
          0,
          toCanvasY(100, H),
          0,
          toCanvasY(0, H)
        );
        fillGrad.addColorStop(0, outcome.color + "00");
        fillGrad.addColorStop(1, outcome.color + "25");

        // Fill area under the step path
        const fillPath = new Path2D(linePath);
        fillPath.lineTo(toCanvasX(lastPt.timestamp, W), toCanvasY(0, H));
        fillPath.lineTo(toCanvasX(visible[0].timestamp, W), toCanvasY(0, H));
        fillPath.closePath();
        ctx.fillStyle = fillGrad;
        ctx.fill(fillPath);

        // Stroke the line
        ctx.strokeStyle = outcome.color;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.setLineDash([]);
        ctx.stroke(linePath);

        // Live pulse indicator at end of line
        if (progress >= 1) {
          const ex = toCanvasX(lastPt.timestamp, W);
          const ey = toCanvasY(lastPt.value, H);
          const glowRadius = 10 + Math.sin(pulse) * 3;

          // Outer glow ring (animated)
          const glowGrad = ctx.createRadialGradient(ex, ey, 2, ex, ey, glowRadius);
          glowGrad.addColorStop(0, outcome.color + "50");
          glowGrad.addColorStop(1, outcome.color + "00");
          ctx.beginPath();
          ctx.arc(ex, ey, glowRadius, 0, Math.PI * 2);
          ctx.fillStyle = glowGrad;
          ctx.fill();

          // Middle ring
          ctx.beginPath();
          ctx.arc(ex, ey, 5, 0, Math.PI * 2);
          ctx.strokeStyle = outcome.color + "80";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // White bg circle
          ctx.beginPath();
          ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = "#fff";
          ctx.fill();

          // Colored inner dot
          ctx.beginPath();
          ctx.arc(ex, ey, 2, 0, Math.PI * 2);
          ctx.fillStyle = outcome.color;
          ctx.fill();
        }
      });

      // Hover crosshair
      if (hx !== null && hx >= PAD.left && hx <= W - PAD.right) {
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hx, PAD.top);
        ctx.lineTo(hx, H - PAD.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dots at intersection points
        filteredOutcomes.forEach((outcome) => {
          if (outcome.data.length < 2) return;
          const ts = toDataX(hx, W);
          // Find step value at ts
          let value = outcome.data[0].value;
          for (let i = 0; i < outcome.data.length - 1; i++) {
            if (ts >= outcome.data[i].timestamp && ts <= outcome.data[i + 1].timestamp) {
              value = outcome.data[i].value; // step: use left side value
              break;
            }
            if (ts > outcome.data[outcome.data.length - 1].timestamp) {
              value = outcome.data[outcome.data.length - 1].value;
            }
          }
          const iy = toCanvasY(value, H);

          // White halo
          ctx.beginPath();
          ctx.arc(hx, iy, 7, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.fill();

          // Colored ring
          ctx.beginPath();
          ctx.arc(hx, iy, 5, 0, Math.PI * 2);
          ctx.strokeStyle = outcome.color;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Center dot
          ctx.beginPath();
          ctx.arc(hx, iy, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = outcome.color;
          ctx.fill();
        });
      }

      // Legend at top-left
      let lx = PAD.left;
      filteredOutcomes.forEach((outcome) => {
        const lastPt = outcome.data[outcome.data.length - 1];
        const val = lastPt ? Math.round(lastPt.value) : 0;
        const label = `${outcome.name} ${val}%`;

        // Colored dot
        ctx.beginPath();
        ctx.arc(lx + 5, PAD.top / 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = outcome.color;
        ctx.fill();

        ctx.font = "bold 11px sans-serif";
        ctx.fillStyle = "#ccc";
        ctx.textAlign = "left";
        ctx.fillText(label, lx + 13, PAD.top / 2 + 4);
        lx += ctx.measureText(label).width + 24;
      });

      ctx.restore();
    },
    [filteredOutcomes, toCanvasX, toCanvasY, toDataX, xDomain, timeRange]
  );

  // ---- Animation loop ---------------------------------------------------------

  useEffect(() => {
    mountTimeRef.current = performance.now();
    animatingRef.current = true;
    setIsLoaded(false);

    const loop = (now: number) => {
      const elapsed = now - mountTimeRef.current;
      const progress = Math.min(1, elapsed / ANIMATION_DURATION);
      const easedProgress = easeOutCubic(progress);

      const dt = now - lastFrameRef.current;
      lastFrameRef.current = now;
      pulsePhaseRef.current += dt * 0.004; // ~4 rad/s

      draw(easedProgress, pulsePhaseRef.current, hoverX);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        animatingRef.current = false;
        setIsLoaded(true);
        // Continue pulsing after animation
        const pulse = (ts: number) => {
          const dt2 = ts - lastFrameRef.current;
          lastFrameRef.current = ts;
          pulsePhaseRef.current += dt2 * 0.004;
          draw(1, pulsePhaseRef.current, hoverX);
          rafRef.current = requestAnimationFrame(pulse);
        };
        rafRef.current = requestAnimationFrame(pulse);
      }
    };

    lastFrameRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredOutcomes, canvasSize, timeRange]);

  // Redraw on hover change (avoids re-triggering full animation)
  useEffect(() => {
    if (animatingRef.current) return;
    draw(1, pulsePhaseRef.current, hoverX);
  }, [hoverX, draw]);

  // ---- ResizeObserver --------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        setCanvasSize({ w: Math.floor(width), h: height });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [height]);

  // ---- Canvas HiDPI sizing ---------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;
    canvas.style.width = `${canvasSize.w}px`;
    canvas.style.height = `${canvasSize.h}px`;
  }, [canvasSize]);

  // ---- Hover / tooltip helpers -----------------------------------------------

  const getHoverData = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      const W = canvasSize.w;
      if (cx < PAD.left || cx > W - PAD.right) return null;
      return { cx, cy };
    },
    [canvasSize.w]
  );

  const buildTooltip = useCallback(
    (cx: number, cy: number) => {
      const W = canvasSize.w;
      const ts = toDataX(cx, W);
      const values = filteredOutcomes
        .filter((o) => o.data.length >= 1)
        .map((o) => {
          let value = o.data[0].value;
          for (let i = 0; i < o.data.length - 1; i++) {
            if (ts >= o.data[i].timestamp && ts <= o.data[i + 1].timestamp) {
              value = o.data[i].value;
              break;
            }
            if (ts > o.data[o.data.length - 1].timestamp) {
              value = o.data[o.data.length - 1].value;
            }
          }
          return { name: o.name, color: o.color, value: Math.round(value) };
        });

      // Tooltip position: clamp to canvas bounds
      const tx = Math.min(cx + 12, W - 180);
      return { x: tx, y: Math.max(PAD.top, cy - 20), ts, values };
    },
    [canvasSize.w, filteredOutcomes, toDataX]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getHoverData(e.clientX, e.clientY);
      if (!pos) {
        setHoverX(null);
        setTooltip(null);
        return;
      }
      setHoverX(pos.cx);
      if (showTooltip) setTooltip(buildTooltip(pos.cx, pos.cy));
    },
    [getHoverData, buildTooltip, showTooltip]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverX(null);
    setTooltip(null);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const pos = getHoverData(touch.clientX, touch.clientY);
      if (!pos) return;
      setHoverX(pos.cx);
      if (showTooltip) setTooltip(buildTooltip(pos.cx, pos.cy));
    },
    [getHoverData, buildTooltip, showTooltip]
  );

  const handleTouchEnd = useCallback(() => {
    setHoverX(null);
    setTooltip(null);
  }, []);

  // ---- Time range change resets animation ------------------------------------

  const handleTimeRange = (range: TimeRange) => {
    setTimeRange(range);
    setHoverX(null);
    setTooltip(null);
  };

  // ---- Render ----------------------------------------------------------------

  return (
    <div ref={containerRef} className={`relative w-full select-none ${className}`}>
      {/* Time range selector */}
      {showTimeRange && (
        <div
          className="absolute top-0 right-0 z-10 flex gap-1 pr-1 pt-1"
          style={{ top: 4, right: 4 }}
        >
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => handleTimeRange(r)}
              className="px-2 py-0.5 rounded-full text-xs font-mono transition-colors"
              style={
                timeRange === r
                  ? { background: "#00ff88", color: "#000", fontWeight: 700 }
                  : { background: "transparent", color: "#666" }
              }
              aria-pressed={timeRange === r}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {!isLoaded && (
        <div
          className="absolute inset-0 rounded-lg animate-pulse"
          style={{ background: "#111", zIndex: 5 }}
        />
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        aria-label="Prediction market probability chart"
        role="img"
      />

      {/* Tooltip */}
      {showTooltip && tooltip && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg px-3 py-2 text-xs"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            background: "rgba(17,17,17,0.95)",
            border: "1px solid rgba(0,255,136,0.2)",
            minWidth: 140,
            boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
          }}
        >
          <div className="mb-1.5 font-mono text-gray-400">
            {formatTooltipDate(tooltip.ts)}
          </div>
          {tooltip.values.map((v) => (
            <div key={v.name} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: v.color }}
                />
                <span className="text-gray-300">{v.name}</span>
              </div>
              <span className="font-bold" style={{ color: v.color }}>
                {v.value}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
