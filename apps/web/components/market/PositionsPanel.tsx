"use client";

import React from "react";
import { useAccount } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { OUTCOME_COLORS } from "@rush/shared";
import { usePositions } from "@/hooks/usePositions";
import { useClaim } from "@/hooks/useClaim";
import { formatEth } from "@/lib/format";
import { Loader2, Check, Gift } from "lucide-react";

interface PositionsPanelProps {
  marketAddress: string;
  labels: string[];
  status: string;
  winningOutcome: number | null;
}

export default function PositionsPanel({
  marketAddress,
  labels,
  status,
  winningOutcome,
}: PositionsPanelProps) {
  const { isConnected } = useAccount();
  const { data: positions, isLoading } = usePositions(marketAddress);
  const { claim, isPending: claimPending, isSuccess: claimSuccess, error: claimError, reset: claimReset } = useClaim(marketAddress);

  if (!isConnected) return null;

  if (isLoading) {
    return (
      <div className="card p-4">
        <div className="skeleton h-4 w-32 mb-3" />
        <div className="space-y-2">
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-10 w-full" />
        </div>
      </div>
    );
  }

  if (!positions || positions.positions.length === 0) return null;

  const hasClaimable = BigInt(positions.claimable) > BigInt(0);
  const isResolved = status === "resolved";

  return (
    <div className="card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-300">
        <Gift className="h-4 w-4" />
        Your Positions
      </h3>

      {/* Position rows */}
      <div className="space-y-2">
        {positions.positions.map((pos) => {
          const color = OUTCOME_COLORS[pos.outcomeIndex % OUTCOME_COLORS.length];
          const isWinner = winningOutcome !== null && pos.outcomeIndex === winningOutcome;
          return (
            <motion.div
              key={pos.outcomeIndex}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: pos.outcomeIndex * 0.05 }}
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{
                background: isWinner ? color + "15" : "rgba(255,255,255,0.02)",
                border: `1px solid ${isWinner ? color + "40" : "var(--border)"}`,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: color }}
                />
                <span className="text-xs font-semibold text-gray-300">
                  {pos.label || labels[pos.outcomeIndex] || `Outcome ${pos.outcomeIndex}`}
                </span>
                {isWinner && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                    style={{ background: color + "20", color }}
                  >
                    WINNER
                  </span>
                )}
              </div>
              <span className="text-xs font-bold tabular" style={{ color }}>
                {formatEth(pos.amount)}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Total */}
      <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2">
        <span className="text-xs text-gray-500">Total bet</span>
        <span className="text-xs font-bold text-gray-300 tabular">
          {formatEth(positions.totalBet)}
        </span>
      </div>

      {/* Claim section */}
      {isResolved && hasClaimable && !positions.claimed && (
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-gray-500">Claimable</span>
            <span className="text-sm font-bold tabular" style={{ color: "var(--primary)" }}>
              {formatEth(positions.claimable)}
            </span>
          </div>

          <AnimatePresence mode="wait">
            {claimSuccess ? (
              <motion.div
                key="claimed"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold"
                style={{
                  background: "rgba(0,255,136,0.1)",
                  color: "#00ff88",
                  border: "1px solid rgba(0,255,136,0.2)",
                }}
              >
                <Check className="h-3.5 w-3.5" />
                Claimed successfully!
              </motion.div>
            ) : (
              <motion.button
                key="claim-btn"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => claim()}
                disabled={claimPending}
                className="btn-primary flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs"
              >
                {claimPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Claiming...
                  </>
                ) : (
                  <>
                    <Gift className="h-3.5 w-3.5" />
                    Claim {formatEth(positions.claimable)}
                  </>
                )}
              </motion.button>
            )}
          </AnimatePresence>

          {claimError && (
            <p className="mt-1 text-[10px] text-red-400">
              {claimError.message?.includes("User rejected")
                ? "Transaction rejected"
                : "Claim failed"}
            </p>
          )}
        </div>
      )}

      {positions.claimed && (
        <div className="mt-3 flex items-center justify-center gap-1 rounded-lg py-2 text-xs text-gray-500"
          style={{ background: "rgba(255,255,255,0.02)" }}
        >
          <Check className="h-3 w-3" />
          Already claimed
        </div>
      )}
    </div>
  );
}
