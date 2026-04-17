import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// Server-side only — safe to use the production API URL directly.
// NEXT_PUBLIC_API_URL may not be set in Vercel env vars, causing localhost
// fallback which breaks on Edge. This route never runs in the browser.
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  "https://rush-api-production.up.railway.app";

function formatDeadline(deadline: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = deadline - now;
  if (diff <= 0) return "Ended";
  if (diff < 3600) return `${Math.floor(diff / 60)}m left`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h left`;
  return `${Math.floor(diff / 86400)}d left`;
}

function formatPool(weiStr: string): string {
  const wei = BigInt(weiStr);
  if (wei === 0n) return "";
  const eth = Number(wei) / 1e18;
  if (eth >= 1) return `${eth.toFixed(2)} ETH pool`;
  if (eth >= 0.01) return `${eth.toFixed(3)} ETH pool`;
  return "";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;

  let market: {
    question: string;
    labels: string[];
    odds: number[];
    deadline: number;
    totalPool: string;
    status: string;
    proposerAddress?: string | null;
  };

  try {
    const res = await fetch(`${API_URL}/api/markets/${address}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error("not found");
    market = await res.json();
  } catch {
    return new Response("Market not found", { status: 404 });
  }

  const q = market.question;
  const yesLabel = market.labels[0] ?? "Yes";
  const noLabel = market.labels[1] ?? "No";
  const yesOdds = Math.round(market.odds[0] ?? 50);
  const noOdds = Math.round(market.odds[1] ?? 50);
  const timer = formatDeadline(market.deadline);
  const pool = formatPool(market.totalPool);
  const isLive = market.status === "open";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(180deg, #0d0d0d 0%, #111111 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "60px 80px",
          position: "relative",
        }}
      >
        {/* Top bar: branding + status */}
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 80,
            right: 80,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 900,
                letterSpacing: "0.15em",
                color: "#00ff88",
              }}
            >
              RUSH
            </div>
            <div style={{ fontSize: 16, color: "#666" }}>Prediction Markets</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {isLive && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(0,255,136,0.1)",
                  border: "1px solid rgba(0,255,136,0.3)",
                  borderRadius: 20,
                  padding: "4px 14px",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#00ff88",
                }}
              >
                ● LIVE
              </div>
            )}
            {timer !== "Ended" && (
              <div style={{ fontSize: 16, fontWeight: 700, color: "#999" }}>
                ⏱ {timer}
              </div>
            )}
          </div>
        </div>

        {/* Question — large, centered */}
        <div
          style={{
            fontSize: q.length > 60 ? 42 : q.length > 40 ? 48 : 56,
            fontWeight: 900,
            color: "#ffffff",
            textAlign: "center",
            lineHeight: 1.2,
            maxWidth: 1000,
            marginBottom: 48,
          }}
        >
          {q}
        </div>

        {/* YES vs NO split */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 60,
            marginBottom: 32,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#00ff88",
                letterSpacing: "0.1em",
                marginBottom: 4,
              }}
            >
              {yesLabel.toUpperCase()}
            </div>
            <div
              style={{
                fontSize: 72,
                fontWeight: 900,
                color: "#00ff88",
                lineHeight: 1,
              }}
            >
              {yesOdds}%
            </div>
          </div>

          <div
            style={{
              width: 2,
              height: 80,
              background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.15), transparent)",
            }}
          />

          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#EF4444",
                letterSpacing: "0.1em",
                marginBottom: 4,
              }}
            >
              {noLabel.toUpperCase()}
            </div>
            <div
              style={{
                fontSize: 72,
                fontWeight: 900,
                color: "#EF4444",
                lineHeight: 1,
              }}
            >
              {noOdds}%
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: 600,
            height: 8,
            borderRadius: 4,
            display: "flex",
            overflow: "hidden",
            background: "rgba(255,255,255,0.06)",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: `${yesOdds}%`,
              height: "100%",
              background: "rgba(0,255,136,0.6)",
            }}
          />
          <div
            style={{
              width: `${noOdds}%`,
              height: "100%",
              background: "rgba(239,68,68,0.6)",
            }}
          />
        </div>

        {/* Bottom: pool + CTA */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: 80,
            right: 80,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 16, color: "#666" }}>
            {pool && `${pool} · `}markets.rushgame.vip
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "#00ff88",
              background: "rgba(0,255,136,0.1)",
              border: "1px solid rgba(0,255,136,0.3)",
              borderRadius: 12,
              padding: "8px 24px",
            }}
          >
            Take a side →
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
