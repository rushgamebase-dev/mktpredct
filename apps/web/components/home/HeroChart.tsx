"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { MarketSummary, OddsPoint } from "@rush/shared";
import { OUTCOME_COLORS } from "@rush/shared";

// ---------------------------------------------------------------------------
// Time formatting helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 5) return "now";
  if (diff < 60) return `-${diff}s`;
  if (diff < 3600) return `-${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `-${Math.floor(diff / 3600)}h`;
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Smooth / Step line drawing helpers
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
// Types
// ---------------------------------------------------------------------------

interface HeroChartProps {
  markets: MarketSummary[];
  chartDataMap: Record<string, OddsPoint[]>;
  selectedMarket: string | null;
  onSelectMarket: (addr: string | null) => void;
  hoveredMarket: string | null;
  onHoverMarket: (addr: string | null) => void;
  height?: number;
}

interface LineDescriptor {
  key: string;
  label: string;
  color: string;
  points: { time: number; value: number }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortName(question: string, maxWords = 3): string {
  return question.split(/\s+/).slice(0, maxWords).join(" ");
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ---------------------------------------------------------------------------
// HeroChart
// ---------------------------------------------------------------------------

export default function HeroChart({
  markets,
  chartDataMap,
  selectedMarket,
  onSelectMarket,
  hoveredMarket,
  onHoverMarket,
  height = 500,
}: HeroChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [mounted, setMounted] = useState(false);

  // Animation
  const animRef = useRef<number | null>(null);
  const [animProgress, setAnimProgress] = useState(0);
  const pulseRef = useRef<number | null>(null);
  const [pulseProgress, setPulseProgress] = useState(0);

  // Mouse
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const [mouseX, setMouseX] = useState<number | null>(null);

  // ---------------------------------------------------------------------------
  // Padding
  // ---------------------------------------------------------------------------
  const padding = useMemo(() => ({ top: 24, right: 60, bottom: 40, left: 20 }), []);
  const chartWidth = dimensions.width - padding.left - padding.right;
  const chartHeight = dimensions.height - padding.top - padding.bottom;

  // ---------------------------------------------------------------------------
  // Build line descriptors
  // ---------------------------------------------------------------------------
  const lines: LineDescriptor[] = useMemo(() => {
    if (selectedMarket) {
      const m = markets.find((mk) => mk.address === selectedMarket);
      if (!m) return [];
      const chartPts = chartDataMap[selectedMarket] ?? [];
      return m.labels.map((label, idx) => ({
        key: `${selectedMarket}-${idx}`,
        label,
        color: OUTCOME_COLORS[idx % OUTCOME_COLORS.length],
        points: chartPts.map((p) => ({ time: p.timestamp, value: p.odds[idx] ?? 0 })),
      }));
    }
    return markets.map((m, mIdx) => {
      const chartPts = chartDataMap[m.address] ?? [];
      return {
        key: m.address,
        label: shortName(m.question),
        color: OUTCOME_COLORS[mIdx % OUTCOME_COLORS.length],
        points: chartPts.map((p) => ({ time: p.timestamp, value: p.odds[0] ?? 0 })),
      };
    });
  }, [markets, chartDataMap, selectedMarket]);

  // ---------------------------------------------------------------------------
  // Coordinate helpers
  // ---------------------------------------------------------------------------
  const allTimes = useMemo(() => {
    const ts: number[] = [];
    lines.forEach((l) => l.points.forEach((p) => ts.push(p.time)));
    if (ts.length === 0) return { min: 0, max: 1 };
    return { min: Math.min(...ts), max: Math.max(...ts) };
  }, [lines]);

  const getX = useCallback(
    (time: number) => {
      const range = allTimes.max - allTimes.min || 1;
      return padding.left + ((time - allTimes.min) / range) * chartWidth;
    },
    [allTimes, chartWidth, padding.left],
  );

  const getY = useCallback(
    (value: number) => padding.top + chartHeight - (value / 100) * chartHeight,
    [chartHeight, padding.top],
  );

  // ---------------------------------------------------------------------------
  // ResizeObserver
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setMounted(true);
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const rect = container.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ---------------------------------------------------------------------------
  // Draw animation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!mounted) return;
    setAnimProgress(0);
    const start = performance.now();
    const duration = 900;
    const animate = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(elapsed / duration, 1);
      setAnimProgress(1 - Math.pow(1 - p, 3));
      if (p < 1) animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [mounted, lines.length]);

  // ---------------------------------------------------------------------------
  // Pulse animation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!mounted) return;
    const animatePulse = (now: number) => {
      const cycle = (now % 2000) / 2000;
      setPulseProgress((Math.sin(cycle * Math.PI * 2 - Math.PI / 2) + 1) / 2);
      pulseRef.current = requestAnimationFrame(animatePulse);
    };
    pulseRef.current = requestAnimationFrame(animatePulse);
    return () => { if (pulseRef.current) cancelAnimationFrame(pulseRef.current); };
  }, [mounted]);

  // NO simulated real-time — chart updates only via real data from API/WebSocket

  // ---------------------------------------------------------------------------
  // Draw canvas — Polymarket style
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
    lines.forEach((l) => l.points.forEach((p) => {
      if (p.value < dataMin) dataMin = p.value;
      if (p.value > dataMax) dataMax = p.value;
    }));
    const yMin = Math.max(0, Math.floor((dataMin - 5) / 5) * 5);
    const yMax = Math.min(100, Math.ceil((dataMax + 5) / 5) * 5);
    const yRange = yMax - yMin || 1;
    const scaleY = (val: number) => padding.top + chartHeight - ((val - yMin) / yRange) * chartHeight;

    const isBinary = lines.length === 2 && selectedMarket !== null;

    // Grid
    const gridSteps = 4;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridSteps; i++) {
      const val = yMin + (i / gridSteps) * (yMax - yMin);
      const gy = scaleY(val);
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(padding.left, gy);
      ctx.lineTo(padding.left + chartWidth, gy);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw lines
    lines.forEach((line, lineIdx) => {
      if (line.points.length < 2) return;
      const visibleCount = Math.max(2, Math.floor(line.points.length * animProgress));
      const isHovered = hoveredMarket === line.key;
      const isAnyHovered = hoveredMarket !== null;

      // Polymarket: non-hovered → gray
      if (isAnyHovered && !isHovered) {
        ctx.strokeStyle = "#666666";
        ctx.globalAlpha = 0.35;
      } else {
        ctx.strokeStyle = isBinary ? BINARY_COLORS[lineIdx % 2] : line.color;
        ctx.globalAlpha = 1;
      }

      ctx.lineWidth = isHovered ? 2 : 1.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();

      const screenPts = [];
      for (let i = 0; i < visibleCount; i++) {
        screenPts.push({ x: getX(line.points[i].time), y: scaleY(line.points[i].value) });
      }

      if (isBinary) {
        drawStepLine(ctx, screenPts);
      } else {
        drawStepLine(ctx, screenPts);
      }
      ctx.stroke();

      // Endpoint dot (simple, no glow)
      if (visibleCount > 0 && mouseX === null) {
        const last = screenPts[screenPts.length - 1];
        const dotColor = isBinary ? BINARY_COLORS[lineIdx % 2] : line.color;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
        ctx.strokeStyle = dotColor + "50";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    });

    // Crosshair + dots
    if (mouseX !== null && mouseX >= padding.left && mouseX <= padding.left + chartWidth) {
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(mouseX, padding.top);
      ctx.lineTo(mouseX, padding.top + chartHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      const tRange = allTimes.max - allTimes.min || 1;
      const mouseTime = allTimes.min + ((mouseX - padding.left) / chartWidth) * tRange;

      lines.forEach((line, lineIdx) => {
        if (line.points.length < 2) return;
        let val = line.points[0].value;
        for (let i = 0; i < line.points.length; i++) {
          if (line.points[i].time <= mouseTime) val = line.points[i].value;
        }
        const iy = scaleY(val);
        const isHovered = hoveredMarket === line.key;
        const dotColor = isBinary ? BINARY_COLORS[lineIdx % 2] : line.color;

        if (isHovered) {
          ctx.beginPath();
          ctx.arc(mouseX, iy, 7, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(mouseX, iy, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#fff";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(mouseX, iy, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(mouseX, iy, 2, 0, Math.PI * 2);
          ctx.fillStyle = "#666";
          ctx.globalAlpha = 0.5;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      });
    }

    // Y-axis labels (canvas drawn, auto-scaled)
    ctx.font = "10px monospace";
    ctx.fillStyle = "#666";
    ctx.textAlign = "right";
    for (let i = 0; i <= gridSteps; i++) {
      const val = yMin + (i / gridSteps) * (yMax - yMin);
      ctx.fillText(`${Math.round(val)}%`, dimensions.width - 4, scaleY(val) + 4);
    }
  }, [dimensions, lines, animProgress, hoveredMarket, mouseX, selectedMarket, chartWidth, chartHeight, padding, getX, allTimes]);

  // ---------------------------------------------------------------------------
  // Mouse handlers
  // ---------------------------------------------------------------------------
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      mouseRef.current = { x: mx, y: my };

      if (mx >= padding.left && mx <= padding.left + chartWidth) {
        setMouseX(mx);
      } else {
        setMouseX(null);
      }

      // Auto-scale Y for hit detection
      let dataMin = 100, dataMax = 0;
      lines.forEach((l) => l.points.forEach((p) => {
        if (p.value < dataMin) dataMin = p.value;
        if (p.value > dataMax) dataMax = p.value;
      }));
      const yMin = Math.max(0, Math.floor((dataMin - 5) / 5) * 5);
      const yMax = Math.min(100, Math.ceil((dataMax + 5) / 5) * 5);
      const yRange = yMax - yMin || 1;
      const scaleY = (val: number) => padding.top + chartHeight - ((val - yMin) / yRange) * chartHeight;

      const tRange = allTimes.max - allTimes.min || 1;
      const mouseTime = allTimes.min + ((mx - padding.left) / chartWidth) * tRange;

      let nearest: string | null = null;
      let minDist = Infinity;
      lines.forEach((line) => {
        if (line.points.length < 2) return;
        let val = line.points[0].value;
        for (let i = 0; i < line.points.length; i++) {
          if (line.points[i].time <= mouseTime) val = line.points[i].value;
        }
        const lineY = scaleY(val);
        const dist = Math.abs(my - lineY);
        if (dist < minDist) { minDist = dist; nearest = line.key; }
      });

      onHoverMarket(minDist < 50 ? nearest : null);
    },
    [lines, onHoverMarket, padding, chartWidth, chartHeight, allTimes],
  );

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = null;
    setMouseX(null);
    onHoverMarket(null);
  }, [onHoverMarket]);

  const handleClick = useCallback(() => {
    if (hoveredMarket && !selectedMarket) onSelectMarket(hoveredMarket);
  }, [hoveredMarket, selectedMarket, onSelectMarket]);

  // ---------------------------------------------------------------------------
  // Hover labels (auto-scaled Y)
  // ---------------------------------------------------------------------------
  const hoverLabels = useMemo(() => {
    if (mouseX === null || chartWidth <= 0 || chartHeight <= 0) return [];

    let dataMin = 100, dataMax = 0;
    lines.forEach((l) => l.points.forEach((p) => {
      if (p.value < dataMin) dataMin = p.value;
      if (p.value > dataMax) dataMax = p.value;
    }));
    const yMin = Math.max(0, Math.floor((dataMin - 5) / 5) * 5);
    const yMax = Math.min(100, Math.ceil((dataMax + 5) / 5) * 5);
    const yRange = yMax - yMin || 1;
    const scaleY = (val: number) => padding.top + chartHeight - ((val - yMin) / yRange) * chartHeight;

    const tRange = allTimes.max - allTimes.min || 1;
    const mouseTime = allTimes.min + ((mouseX - padding.left) / chartWidth) * tRange;

    const isBinary = lines.length === 2 && selectedMarket !== null;

    const raw = lines
      .filter((l) => l.points.length >= 2)
      .map((line, lineIdx) => {
        let val = line.points[0].value;
        for (let i = 0; i < line.points.length; i++) {
          if (line.points[i].time <= mouseTime) val = line.points[i].value;
        }
        // Find actual timestamp closest to mouseTime
        let closestTs = line.points[0].time;
        for (let i = 0; i < line.points.length; i++) {
          if (line.points[i].time <= mouseTime) closestTs = line.points[i].time;
        }
        return {
          key: line.key,
          label: line.label,
          value: Math.round(val),
          color: isBinary ? BINARY_COLORS[lineIdx % 2] : line.color,
          y: scaleY(val),
          isBinary,
          relTime: formatRelativeTime(closestTs),
        };
      });

    raw.sort((a, b) => a.y - b.y);
    const labelH = 26;
    const gap = 3;
    for (let i = 1; i < raw.length; i++) {
      const overlap = (raw[i - 1].y + labelH / 2 + gap) - (raw[i].y - labelH / 2);
      if (overlap > 0) raw[i].y = raw[i - 1].y + labelH + gap;
    }
    return raw;
  }, [mouseX, lines, chartWidth, chartHeight, padding, allTimes, selectedMarket]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const isReady = mounted && dimensions.width > 0 && dimensions.height > 0;
  const isBinaryView = lines.length === 2 && selectedMarket !== null;

  return (
    <div className="relative" style={{ minHeight: height }}>
      {/* Back button */}
      {selectedMarket && (
        <button
          onClick={() => onSelectMarket(null)}
          className="absolute top-3 left-3 z-30 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all hover:bg-white/10"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#ccc" }}
        >
          <span style={{ fontSize: 14 }}>&larr;</span> Back to all markets
        </button>
      )}

      {/* Binary header */}
      {isBinaryView && isReady && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-6">
          <span className="text-sm font-bold" style={{ color: BINARY_COLORS[0] }}>{lines[0]?.label}</span>
          <span className="text-xs text-gray-500">vs</span>
          <span className="text-sm font-bold" style={{ color: BINARY_COLORS[1] }}>{lines[1]?.label}</span>
        </div>
      )}

      {/* Chart container */}
      <div
        ref={containerRef}
        className="w-full relative select-none cursor-crosshair"
        style={{ height }}
        onMouseMove={isReady ? handleMouseMove : undefined}
        onMouseLeave={isReady ? handleMouseLeave : undefined}
        onClick={isReady ? handleClick : undefined}
      >
        {!isReady && (
          <div className="absolute inset-0 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
        )}

        {isReady && (
          <>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ width: dimensions.width, height: dimensions.height }}
            />

            {/* Hover labels */}
            {mouseX !== null && hoverLabels.length > 0 && (
              <>
                {hoverLabels.map((hl, idx) => (
                  <div
                    key={hl.key}
                    className="absolute z-30 pointer-events-none"
                    style={{
                      left: mouseX > dimensions.width - 140 ? mouseX - 110 : mouseX + 14,
                      top: hl.y,
                      transform: "translateY(-50%)",
                      transition: "top 60ms ease-out",
                    }}
                  >
                    {hl.isBinary ? (
                      <div style={{ color: hl.color }}>
                        <div className="text-[11px] font-medium">{hl.label}</div>
                        <div className="text-[26px] font-black leading-none">{hl.value}%</div>
                      </div>
                    ) : (
                      <div className="rounded-md whitespace-nowrap"
                        style={{ backgroundColor: hl.color, color: "#000", boxShadow: `0 2px 8px ${hl.color}40` }}>
                        <div className="px-2 py-0.5 text-[11px] font-bold">{hl.label} {hl.value}%</div>
                        {idx === 0 && <div className="px-2 pb-0.5 text-[9px] opacity-50">{hl.relTime}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* Endpoint labels (when not hovering) */}
            {mouseX === null && lines.filter((l) => l.points.length > 0).map((line, lineIdx) => {
              const lastPt = line.points[line.points.length - 1];
              // Recompute auto-scale for positioning
              let dMin = 100, dMax = 0;
              lines.forEach((l) => l.points.forEach((p) => { if (p.value < dMin) dMin = p.value; if (p.value > dMax) dMax = p.value; }));
              const yMin = Math.max(0, Math.floor((dMin - 5) / 5) * 5);
              const yMax = Math.min(100, Math.ceil((dMax + 5) / 5) * 5);
              const yRange = yMax - yMin || 1;
              const ey = padding.top + chartHeight - ((lastPt.value - yMin) / yRange) * chartHeight;
              const ex = getX(lastPt.time);
              const dotColor = isBinaryView ? BINARY_COLORS[lineIdx % 2] : line.color;
              return (
                <div
                  key={line.key}
                  className="absolute z-20 pointer-events-none transition-all duration-150"
                  style={{ left: Math.min(ex + 8, dimensions.width - 110), top: ey, transform: "translateY(-50%)" }}
                >
                  <div
                    className="px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap"
                    style={{ backgroundColor: dotColor + "20", color: dotColor, border: `1px solid ${dotColor}30` }}
                  >
                    {line.label} {Math.round(lastPt.value)}%
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
