"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { OddsPoint } from "@rush/shared";
import { OUTCOME_COLORS } from "@rush/shared";
import { Maximize2, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function drawSmoothLine(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) { ctx.lineTo(pts[1].x, pts[1].y); return; }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = 0.3;
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) * t, p1.y + (p2.y - p0.y) * t,
      p2.x - (p3.x - p1.x) * t, p2.y - (p3.y - p1.y) * t,
      p2.x, p2.y,
    );
  }
}

function drawStepLine(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
  }
}

const BINARY_COLORS = ["#3B82F6", "#EF4444"] as const;

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

type TimeRange = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "1H", label: "1H" }, { value: "6H", label: "6H" }, { value: "1D", label: "1D" },
  { value: "1W", label: "1W" }, { value: "1M", label: "1M" }, { value: "ALL", label: "ALL" },
];

const TIME_RANGE_MS: Record<TimeRange, number> = {
  "1H": 3600, "6H": 21600, "1D": 86400, "1W": 604800, "1M": 2592000, ALL: Infinity,
};

interface OutcomeData {
  id: string; name: string; color: string;
  data: { time: number; value: number }[];
}

interface ChartAnnotation {
  timestamp: number;
  label: string;
  color?: string;
}

interface InteractiveChartProps {
  points: OddsPoint[]; labels: string[]; colors?: string[];
  annotations?: ChartAnnotation[];
  height?: number; showTimeRange?: boolean; defaultTimeRange?: TimeRange; className?: string;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}
function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function formatRelativeTime(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 5) return "now";
  if (diff < 60) return `-${diff}s`;
  if (diff < 3600) return `-${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `-${Math.floor(diff / 3600)}h`;
  return formatDate(ts);
}
function formatRelativeXLabel(ts: number, range: TimeRange): string {
  if (range === "1H" || range === "6H") return formatRelativeTime(ts);
  if (range === "1D") return formatTime(ts);
  return formatDate(ts);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InteractiveChart({
  points, labels, colors: colorsProp, annotations: annotationsProp,
  height = 320, showTimeRange = true, defaultTimeRange = "ALL", className = "",
}: InteractiveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [mounted, setMounted] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const pulseRef = useRef<number | null>(null);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [pulseProgress, setPulseProgress] = useState(0);
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>(defaultTimeRange);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const resolvedColors = colorsProp || labels.map((_, i) => OUTCOME_COLORS[i % OUTCOME_COLORS.length]);

  const outcomes: OutcomeData[] = useMemo(() => {
    if (points.length === 0 || labels.length === 0) return [];
    return labels.map((label, idx) => ({
      id: `outcome-${idx}`, name: label,
      color: resolvedColors[idx] || OUTCOME_COLORS[idx % OUTCOME_COLORS.length],
      data: points.map((p) => ({ time: p.timestamp, value: p.odds[idx] ?? 0 })),
    }));
  }, [points, labels, resolvedColors]);

  const filteredOutcomes = useMemo(() => {
    if (selectedTimeRange === "ALL" || outcomes.length === 0) return outcomes;
    const cutoff = Math.floor(Date.now() / 1000) - TIME_RANGE_MS[selectedTimeRange];
    return outcomes.map((o) => ({ ...o, data: o.data.filter((d) => d.time >= cutoff) }));
  }, [outcomes, selectedTimeRange]);

  const maxDataPoints = useMemo(() => Math.max(...filteredOutcomes.map((o) => o.data.length), 1), [filteredOutcomes]);
  const isBinary = filteredOutcomes.length === 2;

  const padding = useMemo(() => ({ top: isBinary ? 48 : 20, right: 50, bottom: 45, left: 16 }), [isBinary]);
  const chartWidth = dimensions.width - padding.left - padding.right;
  const chartHeight = dimensions.height - padding.top - padding.bottom;

  // Stats
  const chartStats = useMemo(() => {
    if (filteredOutcomes.length === 0 || filteredOutcomes[0].data.length === 0)
      return { high: 0, low: 0, current: 0, change: 0 };
    const vals = filteredOutcomes[0].data.map((d) => d.value);
    const current = vals[vals.length - 1] ?? 0;
    return { high: Math.max(...vals), low: Math.min(...vals), current, change: current - (vals[0] ?? 0) };
  }, [filteredOutcomes]);

  // ResizeObserver
  useEffect(() => {
    setMounted(true);
    const container = containerRef.current;
    if (!container) return;
    const update = () => { const r = container.getBoundingClientRect(); setDimensions({ width: r.width, height: r.height }); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, [isFullscreen]);

  // Animation
  useEffect(() => {
    if (!mounted) return;
    setAnimationProgress(0);
    const start = performance.now();
    const animate = (now: number) => {
      const p = Math.min((now - start) / 1000, 1);
      setAnimationProgress(1 - Math.pow(1 - p, 3));
      if (p < 1) animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [mounted, filteredOutcomes]);

  // Pulse
  useEffect(() => {
    if (!mounted) return;
    const anim = (now: number) => {
      setPulseProgress((Math.sin(((now % 2000) / 2000) * Math.PI * 2 - Math.PI / 2) + 1) / 2);
      pulseRef.current = requestAnimationFrame(anim);
    };
    pulseRef.current = requestAnimationFrame(anim);
    return () => { if (pulseRef.current) cancelAnimationFrame(pulseRef.current); };
  }, [mounted]);

  const getPoint = useCallback(
    (idx: number, value: number, total: number) => ({
      x: padding.left + (idx / Math.max(total - 1, 1)) * chartWidth,
      y: padding.top + chartHeight - (value / 100) * chartHeight, // will be overridden by scaleY in draw
    }),
    [chartWidth, chartHeight, padding],
  );

  // ---------------------------------------------------------------------------
  // Draw — Polymarket style
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || chartWidth <= 0 || chartHeight <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // Auto-scale Y
    let dataMin = 100, dataMax = 0;
    filteredOutcomes.forEach((o) => o.data.forEach((p) => {
      if (p.value < dataMin) dataMin = p.value;
      if (p.value > dataMax) dataMax = p.value;
    }));
    const yMin = Math.max(0, Math.floor((dataMin - 5) / 5) * 5);
    const yMax = Math.min(100, Math.ceil((dataMax + 5) / 5) * 5);
    const yRange = yMax - yMin || 1;
    const scaleY = (val: number) => padding.top + chartHeight - ((val - yMin) / yRange) * chartHeight;

    // Grid
    const gridSteps = 4;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridSteps; i++) {
      const gy = scaleY(yMin + (i / gridSteps) * (yMax - yMin));
      ctx.beginPath(); ctx.setLineDash([4, 4]);
      ctx.moveTo(padding.left, gy); ctx.lineTo(padding.left + chartWidth, gy);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const visiblePoints = Math.floor(maxDataPoints * animationProgress);

    // Draw outcomes
    filteredOutcomes.forEach((outcome, oIdx) => {
      if (outcome.data.length === 0) return;
      const ptCount = Math.min(visiblePoints, outcome.data.length);
      const lineColor = isBinary ? BINARY_COLORS[oIdx % 2] : outcome.color;

      ctx.strokeStyle = lineColor;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();

      const screenPts = [];
      for (let i = 0; i < ptCount; i++) {
        screenPts.push({
          x: padding.left + (i / Math.max(outcome.data.length - 1, 1)) * chartWidth,
          y: scaleY(outcome.data[i].value),
        });
      }

      drawStepLine(ctx, screenPts);
      ctx.stroke();

      // Endpoint dot
      if (ptCount > 0 && hoverIndex === null) {
        const last = screenPts[screenPts.length - 1];
        ctx.beginPath(); ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
        ctx.strokeStyle = lineColor + "50"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#fff"; ctx.fill();
        ctx.beginPath(); ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = lineColor; ctx.fill();
      }
    });

    // Crosshair
    if (hoverIndex !== null) {
      const cx = padding.left + (hoverIndex / Math.max(maxDataPoints - 1, 1)) * chartWidth;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(cx, padding.top); ctx.lineTo(cx, padding.top + chartHeight); ctx.stroke();
      ctx.setLineDash([]);

      filteredOutcomes.forEach((outcome, oIdx) => {
        if (hoverIndex >= outcome.data.length) return;
        const px = padding.left + (hoverIndex / Math.max(outcome.data.length - 1, 1)) * chartWidth;
        const py = scaleY(outcome.data[hoverIndex].value);
        const dotColor = isBinary ? BINARY_COLORS[oIdx % 2] : outcome.color;

        // Horizontal guide line from dot to Y-axis
        ctx.strokeStyle = dotColor + "25";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(padding.left + chartWidth, py);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#fff"; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = dotColor; ctx.fill();
      });
    }

    // Annotations — bet markers on significant events
    if (annotationsProp && annotationsProp.length > 0 && filteredOutcomes.length > 0) {
      const primaryData = filteredOutcomes[0].data;
      annotationsProp.forEach((ann) => {
        // Find closest data point index by timestamp
        let closestIdx = 0;
        let closestDist = Infinity;
        primaryData.forEach((p, i) => {
          const dist = Math.abs(p.time - ann.timestamp);
          if (dist < closestDist) { closestDist = dist; closestIdx = i; }
        });
        if (closestDist > 3600) return; // skip if too far from any data point

        const ax = padding.left + (closestIdx / Math.max(primaryData.length - 1, 1)) * chartWidth;
        const ay = scaleY(primaryData[closestIdx]?.value ?? 50);

        // Small diamond marker
        const s = 4;
        ctx.fillStyle = ann.color ?? "#ffc828";
        ctx.beginPath();
        ctx.moveTo(ax, ay - s - 6); // above the line
        ctx.lineTo(ax + s, ay - 6);
        ctx.lineTo(ax, ay + s - 6);
        ctx.lineTo(ax - s, ay - 6);
        ctx.closePath();
        ctx.fill();

        // Label text above diamond
        ctx.font = "9px monospace";
        ctx.fillStyle = "#ffc828";
        ctx.textAlign = "center";
        ctx.fillText(ann.label, ax, ay - s - 10);
      });
    }

    // Y-axis labels
    ctx.font = "10px monospace";
    ctx.fillStyle = "#666";
    ctx.textAlign = "right";
    for (let i = 0; i <= gridSteps; i++) {
      const val = yMin + (i / gridSteps) * (yMax - yMin);
      ctx.fillText(`${Math.round(val)}%`, dimensions.width - 4, scaleY(val) + 4);
    }
  }, [dimensions, filteredOutcomes, maxDataPoints, animationProgress, pulseProgress, hoverIndex, hoverX, isBinary, chartWidth, chartHeight, padding]);

  // Mouse
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const relX = x - padding.left;
    const idx = Math.round((relX / chartWidth) * (maxDataPoints - 1));
    if (idx >= 0 && idx < maxDataPoints && relX >= 0 && relX <= chartWidth) {
      setHoverIndex(idx); setHoverX(x);
    } else {
      setHoverIndex(null); setHoverX(null);
    }
  }, [chartWidth, maxDataPoints, padding.left]);

  const handleMouseLeave = useCallback(() => { setHoverIndex(null); setHoverX(null); }, []);

  // Current values for labels
  const currentValues = useMemo(() => {
    return filteredOutcomes.map((o, oIdx) => {
      const idx = hoverIndex !== null && hoverIndex < o.data.length ? hoverIndex : o.data.length - 1;
      return {
        ...o, currentValue: o.data[idx]?.value || 0,
        displayColor: isBinary ? BINARY_COLORS[oIdx % 2] : o.color,
      };
    });
  }, [filteredOutcomes, hoverIndex, isBinary]);

  const hoverDate = useMemo(() => {
    if (hoverIndex === null || filteredOutcomes.length === 0) return null;
    const d = filteredOutcomes[0]?.data[hoverIndex];
    if (!d) return null;
    const rel = formatRelativeTime(d.time);
    return rel === "now" ? "now" : `${formatTime(d.time)} · ${rel}`;
  }, [hoverIndex, filteredOutcomes]);

  // X labels
  const xLabels = useMemo(() => {
    if (filteredOutcomes.length === 0 || filteredOutcomes[0].data.length < 2) return [];
    const data = filteredOutcomes[0].data;
    const count = Math.min(5, data.length);
    const step = Math.floor((data.length - 1) / (count - 1));
    return Array.from({ length: count }, (_, i) => {
      const idx = Math.min(i * step, data.length - 1);
      return {
        x: padding.left + (idx / Math.max(data.length - 1, 1)) * chartWidth,
        label: formatRelativeXLabel(data[idx].time, selectedTimeRange),
      };
    });
  }, [filteredOutcomes, chartWidth, padding.left, selectedTimeRange]);

  const isReady = mounted && dimensions.width > 0 && dimensions.height > 0;

  // Escape
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // Auto-scale for hover label Y positions
  const getScaledY = useCallback((val: number) => {
    let dMin = 100, dMax = 0;
    filteredOutcomes.forEach((o) => o.data.forEach((p) => { if (p.value < dMin) dMin = p.value; if (p.value > dMax) dMax = p.value; }));
    const yMin = Math.max(0, Math.floor((dMin - 5) / 5) * 5);
    const yMax = Math.min(100, Math.ceil((dMax + 5) / 5) * 5);
    const yRange = yMax - yMin || 1;
    return padding.top + chartHeight - ((val - yMin) / yRange) * chartHeight;
  }, [filteredOutcomes, padding.top, chartHeight]);

  const chartContent = (h: number) => (
    <div ref={containerRef} className={`w-full relative select-none cursor-crosshair ${className}`} style={{ height: h }}
      onMouseMove={isReady ? handleMouseMove : undefined} onMouseLeave={isReady ? handleMouseLeave : undefined}>
      {!mounted && <div className="absolute inset-0 skeleton rounded-lg" />}
      {mounted && points.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="text-center">
            <div className="text-2xl mb-2">📊</div>
            <p className="text-xs text-gray-500">No bets yet — chart appears after first bet</p>
          </div>
        </div>
      )}
      {isReady && points.length > 0 && (
        <>
          {/* Time range */}
          {showTimeRange && (
            <div className="absolute top-0 left-0 flex items-center gap-1 px-2 z-20" style={{ top: 8 }}>
              {TIME_RANGES.map((r) => (
                <button key={r.value} onClick={() => setSelectedTimeRange(r.value)}
                  className="px-2.5 py-1 text-xs font-bold rounded-md transition-all"
                  style={selectedTimeRange === r.value
                    ? { background: "#00ff88", color: "#000" }
                    : { background: "transparent", color: "#666" }}>
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {/* Fullscreen */}
          <button onClick={() => setIsFullscreen(!isFullscreen)}
            className="absolute top-2 right-2 z-20 p-1.5 rounded-md transition-colors hover:bg-white/10" style={{ color: "#666" }}>
            {isFullscreen ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          {/* Binary header */}
          {isBinary && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-6">
              <span className="text-sm font-bold" style={{ color: BINARY_COLORS[0] }}>{filteredOutcomes[0]?.name}</span>
              <span className="text-xs text-gray-500">vs</span>
              <span className="text-sm font-bold" style={{ color: BINARY_COLORS[1] }}>{filteredOutcomes[1]?.name}</span>
            </div>
          )}

          {/* Hover date */}
          {hoverDate && (
            <div className="absolute left-1/2 -translate-x-1/2 text-xs text-gray-400 font-mono z-30 pointer-events-none"
              style={{ top: isBinary ? 36 : (showTimeRange ? 36 : 4) }}>
              {hoverDate}
            </div>
          )}

          {/* Hover labels */}
          {hoverIndex !== null && (
            <>
              {(() => {
                const labelH = isBinary ? 50 : 28;
                const gap = 4;
                const hxPos = padding.left + (hoverIndex / Math.max(maxDataPoints - 1, 1)) * chartWidth;
                const sorted = currentValues.map((o) => ({
                  ...o,
                  naturalY: getScaledY(o.currentValue),
                  adjustedY: getScaledY(o.currentValue),
                })).sort((a, b) => a.naturalY - b.naturalY);

                for (let i = 1; i < sorted.length; i++) {
                  const overlap = (sorted[i - 1].adjustedY + labelH / 2 + gap) - (sorted[i].adjustedY - labelH / 2);
                  if (overlap > 0) sorted[i].adjustedY = sorted[i - 1].adjustedY + labelH + gap;
                }

                // Get time at hover for relative display
                const hoverTs = filteredOutcomes[0]?.data[hoverIndex]?.time ?? 0;
                const relTime = formatRelativeTime(hoverTs);

                return sorted.map((o, sortIdx) => (
                  <div key={o.id} className="absolute z-30 pointer-events-none"
                    style={{
                      left: hxPos > dimensions.width - 160 ? hxPos - 140 : hxPos + 14,
                      top: o.adjustedY, transform: "translateY(-50%)", transition: "top 60ms ease-out",
                    }}>
                    {isBinary ? (
                      <div style={{ color: o.displayColor }}>
                        <div className="text-[11px] font-medium">{o.name}</div>
                        <div className="text-[26px] font-black leading-none">{o.currentValue.toFixed(0)}%</div>
                        {sortIdx === 0 && <div className="text-[10px] text-gray-500 mt-0.5">{relTime}</div>}
                      </div>
                    ) : (
                      <div className="rounded-md whitespace-nowrap" style={{ backgroundColor: o.displayColor, color: "#000", boxShadow: `0 2px 8px ${o.displayColor}40` }}>
                        <div className="px-2 py-0.5 text-[11px] font-bold">{o.name} {o.currentValue.toFixed(0)}%</div>
                        {sortIdx === 0 && <div className="px-2 pb-0.5 text-[9px] opacity-60">{relTime}</div>}
                      </div>
                    )}
                  </div>
                ));
              })()}
            </>
          )}

          {/* Canvas */}
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-0"
            style={{ width: dimensions.width, height: dimensions.height }} />

          {/* Legend (not hovering) */}
          {hoverIndex === null && (
            <div className="absolute top-0 right-12 flex items-center gap-4 z-10" style={{ top: showTimeRange ? 10 : 4 }}>
              {currentValues.map((o) => (
                <div key={o.id} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: o.displayColor }} />
                  <span className="text-xs text-gray-500">{o.name}</span>
                  <span className="text-xs font-bold" style={{ color: o.displayColor }}>{o.currentValue.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}

          {/* X-axis */}
          {xLabels.length > 0 && (
            <div className="absolute left-0 right-0 text-[10px] text-gray-500 font-mono z-10"
              style={{ top: padding.top + chartHeight + 8 }}>
              {xLabels.map((l, i) => (
                <span key={i} className="absolute text-center" style={{ left: l.x, transform: "translateX(-50%)" }}>{l.label}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  // Stats
  const statsGrid = (
    <div className="grid grid-cols-4 gap-3 px-3 pb-3">
      {[
        { label: "High", value: chartStats.high, color: "#00ff88" },
        { label: "Low", value: chartStats.low, color: "#ff4444" },
        { label: "Current", value: chartStats.current, color: "#fff" },
        { label: "Change", value: chartStats.change, color: chartStats.change >= 0 ? "#00ff88" : "#ff4444" },
      ].map((s) => (
        <div key={s.label}>
          <span className="text-[10px] uppercase tracking-wider text-gray-500">{s.label}</span>
          <div className="text-sm font-bold tabular" style={{ color: s.color }}>
            {s.label === "Change" ? (s.value >= 0 ? "+" : "") : ""}{s.value.toFixed(s.label === "Change" ? 1 : 0)}%
          </div>
        </div>
      ))}
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="chart-fullscreen">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-gray-300">Probability Chart</span>
          <button onClick={() => setIsFullscreen(false)} className="p-2 rounded-lg hover:bg-white/10 text-gray-400">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1">{chartContent(window.innerHeight - 120)}</div>
        {statsGrid}
      </div>
    );
  }

  return <div>{chartContent(height)}{statsGrid}</div>;
}
