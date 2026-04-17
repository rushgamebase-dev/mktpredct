"use client";

import React from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Clock, X, Zap, Coins } from "lucide-react";
import type { MarketProposal } from "@rush/shared";
import { useProposals, useProposerEarnings } from "@/hooks/useProposals";
import { formatAddress } from "@/lib/format";

import { formatEther } from "viem";

function formatWeiToEth(wei: string): string {
  try {
    const eth = formatEther(BigInt(wei));
    const n = Number(eth);
    return n < 0.0001 ? "0" : n.toFixed(4);
  } catch {
    return "0";
  }
}

export default function MyProposalsPage() {
  const { address, isConnected } = useAccount();
  const { data: earnings } = useProposerEarnings(address);
  const { data: proposals, isLoading } = useProposals({
    proposer: address?.toLowerCase(),
    pageSize: 50,
  });

  if (!isConnected || !address) {
    return (
      <div className="py-12 text-center animate-fade-in-up">
        <p className="text-sm text-gray-400 mb-3">Connect your wallet to view your proposals</p>
        <button
          className="btn-primary rounded-xl px-6 py-3 text-sm font-bold"
          onClick={() => window.dispatchEvent(new CustomEvent("rush:open-connect"))}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <Link
        href="/proposals"
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Proposals
      </Link>

      <h1 className="text-xl font-black text-white mb-4">My Proposals</h1>

      {/* Earnings card */}
      {earnings && (
        <div className="card p-4 mb-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Earned</div>
              <div className="text-lg font-black tabular" style={{ color: "#00ff88" }}>
                {formatWeiToEth(earnings.totalEarned)} ETH
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Pending</div>
              <div className="text-lg font-black tabular" style={{ color: "#ffc828" }}>
                {formatWeiToEth(earnings.totalPending)} ETH
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Proposals</div>
              <div className="text-lg font-black tabular text-white">
                {earnings.approvedCount}/{earnings.proposalsCount}
                <span className="text-xs text-gray-500 ml-1">approved</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && proposals?.proposals.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500 mb-2">You haven't proposed any markets yet</p>
          <Link href="/propose" className="btn-primary inline-block rounded-lg px-4 py-2 text-xs font-bold">
            Propose Your First Market
          </Link>
        </div>
      )}

      {/* List */}
      {proposals && proposals.proposals.length > 0 && (
        <div className="space-y-3">
          {proposals.proposals.map((p) => (
            <MyProposalCard key={p.id} proposal={p} />
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="mt-6 text-center">
        <Link href="/propose" className="text-xs font-bold" style={{ color: "#00ff88" }}>
          + Propose Another Market
        </Link>
      </div>
    </div>
  );
}

function MyProposalCard({ proposal }: { proposal: MarketProposal }) {
  const statusColor =
    proposal.status === "approved" ? "#00ff88" : proposal.status === "rejected" ? "#ff4444" : "#ffc828";
  const StatusIcon = proposal.status === "approved" ? Check : proposal.status === "rejected" ? X : Clock;
  const href =
    proposal.status === "approved" && proposal.marketAddress
      ? `/markets/${proposal.marketAddress}`
      : `/proposals/${proposal.id}`;

  return (
    <Link href={href}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-4 transition-all hover:border-white/10 cursor-pointer"
      >
        <div className="flex items-center justify-between mb-1">
          <span
            className="flex items-center gap-1 text-[10px] font-bold uppercase"
            style={{ color: statusColor }}
          >
            <StatusIcon className="h-3 w-3" />
            {proposal.status}
          </span>
          {proposal.status === "approved" && (
            <span className="flex items-center gap-1 text-[10px]" style={{ color: "#00ff88" }}>
              Live <ArrowRight className="h-3 w-3" />
            </span>
          )}
        </div>
        <h3 className="text-sm font-bold text-white leading-tight line-clamp-1">
          {proposal.question}
        </h3>
        <div className="mt-1 text-[10px] text-gray-600">
          {proposal.labels.join(" / ")} · submitted {new Date(proposal.createdAt * 1000).toLocaleDateString()}
        </div>
      </motion.div>
    </Link>
  );
}
