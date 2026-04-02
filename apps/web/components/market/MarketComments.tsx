"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import type { MarketDetail } from "@rush/shared";
import { formatAddress } from "@/lib/format";
import { MessageCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarketCommentsProps {
  market: MarketDetail;
  labels: string[];
  colors: string[];
}

interface FakeComment {
  address: string;
  initials: string;
  avatarColor: string;
  text: string;
  minutesAgo: number;
}

// ---------------------------------------------------------------------------
// Deterministic hash from a string — simple djb2
// ---------------------------------------------------------------------------

function hashStr(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ---------------------------------------------------------------------------
// Generate a fake Ethereum address from market address + index
// ---------------------------------------------------------------------------

function fakeAddress(marketAddr: string, index: number): string {
  const h = hashStr(marketAddr + String(index));
  // Build a pseudo-hex string deterministically
  const hex = h.toString(16).padStart(8, "0");
  const hex2 = hashStr(hex + String(index * 7)).toString(16).padStart(8, "0");
  const hex3 = hashStr(hex2 + "salt").toString(16).padStart(8, "0");
  const hex4 = hashStr(hex3 + "extra").toString(16).padStart(8, "0");
  const hex5 = hashStr(hex4 + "more").toString(16).padStart(8, "0");
  return `0x${(hex + hex2 + hex3 + hex4 + hex5).slice(0, 40)}`;
}

// ---------------------------------------------------------------------------
// Avatar colors palette
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  "#00ff88",
  "#ff4444",
  "#ffc828",
  "#5078ff",
  "#ff6b9d",
  "#a78bfa",
  "#38bdf8",
  "#fb923c",
];

// ---------------------------------------------------------------------------
// Generate comment text based on market data
// ---------------------------------------------------------------------------

function generateCommentText(
  market: MarketDetail,
  labels: string[],
  index: number,
): string {
  const primaryOdds = market.odds[0] ?? 50;
  const primaryLabel = labels[0] ?? "Yes";
  const underdogIdx = market.odds.indexOf(Math.min(...market.odds));
  const underdogLabel = labels[underdogIdx] ?? "No";

  const poolBig = BigInt(market.totalPool);
  const oneEth = BigInt("1000000000000000000");
  const isHighVolume = poolBig > oneEth;

  const now = Math.floor(Date.now() / 1000);
  const remaining = market.deadline - now;
  const isSoon = remaining > 0 && remaining < 3600; // less than 1 hour

  // Use index + hash to deterministically pick a comment variant
  const h = hashStr(market.address + String(index));
  const variant = h % 5;

  if (isSoon && variant < 2) {
    return "Running out of time. Last chance to get in.";
  }

  if (isHighVolume && variant === 2) {
    return "Volume picking up fast. Smart money is moving.";
  }

  if (primaryOdds > 70) {
    const templates = [
      `Strong conviction on ${primaryLabel}. This feels like free money.`,
      `${primaryLabel} at ${Math.round(primaryOdds)}% seems locked in. Not much edge left.`,
    ];
    return templates[h % templates.length];
  }

  if (primaryOdds > 55) {
    const templates = [
      `${primaryLabel} is leading but anything can happen. I'm in.`,
      `Leaning ${primaryLabel} here. The odds still have room to move.`,
    ];
    return templates[h % templates.length];
  }

  if (primaryOdds >= 45) {
    const templates = [
      `Market is split. Going contrarian on ${underdogLabel}.`,
      `50/50 vibes. This is where the real alpha is.`,
    ];
    return templates[h % templates.length];
  }

  // Primary is the underdog
  return `${primaryLabel} is trailing hard. Contrarian play or dead money?`;
}

// ---------------------------------------------------------------------------
// Build fake comments
// ---------------------------------------------------------------------------

function buildComments(
  market: MarketDetail,
  labels: string[],
): FakeComment[] {
  // Deterministic count: 3 or 4 based on market address hash
  const h = hashStr(market.address);
  const count = 3 + (h % 2); // 3 or 4

  const comments: FakeComment[] = [];

  for (let i = 0; i < count; i++) {
    const addr = fakeAddress(market.address, i);
    const colorIdx = hashStr(addr) % AVATAR_COLORS.length;
    const initial1 = addr.slice(2, 3).toUpperCase();
    const initial2 = addr.slice(3, 4).toUpperCase();

    comments.push({
      address: addr,
      initials: initial1 + initial2,
      avatarColor: AVATAR_COLORS[colorIdx],
      text: generateCommentText(market, labels, i),
      minutesAgo: 2 + hashStr(addr + "time") % 55, // 2-56 minutes ago
    });
  }

  return comments;
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

const commentVariant = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.35,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
};

// ---------------------------------------------------------------------------
// MarketComments
// ---------------------------------------------------------------------------

export default function MarketComments({
  market,
  labels,
  colors,
}: MarketCommentsProps) {
  const comments = useMemo(() => buildComments(market, labels), [market, labels]);

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="h-4 w-4" style={{ color: "#00ff88" }} />
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Community
        </h3>
        <span className="text-[10px] text-gray-600 ml-auto">
          {comments.length} comments
        </span>
      </div>

      {/* Comments list */}
      <div className="space-y-3">
        {comments.map((comment, i) => (
          <motion.div
            key={comment.address}
            variants={commentVariant}
            initial="hidden"
            animate="visible"
            custom={i}
            className="flex gap-2.5"
          >
            {/* Avatar circle */}
            <div
              className="shrink-0 flex items-center justify-center rounded-full"
              style={{
                width: 28,
                height: 28,
                background: comment.avatarColor + "20",
                border: `1px solid ${comment.avatarColor}40`,
              }}
            >
              <span
                className="text-[10px] font-bold"
                style={{ color: comment.avatarColor }}
              >
                {comment.initials}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-bold text-gray-400">
                  {formatAddress(comment.address)}
                </span>
                <span className="text-[10px] text-gray-600">
                  {comment.minutesAgo}m ago
                </span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                {comment.text}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
