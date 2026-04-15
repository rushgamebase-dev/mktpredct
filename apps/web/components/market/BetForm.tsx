"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAccount, useBalance, useSwitchChain } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { formatEther, parseEther } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import { OUTCOME_COLORS } from "@rush/shared";
import { useBet } from "@/hooks/useBet";
import { base } from "@/lib/wagmi";
import { AlertCircle, Check, ExternalLink, Loader2 } from "lucide-react";

interface BetFormProps {
  marketAddress: string;
  labels: string[];
  odds: number[];
  status: string;
  totalPool?: string;
  totalPerOutcome?: string[];
}

// 5% protocol fee (matches Market.sol feeBps)
const FEE_BPS = 500;
const MIN_BET_ETH = 0.001;
// Keep some ETH aside for gas on the bet tx
const GAS_MARGIN_WEI = parseEther("0.002");

export default function BetForm({
  marketAddress,
  labels,
  odds,
  status,
  totalPool,
  totalPerOutcome,
}: BetFormProps) {
  const { address: walletAddress, isConnected, chain } = useAccount();
  const chainId = chain?.id;
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: balance } = useBalance({ address: walletAddress });
  const queryClient = useQueryClient();
  const {
    placeBet,
    hash,
    isWalletOpen,
    isSimulating,
    isConfirming,
    isPending,
    isSuccess,
    error,
    reset,
  } = useBet(marketAddress);

  const [selectedOutcome, setSelectedOutcome] = useState<number>(0);
  const [amount, setAmount] = useState("");
  // Captures the exact bet at submit time so the optimistic update doesn't
  // read stale values if the user edits inputs while the wallet is open.
  const pendingBetRef = useRef<{ amount: string; outcomeIndex: number } | null>(null);

  const isOpen = status === "open";
  const onWrongNetwork = isConnected && chainId != null && chainId !== base.id;

  // Optimistic update when tx is submitted (hash received, before on-chain confirm)
  useEffect(() => {
    if (!hash || !pendingBetRef.current || !totalPool || !totalPerOutcome) return;
    const { amount: pendingAmount, outcomeIndex: pendingOutcome } = pendingBetRef.current;
    console.log(`[BET_UI] optimistic_update | hash=${hash.slice(0, 10)} | outcome=${pendingOutcome} | amount=${pendingAmount}`);
    const betWei = parseEther(pendingAmount);
    const newPool = (BigInt(totalPool) + betWei).toString();
    const newPerOutcome = totalPerOutcome.map((v, i) =>
      i === pendingOutcome ? (BigInt(v) + betWei).toString() : v,
    );
    const pool = BigInt(newPool);
    const newOdds =
      pool === 0n
        ? newPerOutcome.map(() => 0)
        : newPerOutcome.map((v) => Math.round(Number((BigInt(v) * 10000n) / pool) / 100));

    queryClient.setQueryData(["market", marketAddress], (old: unknown) => {
      if (!old || typeof old !== "object") return old;
      return { ...old, totalPool: newPool, totalPerOutcome: newPerOutcome, odds: newOdds };
    });
  }, [hash, marketAddress, queryClient, totalPerOutcome, totalPool]);

  // Rollback optimistic update only if the tx actually had a hash (real
  // optimistic write happened). Errors before hash (wallet-rejection, simulate
  // failure) shouldn't force a REST refetch — WS is the source of truth.
  useEffect(() => {
    if (error && hash) {
      queryClient.invalidateQueries({ queryKey: ["market", marketAddress] });
    }
  }, [error, hash, queryClient, marketAddress]);

  const currentOdds = odds[selectedOutcome] ?? 50;
  const amtNum = parseFloat(amount) || 0;
  const grossReturn = amtNum > 0 && currentOdds > 0 ? (amtNum * 100) / currentOdds : 0;
  // Fee is taken from the pool at payout time, so the real user receive amount is net of fee
  const potentialReturn = (grossReturn * (10000 - FEE_BPS)) / 10000;
  const profit = potentialReturn - amtNum;
  const multiplier = currentOdds > 0 ? ((100 * (10000 - FEE_BPS)) / (currentOdds * 10000)).toFixed(2) : "---";

  const maxAvailable = balance && balance.value > GAS_MARGIN_WEI
    ? formatEther(balance.value - GAS_MARGIN_WEI)
    : "0";

  const belowMin = amtNum > 0 && amtNum < MIN_BET_ETH;
  const aboveBalance = balance ? parseEther(amount || "0") > balance.value : false;
  const canSubmit =
    !isPending &&
    amtNum >= MIN_BET_ETH &&
    !aboveBalance &&
    !onWrongNetwork;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    pendingBetRef.current = { amount, outcomeIndex: selectedOutcome };
    try {
      await placeBet(selectedOutcome, amount);
    } catch (err) {
      console.error("[BET_UI] submit_error", err);
    }
  };

  const handleReset = () => {
    reset();
    setAmount("");
    pendingBetRef.current = null;
    // Optional: reconcile with canonical chain state after a successful bet.
    // WS will have already applied the definitive update, so this is mostly a no-op.
    queryClient.invalidateQueries({ queryKey: ["market", marketAddress] });
  };

  if (!isConnected) {
    return (
      <div className="card p-6 flex flex-col items-center gap-3">
        <div className="text-center">
          <p className="text-sm font-bold text-gray-300">Ready to bet?</p>
          <p className="text-xs text-gray-500 mt-1">Connect your wallet to place a bet and win</p>
        </div>
        <button
          className="btn-primary w-full rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("rush:open-connect"));
          }}
        >
          Connect Wallet to Bet
        </button>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="card p-4">
        <p className="text-center text-sm text-gray-500">
          This market is no longer accepting bets
        </p>
      </div>
    );
  }

  if (onWrongNetwork) {
    return (
      <div className="card p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "#ffc828" }}>
          <AlertCircle className="h-4 w-4" />
          Wrong network — you are on chain {chainId}
        </div>
        <p className="text-xs text-gray-500">
          Switch to Base (chain {base.id}) to place bets on this market.
        </p>
        <button
          onClick={() => switchChain({ chainId: base.id })}
          disabled={isSwitching}
          className="btn-primary rounded-lg py-2 text-sm flex items-center justify-center gap-2"
        >
          {isSwitching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Switch to Base
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-gray-300">Place Bet</h3>

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <div
            className={`grid gap-2 ${labels.length <= 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}
          >
            {labels.map((label, i) => {
              const color = OUTCOME_COLORS[i % OUTCOME_COLORS.length];
              const isSelected = selectedOutcome === i;
              const oddsVal = odds[i] ?? 0;
              const pct = Math.round(oddsVal);
              const netMult = oddsVal > 0
                ? ((100 * (10000 - FEE_BPS)) / (oddsVal * 10000)).toFixed(2)
                : "---";
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedOutcome(i)}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl py-3 px-2 text-xs font-bold transition-all"
                  style={{
                    background: isSelected ? color + "18" : "transparent",
                    border: `2px solid ${isSelected ? color : "var(--border)"}`,
                    color: isSelected ? color : "var(--muted)",
                  }}
                >
                  <span className="text-[11px] leading-tight">{label}</span>
                  <span className="tabular text-[10px] opacity-70">{pct}%</span>
                  <span className="text-lg font-black leading-none" style={{ color: isSelected ? color : "var(--muted)" }}>
                    {netMult}x
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-3">
          <div className="mb-1 flex items-baseline justify-between">
            <label className="text-xs text-gray-500">Amount (ETH)</label>
            {balance && (
              <span className="text-[10px] text-gray-600 tabular">
                Balance: {Number(formatEther(balance.value)).toFixed(4)} ETH
              </span>
            )}
          </div>
          <div className="relative rounded-xl" style={{ background: "#0d0d0d", border: "1px solid var(--border)" }}>
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-gray-500 select-none">Ξ</span>
            <input
              type="number"
              step="0.001"
              min={MIN_BET_ETH}
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isPending}
              className="w-full rounded-xl bg-transparent pl-10 pr-4 py-3 text-3xl font-bold text-center tabular text-white outline-none placeholder-gray-600"
            />
          </div>
          <div className="mt-2 flex gap-1.5">
            {["0.01", "0.05", "0.1", "0.5", "Max"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(v === "Max" ? maxAvailable : v)}
                disabled={v === "Max" && maxAvailable === "0"}
                className="flex-1 rounded-lg py-2 text-xs font-bold transition-colors hover:bg-white/10 disabled:opacity-40"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--border)",
                  color: "var(--primary)",
                }}
              >
                {v}
              </button>
            ))}
          </div>
          {belowMin && (
            <p className="mt-1.5 text-[10px]" style={{ color: "#ffc828" }}>
              Minimum bet is {MIN_BET_ETH} ETH
            </p>
          )}
          {aboveBalance && (
            <p className="mt-1.5 text-[10px]" style={{ color: "#ff4444" }}>
              Insufficient balance
            </p>
          )}
        </div>

        {amtNum > 0 && (
          <div
            className="mb-3 rounded-xl p-3"
            style={{ background: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.1)" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-400">Potential return</span>
              <span className="text-[10px] text-gray-500">Net {multiplier}x · 5% fee</span>
            </div>
            <div className="text-2xl font-bold tabular" style={{ color: "var(--primary)" }}>
              ~{potentialReturn.toFixed(4)} ETH
            </div>
            {profit > 0 && (
              <div className="text-xs tabular mt-0.5" style={{ color: "rgba(0,255,136,0.7)" }}>
                Profit: +{profit.toFixed(4)} ETH (after fee)
              </div>
            )}
          </div>
        )}

        <AnimatePresence mode="wait">
          {isSuccess ? (
            <motion.button
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={handleReset}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold"
              style={{
                background: "rgba(0,255,136,0.15)",
                color: "#00ff88",
                border: "1px solid rgba(0,255,136,0.3)",
              }}
            >
              <Check className="h-4 w-4" />
              Bet Confirmed! Bet Again?
            </motion.button>
          ) : isConfirming && hash ? (
            <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div
                className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold"
                style={{ background: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.25)" }}
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Tx pending...
              </div>
              <a
                href={`https://basescan.org/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 flex items-center justify-center gap-1 text-[10px] transition-colors hover:text-blue-300"
                style={{ color: "#3B82F6" }}
              >
                View on BaseScan <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </motion.div>
          ) : (
            <motion.button
              key="submit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="submit"
              disabled={!canSubmit}
              className="btn-primary flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm"
            >
              {isSimulating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking…
                </>
              ) : isWalletOpen ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for wallet...
                </>
              ) : (
                `Place Bet - ${amount || "0"} ETH on ${labels[selectedOutcome]}`
              )}
            </motion.button>
          )}
        </AnimatePresence>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 flex items-start gap-2 rounded-lg p-2 text-xs"
            style={{
              background: "rgba(255,68,68,0.08)",
              border: "1px solid rgba(255,68,68,0.2)",
              color: "#ff4444",
            }}
          >
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-2">
              {error.message?.includes("User rejected")
                ? "Transaction rejected by user"
                : error.message?.slice(0, 160) ?? "Transaction failed"}
            </span>
          </motion.div>
        )}
      </form>
    </div>
  );
}
